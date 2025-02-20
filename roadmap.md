# MVP Progress (Current Stage)


## Frontend
- Setup initial screens (done)
- add basic AI for character generation (done)
    - add character visual description extraction, and fields for this in the character form
- add basic story settings page (done)
    - update settings form to be more engaging/useful
- add basic AI for story segment generation 
- add story settings photo generation
- add user interaction to story


## Backend
- need to setup fast api to have a backend which can handle api calls
- need an endpoint for gemini, which should hit gemini-2.0-flash-lite-preview-02-05"
    - should be able to take in text, and optional photos too
- need an endpoint for imagen3, which should hit imagen-3.0-generate-002
- these should both be done using the python gemini client, we want to get the data, structure it, and return it to the frontend



# Production

## Frontend
- Mobile app + Website
## Backend
- Auth/ DB - Supabase
- AI Requests - Python Fast API, interfaces with gemini, and any custom AI servers we have
- API Keys - Vercel / Google Cloud
- Triggers - Supabase Edge Functions (Verify auth, then forward request to Python Service for AI requests)
