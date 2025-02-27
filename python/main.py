from PIL import Image
from io import BytesIO
from fastapi import FastAPI, HTTPException, UploadFile, File
from typing import Optional, Union
import json
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from google import genai
from google.genai import types
from dotenv import load_dotenv
import os
import io
import uvicorn
from google.cloud import storage
import hashlib
from google.oauth2 import service_account
# Load environment variables
load_dotenv()

# Initialize client 
GEMINI_MODEL = os.getenv("GEMINI_MODEL") 
IMAGEN_MODEL = os.getenv("IMAGEN_MODEL") 
FREE_MODE = os.getenv("FREE_MODE") == "true"
gemini = genai.Client(api_key=os.getenv("FREE_API_KEY" if FREE_MODE else "PAID_API_KEY"))
imagen= genai.Client(api_key=os.getenv("FREE_API_KEY" if FREE_MODE else "PAID_API_KEY"))

# Initialize Google Cloud Storage

# Create credentials object from environment variables
credentials = service_account.Credentials.from_service_account_info(json.loads(os.getenv('GOOGLE_APPLICATION_CREDENTIALS')))

# Initialize storage client with credentials
storage_client = storage.Client(project=os.getenv("GCS_PROJECT_ID"), credentials=credentials)
bucket = storage_client.bucket(os.getenv("GCS_BUCKET_NAME"))

# Configure bucket for public access
bucket.iam_configuration.public_access_prevention = None
bucket.iam_configuration.uniform_bucket_level_access_enabled = True

# Set public viewing permissions using IAM
policy = bucket.get_iam_policy(requested_policy_version=3)
policy.bindings.append(
    {
        "role": "roles/storage.objectViewer",
        "members": ["allUsers"]
    }
)
bucket.set_iam_policy(policy)

# Configure CORS for the bucket
bucket.cors = [
    {
        'origin': ['*'],  # Replace with your frontend domain in production
        'responseHeader': ['Content-Type'],
        'method': ['GET', 'HEAD', 'OPTIONS'],
        'maxAgeSeconds': 3600
    }
]

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Data models
class Character(BaseModel):
    name: str
    age: Optional[int] = None
    gender: Optional[str] = None
    personality: Optional[List[str]] = None
    occupation: Optional[str] = None
    customElements: Optional[str] = None

class StoryConfig(BaseModel):
    theme: str
    focus: str
    setting: str
    time_period: str
    pov: str
    trope: str
    genre: str
    details: Optional[str] = None
    length: int 

class StoryInput(BaseModel):
    prompt: str

class CharacterNameRequest(BaseModel):
    name: str

class CharacterResponse(BaseModel):
    name: str
    age: int
    personality: List[str]
    occupation: str
    gender: str
class StoryChoices(BaseModel):
    text: str
    impact: str 
    tension_level: int

class StoryImage(BaseModel):
    url: str
    description: str 
class StoryState(BaseModel):
    location: str
    new_location: bool
    location_description: str
    active_plot_threads: List[str]
    unresolved_elements: List[str]
    story_phase: str
    emotional_tone: str
    current_tension: int
class StoryResponse(BaseModel):
    text: str
    choices: List[StoryChoices]
    current_tension: int
    story_state: StoryState
    story_images: List[StoryImage]
    story_over: bool

def validate_image(image_bytes):
    try:
        # Check if the BytesIO object has content
        if image_bytes.getbuffer().nbytes == 0:
            raise ValueError("Empty image data")
            
        # Try to open the image
        img = Image.open(image_bytes)
        # Verify the image
        img.verify()
        # Reset the buffer position
        image_bytes.seek(0)
        return True
    except Exception as e:
        print(f"Image validation failed: {str(e)}")
        return False

def get_image_from_cache(prompt: str) -> Optional[str]:
    # Create a hash of the prompt to use as the filename
    prompt_hash = hashlib.md5(prompt.encode()).hexdigest()
    blob = bucket.blob(f"{os.getenv('GCS_FOLDER_NAME')}/{prompt_hash}.jpg")
    
    if blob.exists():
        return blob.public_url
    return None

def save_image_to_cache(prompt: str, image_bytes: bytes) -> str:
    prompt_hash = hashlib.md5(prompt.encode()).hexdigest()
    blob = bucket.blob(f"{os.getenv('GCS_FOLDER_NAME')}/{prompt_hash}.jpg")
    
    blob.upload_from_string(
        image_bytes,
        content_type="image/jpeg"
    )
    
    return blob.public_url



async def generate_character_details_generic(prompt_input: Union[str, bytes], is_image: bool = False):
    try:
        prompt = f"""Analyze the following {'image' if is_image else 'character name'} and attempt to provide character details for a character. DO NOT HALLUCINATE FAKE PEOPLE/CHARACTERS. ONLY GO OFF INFORMATION YOU ACTUALLY KNOW IS TRUE. IF THE PERSON/CHARACTER ISN'T REAL, OR KNOWN FROM A REAL PEICE OF MEDIA, RETURN null.

Expected response format:
{{
    "name": "Character's name",
    "age": "integer value representing age",
    "personality": array of strings, 1 word plus an emoji ie ["smart 🤓", "creative 🎨", "kind 🤗"],
    "occupation": "Character's job or role with an emoji after (return one job, the one they are best known for)",
    "gender": "Character's gender"
}}
"""

        if is_image:
            image = Image.open(BytesIO(prompt_input))
            response = gemini.models.generate_content(
                model=GEMINI_MODEL,
                contents=[prompt, image],
                config={
                    'response_mime_type': 'application/json',
                    'response_schema': CharacterResponse
                },
            )
        else:
            response = gemini.models.generate_content(
                model= GEMINI_MODEL,
                contents=f"{prompt}\n\nCharacter Name: {prompt_input}",
                config={
                    'response_mime_type': 'application/json',
                    'response_schema': CharacterResponse
                },
            )
        
        try:
            # Parse the response using Pydantic model
            character_data: CharacterResponse =response.parsed
            return {"response": character_data}
        except Exception:
            return {"response": None}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/generate-story-segment")
async def generate_story_segment(story_input: StoryInput):
    try:
        response = gemini.models.generate_content(
            model=GEMINI_MODEL,
            contents=story_input.prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": StoryResponse,
            }
        )

        # Enhanced response validation
        if response is None:
            print("Error: Received null response from Gemini API")
            return {"response": None}

        if not hasattr(response, 'text') or not response.text:
            print(f"Error: Invalid response format from Gemini API: {response}")
            return {"response": None}

        try:
            # Attempt to parse the response text as JSON first
            story_data: StoryResponse = response.parsed 
        except json.JSONDecodeError as e:
            print(f"Error decoding JSON response: {str(e)}")
            return {"response": None}
        except Exception as e:
            print(f"Error parsing response: {str(e)}")
            return {"response": None}

        # Only attempt to generate and cache images if we have a valid setting description
        if story_data.story_state.new_location:
            image_url = get_image_from_cache(story_data.story_state.location_description)
            
            if not image_url:
                # Generate new image if not in cache
                image_prompt = f"Generate a polaroid style image: {story_data.story_state.location_description}. The scene should be empty with no people present."
                try:
                    image_response = imagen.models.generate_images(
                        model=IMAGEN_MODEL, 
                        prompt=image_prompt,
                        config=types.GenerateImagesConfig(
                            number_of_images= 1,
                            aspect_ratio="3:4"
                        )
                    )
                    try:
                        image_response = image_response.generated_images[0]
                        if(image_response.image.image_bytes is None or image_response.rai_filtered_reason is not None):
                            print("Error: Image bytes are None or image filtered")
                            story_data.story_images = [] 
                        else:
                            # Save to Google Cloud Storage and get URL
                            image_url = save_image_to_cache(story_data.story_state.location_description, image_response.image.image_bytes)
                            print(f"Image saved to GCS: {image_url}")
                            story_data.story_images = [StoryImage(url=image_url, description=story_data.story_state.location_description)]
                    except Exception as e:
                        print(f"Error creating or saving image to GCS: {str(e)}")
                        print(f"Image response: {image_response}")
                        story_data.story_images = [] 
                except Exception as e:
                    print(f"Error generating image: {str(e)}")
                    story_data.story_images = [] 
            else:
                print(f"Image found in GCS: {image_url}")
                story_data.story_images = [StoryImage(url=image_url, description=story_data.story_state.location_description)]
        else:
            story_data.story_images = [] 
        
        return {"response": story_data}
    except Exception as e:
        print(f"Error in generate_story_segment: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/generate-character-details-name")
async def generate_character_details_name(request: CharacterNameRequest):
    return await generate_character_details_generic(request.name, is_image=False)

@app.post("/generate-character-details-image")
async def generate_character_details_image(file: UploadFile = File(...)):
    contents = await file.read()
    if not validate_image(BytesIO(contents)):
        raise HTTPException(status_code=400, detail="Invalid image format")
    return await generate_character_details_generic(contents, is_image=True)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)