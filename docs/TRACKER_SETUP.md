# VibeCheck deployment and account setup

The workspace is a Next.js application hosted on Vercel. Its live records need Auth0, PostgreSQL, and private object storage. Without those services, the website offers a clearly labeled read-only sample workspace; it never treats sample data as saved applications.

## Local development

Use Node 22, run `npm ci`, and copy missing values from `.env.example` into `.env.local`. Preserve any existing DeepSeek key. Run `npm run dev` and visit localhost:3000. For a custom port on Windows, use `node node_modules/next/dist/bin/next dev --webpack --port 3012`. Set `APP_BASE_URL` to the same local origin when testing sign-in. No AI key is needed to build the website or explore sample data.

## PostgreSQL and private files

Create a Supabase project and obtain its transaction-pooler PostgreSQL connection for runtime use and its direct connection for migrations. Use TLS with certificate verification. Set `MIGRATION_DATABASE_URL` using the administrative credential, then run `npm run db:init`. All three additive migrations are required, including `0002_accounts_persistence.sql` for onboarding drafts. Legacy connection tables remain dormant to preserve migration history. They preserve existing resume versions.

Create a dedicated database login with a strong generated password and grant it the `vibecheck_app` role. Use that login in `DATABASE_URL`. It must have neither SUPERUSER nor BYPASSRLS and must not own the tables. The application refuses privileged runtime credentials. Migrations use their separate administrative connection; do not put it in Vercel runtime environments.

Keep `tracker` out of Supabase's exposed API schemas. Requests use transactions that set the verified internal account ID before any data access. Row policies provide an independent ownership boundary. Records are typed JSON documents in `tracker.records`, indexed by owner, kind, and application; related records are validated in the shared service layer.

Create a **private** Storage bucket named `resumes`, with allowed types `application/pdf` and `text/plain`, maximum size 8 MiB. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_RESUME_BUCKET`. Only the server uses the service key, after authenticating the user and authorizing the record. Never make this bucket public. Uploaded text is also retained privately for reproducible analysis.

Set the bucket's `file_size_limit` to `8388608` and `allowed_mime_types` to `application/pdf,text/plain`. The browser sends small prepare/complete requests to Vercel and transfers the file directly with a path-limited signed upload URL. Completion verifies the file's SHA-256, size and contents before creating its record. Original downloads redirect to a 60-second signed URL after an ownership check.

## Auth0 website sign-in

Create a Regular Web Application in Auth0 with New Universal Login. Configure its callback as `APP_BASE_URL/auth/callback`, and its allowed logout URL and web origin as `APP_BASE_URL`. Set `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, and a random 32-byte `AUTH0_SECRET`. Enable the Google social connection and an email/password database connection for this application. Use your own Google OAuth client for deployed environments, enable signup verification emails and password-reset emails, and configure the email provider. Unverified email/password users see a verification screen and must sign in again after verifying. Password reset stays in Universal Login.

Register each exact development, preview, and production callback/logout/origin separately. Prefer a stable preview hostname; a new deployment hostname requires updating both providers. Never use wildcard callbacks. Secure HttpOnly session cookies roll for one day of inactivity with a seven-day absolute lifetime. Private pages check the session on the server; explicit `?preview=1` opens sample records. Login returns to safe local deep links. Logout or account changes clear account-bound browser drafts; files must be reselected after a login redirect.

Website cookies identify the account. MCP tokens identify the same user by issuer and subject; email addresses are not used to merge accounts.

## Optional ChatGPT tracker plugin (outside core launch)

1. Pick the stable HTTPS application origin and set `APP_BASE_URL` and `MCP_AUDIENCE` (`APP_BASE_URL/mcp`).
2. Create an Auth0 API with that exact identifier. Define `applications:read`, `applications:write`, `resumes:read`, and `resumes:write` permissions.
3. Enable Auth0's Resource Parameter Compatibility Profile, Include Issuer in Authorization Responses, and Client ID Metadata Document Registration.
4. In [ChatGPT Plugins](https://chatgpt.com/plugins), choose Add custom MCP server with the stable `/mcp` endpoint and OAuth. Copy the exact client metadata URL and redirect URI shown by ChatGPT.
5. Register that client metadata in Auth0. Use the supported public-client `none` token authentication method with PKCE S256. Grant only the four user-delegated API permissions, enable refresh tokens, and promote the login connection to domain level for the third-party client. Do not grant machine-to-machine access. If the tenant requires a different client-registration configuration, resolve it in Auth0 before claiming the integration works.
6. Match the exact callback URI and issuer, then connect a test account in ChatGPT. No user API keys belong in the ChatGPT conversation.
7. Test list, create, edit, task completion, resume jobs, and the interactive dashboard. Repeat with another account and verify records never cross accounts.

The server publishes `/.well-known/oauth-protected-resource`. It supports stateless MCP requests at `/mcp`; tool discovery contains no user data. Each tool validates the bearer token and required permissions. A Settings disconnect immediately blocks that user's existing connection. Re-enabling requires a newly issued token; old tokens remain invalid.

Custom ChatGPT connection availability depends on the account and workspace policy. Hosted OpenAI plan authorization is not involved in this MCP flow. A public directory listing is not part of this release. Refresh connection metadata and start a new chat after changing tools, authorization, or the widget. See [CHATGPT_MCP_SETUP.md](CHATGPT_MCP_SETUP.md).

## AI and background jobs

Set `DEEPSEEK_API_KEY` for resume analysis/generation. ChatGPT MCP tracking and saving web-search leads require no AI key. Optional website assistant and server discovery use `OPENAI_API_KEY` and platform billing explicitly; they do not resolve or fall back to hosted ChatGPT plan credentials. Scheduled discovery retains explicit opt-in. Old queued searches tied to a hosted connection stop instead of changing providers. Configure `OPENAI_ASSISTANT_MODEL` and `OPENAI_DISCOVERY_MODEL` to models available to that API project. The default daily limits are 20 resume AI attempts in a rolling 24 hours and 40 assistant requests per UTC day.

Vercel Workflow runs analysis and generation durably. Jobs retain their input snapshots, attempts, status, and output IDs in PostgreSQL. A retry never overwrites a saved resume version. Missing AI keys affect only those features.

## Verification and rollout

Run `npm run typecheck`, `npm run lint`, `npm test -- --runInBand`, `npm run test:integration`, and `npm run test:e2e`. Integration tests run PostgreSQL row policies and store operations against an isolated PGlite database; browser tests use explicit fixture responses and do not create an authentication bypass in the application.

Deploy a Vercel preview with test-service credentials. Apply migrations first, then verify `/api/health`, real Auth0 sign-in, private uploads/downloads, and job restart/retry. Test ChatGPT linking separately if enabling optional MCP. The health endpoint reports database readiness separately from optional AI availability. Configure backups for the database and files. Keep prior Vercel deployments available for rollback; apply additive migrations before switching traffic.

Core production verification requires real hosted sign-in, storage, database and resume/provider checks. Local preview and mocked provider tests are not substitutes. Optional MCP has its own live connection checks. See [HOSTED_PRODUCT_PLAN.md](HOSTED_PRODUCT_PLAN.md).
