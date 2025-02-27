from google import genai
from google.genai import types
from PIL import Image
from io import BytesIO
import os
from dotenv import load_dotenv
# Load environment variables
load_dotenv()
client = genai.Client(api_key=os.getenv('PAID_API_KEY'))

response = client.models.generate_images(
    model='imagen-3.0-fast-generate-001',
    prompt='generate a polaroid of a photo with this description: The concert halls exit opened onto a wide plaza, illuminated by a mix of streetlights and the vibrant glow of towering digital billboards. A gentle breeze rustled through the leaves of the large, meticulously maintained trees lining the walkway. The air hummed with the low thrum of traffic and the distant sounds of the city. A lone food vendor was packing up his cart, the metallic clang of his closing awning adding to the symphony of the city',
    config=types.GenerateImagesConfig(
        number_of_images= 1,
        aspect_ratio='3:4'
    )
)
for generated_image in response.generated_images:
  image = Image.open(BytesIO(generated_image.image.image_bytes))
  image.show()