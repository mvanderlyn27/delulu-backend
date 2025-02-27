import { GoogleGenerativeAI, } from "@google/generative-ai";
import { CharacterResponseSchema, StoryResponseSchema } from "./schema.js";
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import sharp from 'sharp';
import { Storage } from '@google-cloud/storage';
import crypto from 'crypto';

// Initialize dotenv
dotenv.config();

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

// Add headers for long-running requests
app.use((req, res, next) => {
  res.header('Connection', 'keep-alive');
  res.header('Keep-Alive', 'timeout=120');
  next();
});

// Initialize Gemini client
const GEMINI_MODEL = process.env.GEMINI_MODEL;
const IMAGEN_MODEL = process.env.IMAGEN_MODEL;
const FREE_MODE = process.env.FREE_MODE === 'true';
const API_KEY = FREE_MODE ? process.env.FREE_API_KEY : process.env.PAID_API_KEY;

const genAI = new GoogleGenerativeAI(API_KEY);
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
    "gender": "Male, Female, or Non Binary"
}`;

  try {
    console.log(`Generating character details for ${isImage ? 'image' : 'name'}: ${isImage ? 'Image Data' : input}`);
    const geminiModel = genAI.getGenerativeModel({ 
      model: GEMINI_MODEL,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: CharacterResponseSchema
      }
    });

    // Modify how we pass the content to generateContent
    const parts = [];
    parts.push({ text: prompt });
    
    if (isImage) {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: input.toString('base64')
        }
      });
    } else {
      parts.push({ text: `Character Name: ${input}` });
    }

    const result = await geminiModel.generateContent(parts);
    console.log('result', result);
    const response = result.response.text();
    if (!response) {
      console.error('Error: Empty or invalid response from Gemini API');
      return { response: null };
    }

    try {
      console.log('text', response);
      const characterData = JSON.parse(response);
      console.log('Successfully generated character details:', characterData);
      return { response: characterData };
    } catch (parseError) {
      console.error('Error parsing character data:', parseError);
      return { response: null };
    }
  } catch (error) {
    console.error('Error in character generation:', error);
    throw new Error(`Character generation failed: ${error.message}`);
  }
}

// API Routes
app.post('/generate-story-segment', async (req, res) => {
  // Set a longer timeout for the response
  res.setTimeout(120000); // 2 minute timeout

  try {
    console.log('Received story segment generation request');
    const { prompt } = req.body;
    const geminiModel = genAI.getGenerativeModel({ 
      model: GEMINI_MODEL,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: StoryResponseSchema,
      }
    });

    // Add a timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), 90000);
    });

    // Race between the actual request and timeout
    const result = await Promise.race([
      geminiModel.generateContent(prompt),
      timeoutPromise
    ]);

    const response = result.response.text();
    if (!response) {
      console.error('Error: Received null response from Gemini API');
      return res.json({ response: null });
    }

    console.log('response', response);
    let storyData = response;
    try {
      // storyData = JSON.parse(response);
      console.log('Successfully parsed story data');
    } catch (error) {
      console.error('Error parsing story response:', error);
      return res.json({ response: null });
    }

    if (storyData.story_state.new_location) {
      console.log('New location detected, checking image cache');
      let imageUrl = await getImageFromCache(storyData.story_state.location_description);

      if (!imageUrl) {
        console.log('Image not found in cache, generating new image');
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
            console.error('Error: Image generation failed - no image data received');
            storyData.story_images = [];
          }
        } catch (error) {
          console.error('Error generating or saving image:', error);
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

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Check Gemini API connectivity
    await geminiModel.generateContent('test');
    
    // Check Google Cloud Storage connectivity
    await bucket.exists();

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        gemini: 'connected',
        storage: 'connected'
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});