# Setup Instructions

## 1. Get OpenAI API Key
1. Go to https://platform.openai.com/api-keys
2. Sign up or log in to your OpenAI account
3. Create a new API key
4. Copy the API key (make sure to save it as it won't be shown again)

## 2. Configure Environment
1. Open the `.env` file in the root directory
2. Replace `sk-your_actual_api_key_here` with your OpenAI API key
3. Save the file

## 3. Install Dependencies
```bash
npm install
```

## 4. Start Development Server
```bash
npm run dev
```

## 5. Using the Application
1. Open http://localhost:3000 in your browser
2. Upload a resume (PDF or TXT format)
3. Paste a job description
4. Click "Analyze Resume" to get the match analysis

## Testing Files
For testing, use:
- Resume format: PDF or TXT
- File size: Under 5MB
- Text should be extractable (not scanned images)

## Common Issues
1. If you see "Failed to analyze resume":
   - Check if your OpenAI API key is correct
   - Ensure the resume file is properly formatted
   - Check if you have sufficient API credits

2. If file upload fails:
   - Ensure file is PDF or TXT format
   - Check file size (max 5MB)

3. If analysis takes too long:
   - This is normal for longer documents
   - The API typically responds within 10-30 seconds