# Resume Analyzer

AI-powered resume analyzer that compares a PDF or TXT resume against a pasted job description and returns evidence-backed ATS/job-fit feedback.

## Features

- PDF and TXT resume uploads
- DeepSeek-powered job-fit analysis
- Evidence-backed category scorecard
- Matched and missing skill extraction
- Role requirement checklist
- Prioritized resume fixes for job seekers
- DeepSeek-powered resume builder that uses analysis evidence, targeted follow-up answers, a rendered preview, and LaTeX export
- Fairness guardrails that exclude protected, school-name, location, and grade-based signals from scoring

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment:
   ```bash
   cp .env.example .env.local
   ```

3. Set your DeepSeek API key:
   ```bash
   DEEPSEEK_API_KEY=dsi-your-api-key-here
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open the printed local URL. If port `3000` is already occupied, run Next on another port:
   ```bash
   npm run dev -- --port 3011
   ```

## Active Analysis Path

The production analysis flow is:

`src/app/page.tsx` -> `/api/analyze` -> `src/app/lib/deepseekEnhancer.ts`

The resume generation and preview flow is:

`src/app/result/page.tsx` -> `src/app/resume-builder/page.tsx` -> `/api/generate-resume` -> `src/app/lib/resumeGenerator.ts` -> `src/app/resume-preview/page.tsx`

Older local/OpenAI analyzer modules remain for legacy tests and experiments, but the main app uses the DeepSeek enhancer path.

## Testing

```bash
npx tsc --noEmit --pretty false
npm run test:lib -- --runInBand
npm run test:api -- --runInBand
npm run test:components -- --runInBand
```

Useful direct targeted command:

```bash
npx jest --config jest.config.ts src/app/lib/__tests__/ src/app/api/__tests__/ src/components/__tests__/ --runInBand
```

## Development Notes

- Upload limits are enforced in the client and API.
- PDF parsing must extract a readable text layer; scanned/image-only PDFs may fail until OCR is added.
- The API logs request metadata and text lengths, not resume or job-description previews.
- New response fields are optional and backward compatible with existing clients.
- The generator returns both a structured HTML preview model and a downloadable `.tex` file. It does not compile LaTeX to PDF server-side.
- Resume-builder profile fields are extracted for prefill only and are not used in scoring.

## License

MIT. See [LICENSE](LICENSE).
