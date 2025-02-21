from google.cloud import storage
from PIL import Image
import os
from dotenv import load_dotenv
import io
import json
from google.oauth2 import service_account

# Load environment variables
load_dotenv()

# Initialize Google Cloud Storage client with service account credentials

# Create credentials object from environment variables
credentials = service_account.Credentials.from_service_account_info(json.loads(os.getenv('GOOGLE_APPLICATION_CREDENTIALS')))

# Initialize storage client with credentials
storage_client = storage.Client(project=os.getenv("GCS_PROJECT_ID"), credentials=credentials)
# Split bucket name and folder path
bucket_name = os.getenv("GCS_BUCKET_NAME") # Get just 'delulu-mvp'
bucket = storage_client.bucket(bucket_name)

def create_test_image():
    # Create a simple test image (100x100 red square)
    img = Image.new('RGB', (100, 100), color='red')
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG')
    img_byte_arr.seek(0)
    return img_byte_arr.getvalue()

def test_storage_upload():
    try:
        # Create test image
        image_bytes = create_test_image()
        
        # Create a test filename
        test_filename = 'test.png'
        folder_name = os.getenv('GCS_FOLDER_NAME') # Get 'story-photos'
        blob = bucket.blob(f"{folder_name}/{test_filename}")
        
        # Upload the image
        blob.upload_from_string(
            image_bytes,
            content_type="image/jpeg"
        )
        
        print(f"Successfully uploaded test image to: {blob.public_url}")
        return True
    except Exception as e:
        print(f"Error uploading test image: {str(e)}")
        return False

if __name__ == "__main__":
    test_storage_upload()