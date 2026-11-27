# VibeCheck

A private job-search workspace with guided onboarding, sourced job discovery, an application board, tasks and interviews, saved resumes, and optional website AI. The core workflow is save a job, tailor a resume, and track the next step.

The tracker uses Next.js 16 / React 19, first-party PostgreSQL authentication (`scrypt` + signed session cookies) alongside optional Auth0 OIDC, Supabase PostgreSQL (or embedded PGlite) and private Storage. DeepSeek handles resume AI; the optional website assistant and job discovery use a server-owned OpenAI API key with separate API billing. Users do not link ChatGPT subscriptions. See the [full system architecture](docs/ARCHITECTURE.md) and [hosted product scope and alternative methods](docs/HOSTED_PRODUCT_PLAN.md). The supported [ChatGPT MCP plugin](docs/CHATGPT_MCP_SETUP.md) is an optional advanced connection, outside the core launch requirements.

## Run locally

Use Node 22. Install dependencies with `npm ci`, copy `.env.example` to `.env.local`, then run `npm run dev`. Preserve any existing credentials. Visit http://localhost:3000, or /dashboard?preview=1 for the clearly labeled read-only sample workspace. Building and exploring the preview require no service credentials.

Real accounts and saved records require the managed services. Follow [setup and rollout instructions](docs/TRACKER_SETUP.md) for database migrations, restricted credentials, Auth0 sign-in, private uploads, and optional server AI.

See the [verification record](docs/VERIFICATION.md) for the deployed preview, test results, and remaining hosted-service checks.

## Features

- Name-first onboarding with upload or guided resume creation, saved search preferences, and a personalized portal with top navigation.
- Optional on-demand website job discovery with cited results, and duplicate-safe saving to Applications. Daily and weekly searches require explicit opt-in and remain outside the core launch scope.
- Searchable board and table with fixed stages, priorities, tags, archive and restore.
- Application details, contacts, notes, activity, dated follow-ups, and interviews with retained timezones.
- Multi-format layout- and local-NLP-aware resume ingestion (`.pdf`, `.docx`, `.rtf`, `.md`, `.tex`, `.txt`, and pasted text) recovering PDF hyperlinks, 2-column reading order, and confidence-gated target role suggestions.
- Reusable private source resumes, application-specific analyses, saved builder answers, immutable generated versions, and "Keep current resume" vs. submitted-version selection.
- Resume preview, browser print/PDF and LaTeX export. Old builder links lead to an explicit one-time import with application confirmation.
- Saved website assistant conversations and validated tracker tools. An optional MCP plugin shares those tools with ChatGPT. Tools cannot send messages or submit applications.
- Ownership checks plus PostgreSQL row policies, version conflict checks, retry-safe mutations, private signed file transfers and per-user AI limits.

See [onboarding and discovery](docs/ONBOARDING_DISCOVERY.md) for the migration, separate discovery model, recurring-search behavior and preview limitations.

## Verify

```sh
npm run typecheck
npm run lint
npm test -- --runInBand
npm run test:integration
npm run test:e2e
npm run build
```

Unit tests mock providers. Integration tests exercise actual PostgreSQL policies in an isolated PGlite database. Browser tests exercise the preview and authenticated API fixtures without adding an authentication bypass to the app. Real hosted sign-in and provider execution still require preview-deployment validation with configured test accounts.

## Deploy

Use Vercel with Node 22, apply additive Drizzle migrations with `npm run db:init`, then deploy a preview with the environment values described in the setup guide. Use a stable HTTPS origin for sign-in; optional MCP also requires public HTTPS. Production runtime must use the restricted database login; keep migration credentials off the deployment.

Email/calendar sync, job scraping, automatic submissions, billing and public ChatGPT directory submission are outside this release.
