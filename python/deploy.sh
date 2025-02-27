#!/bin/bash

# Export environment variables from .env file
set -a
source .env 2>/dev/null || echo "Warning: .env file not found"
set +a

# Build and push to Google Container Registry
gcloud builds submit --tag gcr.io/delulu-450702/headcanon-backend

# Escape the JSON credentials
ESCAPED_CREDENTIALS=$(echo "${GOOGLE_APPLICATION_CREDENTIALS}" | sed 's/"/\\"/g')

# Deploy to Cloud Run with environment variables
gcloud run deploy headcanon-backend \
    --image gcr.io/delulu-450702/headcanon-backend \
    --platform managed \
    --region us-central1 \
    --allow-unauthenticated \
    --port 8080 \
    --set-env-vars="^--^GEMINI_MODEL=${GEMINI_MODEL},\
IMAGEN_MODEL=${IMAGEN_MODEL},\
FREE_MODE=${FREE_MODE},\
FREE_API_KEY=${FREE_API_KEY},\
PAID_API_KEY=${PAID_API_KEY},\
GCS_PROJECT_ID=${GCS_PROJECT_ID},\
GCS_BUCKET_NAME=${GCS_BUCKET_NAME},\
GCS_FOLDER_NAME=${GCS_FOLDER_NAME},\
GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT},\
GCS_PRIVATE_KEY_ID=${GCS_PRIVATE_KEY_ID},\
GCS_CLIENT_EMAIL=${GCS_CLIENT_EMAIL},\
GCS_CLIENT_ID=${GCS_CLIENT_ID},\
GCS_CLIENT_X509_CERT_URL=${GCS_CLIENT_X509_CERT_URL},\
GOOGLE_APPLICATION_CREDENTIALS='${ESCAPED_CREDENTIALS}'"