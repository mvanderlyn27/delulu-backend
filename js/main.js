require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sharp = require('sharp');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Storage } = require('./node_modules/@google-cloud/storage/build/cjs/src');
const crypto = require('crypto');

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

// Initialize Gemini client
const GEMINI_MODEL = process.env.GEMINI_MODEL;
const IMAGEN_MODEL = process.env.IMAGEN_MODEL;
const FREE_MODE = process.env.FREE_MODE === 'true';
const API_KEY = FREE_MODE ? process.env.FREE_API_KEY : process.env.PAID_API_KEY;

const genAI = new GoogleGenerativeAI(API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: GEMINI_MODEL });
const imagenModel = genAI.getGenerativeModel({ model: IMAGEN_MODEL });

// Initialize Google Cloud Storage
const storage = new Storage({
  projectId: process.env.GCS_PROJECT_ID,
  credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS)
});

const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);

// Configure bucket for public access
async function configureBucket() {
  try {
    await bucket.setMetadata({
      iamConfiguration: {
        publicAccessPrevention: null,
        uniformBucketLevelAccess: true
      }
    });

    const [policy] = await bucket.iam.getPolicy({ requestedPolicyVersion: 3 });
    policy.bindings = policy.bindings || [];
    policy.bindings.push({
      role: 'roles/storage.objectViewer',
      members: ['allUsers']
    });
    await bucket.iam.setPolicy(policy);

    await bucket.setCorsConfiguration([{
      origin: ['*'],
      responseHeader: ['Content-Type'],
      method: ['GET', 'HEAD', 'OPTIONS'],
      maxAgeSeconds: 3600
    }]);
  } catch (error) {
    console.error('Error configuring bucket:', error);
  }
}

configureBucket();

// Helper functions
function validateImage(buffer) {
  return sharp(buffer)
    .metadata()
    .then(() => true)
    .catch(() => false);
}

async function getImageFromCache(prompt) {
  const promptHash = crypto.createHash('md5').update(prompt).digest('hex');
  const blob = bucket.file(`${process.env.GCS_FOLDER_NAME}/${promptHash}.jpg`);
  
  try {
    const exists = await blob.exists();
    if (exists[0]) {
      return blob.publicUrl();
    }
    return null;
  } catch (error) {
    console.error('Error checking cache:', error);
    return null;
  }
}

async function saveImageToCache(prompt, imageBytes) {
  const promptHash = crypto.createHash('md5').update(prompt).digest('hex');
  const blob = bucket.file(`${process.env.GCS_FOLDER_NAME}/${promptHash}.jpg`);
  
  try {
    await blob.save(imageBytes, {
      contentType: 'image/jpeg',
      public: true
    });
    return blob.publicUrl();
  } catch (error) {
    console.error('Error saving to cache:', error);
    throw error;
  }
}

async function generateCharacterDetails(input, isImage = false) {
  const prompt = `Analyze the following ${isImage ? 'image' : 'character name'} and attempt to provide character details for a character. DO NOT HALLUCINATE FAKE PEOPLE/CHARACTERS. ONLY GO OFF INFORMATION YOU ACTUALLY KNOW IS TRUE. IF THE PERSON/CHARACTER ISN'T REAL, OR KNOWN FROM A REAL PEICE OF MEDIA, RETURN null.

Expected response format:
{
    "name": "Character's name",
    "age": "integer value representing age",
    "personality": array of strings, 1 word plus an emoji ie ["smart 🤓", "creative 🎨", "kind 🤗"],
    "occupation": "Character's job or role with an emoji after (return one job, the one they are best known for)",
    "gender": "Character's gender"
}`;

  try {
    const result = await geminiModel.generateContent([
      prompt,
      ...(isImage ? [{ inlineData: { data: input.toString('base64'), mimeType: 'image/jpeg' } }] : []),
      isImage ? '' : `Character Name: ${input}`
    ]);

    const response = result.response;
    if (!response || !response.text) {
      return { response: null };
    }

    try {
      const characterData = JSON.parse(response.text);
      return { response: characterData };
    } catch {
      return { response: null };
    }
  } catch (error) {
    throw new Error(`Character generation failed: ${error.message}`);
  }
}

// API Routes
app.post('/generate-story-segment', async (req, res) => {
  try {
    const { prompt } = req.body;
    const result = await geminiModel.generateContent(prompt);

    if (!result.response || !result.response.text) {
      console.error('Error: Received null response from Gemini API');
      return res.json({ response: null });
    }

    let storyData;
    try {
      storyData = JSON.parse(result.response.text);
    } catch (error) {
      console.error('Error parsing response:', error);
      return res.json({ response: null });
    }

    if (storyData.story_state.new_location) {
      let imageUrl = await getImageFromCache(storyData.story_state.location_description);

      if (!imageUrl) {
        const imagePrompt = `Generate a polaroid style image: ${storyData.story_state.location_description}. The scene should be empty with no people present.`;
        try {
          const imageResult = await imagenModel.generateImage({
            prompt: imagePrompt,
            aspectRatio: '3:4'
          });

          if (imageResult && imageResult.image) {
            imageUrl = await saveImageToCache(
              storyData.story_state.location_description,
              Buffer.from(imageResult.image, 'base64')
            );
            console.log('Image saved to GCS:', imageUrl);
            storyData.story_images = [{
              url: imageUrl,
              description: storyData.story_state.location_description
            }];
          } else {
            console.error('Error: Image generation failed');
            storyData.story_images = [];
          }
        } catch (error) {
          console.error('Error generating image:', error);
          storyData.story_images = [];
        }
      } else {
        console.log('Image found in GCS:', imageUrl);
        storyData.story_images = [{
          url: imageUrl,
          description: storyData.story_state.location_description
        }];
      }
    } else {
      storyData.story_images = [];
    }

    res.json({ response: storyData });
  } catch (error) {
    console.error('Error in generate-story-segment:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/generate-character-details-name', async (req, res) => {
  try {
    const result = await generateCharacterDetails(req.body.name, false);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const upload = multer();
app.post('/generate-character-details-image', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const isValid = await validateImage(req.file.buffer);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid image format' });
    }

    const result = await generateCharacterDetails(req.file.buffer, true);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});