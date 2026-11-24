# Hosted scope verification — October 18, 2026

Removed hosted ChatGPT subscription OAuth routes, token client code, unused connection UI and deployment variables. Onboarding skips ChatGPT setup, including restored drafts from the old connection step. Settings keeps supported MCP in a collapsed optional section. Assistant and discovery unavailable states offer website actions; discovery preserves preview mode when opening manual entry.

Validation: production build, TypeScript and lint pass. The scope cleanup passed all 204 unit tests and 36 integration tests; a subsequent focused run passed all 16 onboarding/session/discovery-provider cases. Final desktop/mobile browser verification against the rebuilt production app passes 22 scenarios, including onboarding, optional MCP settings and website fallbacks. Four private onboarding scenarios skip without `PLAYWRIGHT_AUTH_STATE`. Earlier development-server navigation timeouts did not recur against the production build. The build still emits the Auth0 SDK dynamic-dependency warning.

No production deployment or live account/provider validation was performed. Real Auth0, private Storage, restricted database credentials and provider access remain the launch gates documented in [HOSTED_PRODUCT_PLAN.md](HOSTED_PRODUCT_PLAN.md). Prior database migrations and records are preserved; legacy subscription tables remain dormant.

# Scope revision — October 13, 2026

The current product is website-first. Unsupported hosted subscription linking has been removed, and supported MCP is optional. Earlier entries below are historical verification records and may describe removed routes or superseded release scope. See [HOSTED_PRODUCT_PLAN.md](HOSTED_PRODUCT_PLAN.md) for current launch gates. Live service configuration and provider access still require deployment validation.

# Verification — 7 October 2026

The current release is MCP-first. ChatGPT connects to VibeCheck's Auth0-protected tracker and can read saved search preferences, use native web search when available, and save selected sourced jobs. Hosted OpenAI account linking is no longer offered in default onboarding/Settings and is not required. Website assistant/server discovery use only the explicitly configured platform API key; old queued hosted searches cancel instead of changing billing. DeepSeek is unchanged.

Current review preview: https://vibecheckresume-rc5ky71k5-duncans-projects-6f394385.vercel.app/dashboard?preview=1

TypeScript, lint, local production build and Vercel build pass. 203 unit/component/API tests pass. 47 integration tests pass in the full run, plus the subsequently added real migrated ownership-policy readiness test passes (48 current cases). Twenty desktop/mobile browser scenarios pass, including MCP connection instructions and removal of hosted-plan controls. Twenty authenticated browser scenarios still skip without real test-account state. Deployed MCP discovery advertises all 32 tools with the new `get_search_preferences` tool.

The setup CLI `npm run setup:mcp` reports missing Auth0 configuration, `APP_BASE_URL`, and `DATABASE_URL` without printing secrets. Deployed health reports Auth0/database/Storage unconfigured; optional platform AI is off and DeepSeek is present. A protected review preview is not the live ChatGPT MCP hostname. Auth0/Supabase provisioning, a public stable HTTPS origin and real ChatGPT consent still need completion before live use. No hosted OpenAI approval is needed for this path. Follow [CHATGPT_MCP_SETUP.md](CHATGPT_MCP_SETUP.md).

## Previous account integration milestone — 6 October 2026

Auth0/session protection, owner-bound persisted onboarding drafts, and hosted ChatGPT connection code are implemented. Google and email/password remain Auth0 Universal Login configuration tasks; managed-service credentials are absent. The website assistant/manual searches use approved connected-plan credentials only, while scheduled searches use the platform provider and resumes retain DeepSeek.

Current preview: https://vibecheckresume-3xs4rw9s7-duncans-projects-6f394385.vercel.app/dashboard?preview=1

TypeScript and lint pass. 190 unit/component/API tests and 46 integration tests pass. Integration coverage includes real owner row policies, private drafts, duplicate/conflicting saves, OAuth state/browser/owner/nonce/replay, encrypted credentials, refresh serialization, identity-only consent, disconnect/replacement guards, model selection, usage pause, unsupported capabilities and incomplete provider streams. Production builds pass locally and on Vercel; the optional Auth0 DPoP import warnings remain.

All 18 runnable desktop/mobile browser scenarios pass: public onboarding, upload reselection, explicit sample navigation (including Discover), read-only writes, search, dialogs and private-page protection. Twenty authenticated browser scenarios require a real test-account storage state and are skipped without it. Provider fixtures and PGlite establish local behavior, not actual Auth0/Supabase/hosted OpenAI approval. No authentication bypass was introduced for browser tests.

The deployed health endpoint reports Auth0/database/Storage unconfigured, DeepSeek present, and connected-plan inference disabled. Private OpenAI status requests fail with `AUTH_UNCONFIGURED` instead of returning account data. Production was not promoted. Follow [TRACKER_SETUP.md](TRACKER_SETUP.md) and [CHATGPT_ACCOUNT_SETUP.md](CHATGPT_ACCOUNT_SETUP.md) for the exact setup and live release checks. The preview requires the project owner's Vercel sign-in and cannot be used as ChatGPT's public MCP endpoint.

## Previous tracker milestone — 13 September 2026

Implemented and deployed a Vercel preview:

https://vibecheckresume-kxrqzh0t5-duncans-projects-6f394385.vercel.app/dashboard?preview=1

This is a **read-only sample workspace**. The existing Vercel deployment protection requires the project owner's Vercel sign-in. Production was not changed.

## Passed

- TypeScript and ESLint with zero warnings from application source.
- 146 unit/component/protocol tests in 31 suites.
- 21 integration tests: restricted-role PostgreSQL/RLS through PGlite, two-user ownership, retry receipts and conflicts, UTC normalization, persisted resume snapshots and immutable versions, real PDF parsing, real RSA JWT verification, and full MCP tool discovery.
- 28 Playwright scenarios across desktop and mobile: application creation/editing/reload/deep links, task completion, note editing, conflict recovery, saved drafts and versions, submitted resume selection, rich analysis, LaTeX download, resume-only print layout, explicit legacy import, interrupted responses, and isolated preview mode.
- Production build with AI/database/Auth0 credentials explicitly absent from the build process. A second build completed successfully on Vercel using the Node 22 engine configuration.
- Deployed health response correctly reports Auth0/database/storage/OpenAI unconfigured and existing DeepSeek configuration present.
- Deployed MCP discovery returns all 27 tools with object output schemas, including note editing. Requests used the Vercel CLI's authorized deployment-protection access.
- Production dependency audit reports zero vulnerabilities.

Browser mutation tests use explicit API fixtures; they do not bypass production authentication. Integration tests execute real PostgreSQL policies in an isolated database. Neither substitutes for real Auth0 account-link testing.

## Still requires service configuration

Follow [TRACKER_SETUP.md](TRACKER_SETUP.md) to configure Auth0, Supabase PostgreSQL and private Storage. Connected-plan inference now follows [CHATGPT_ACCOUNT_SETUP.md](CHATGPT_ACCOUNT_SETUP.md). Only DeepSeek is configured in the existing local/project environment.

Before promoting to production, verify actual Auth0 sign-in with two accounts, restricted database credentials and migrations, private Storage transfers, durable Workflow execution with a provider, real ChatGPT consent/reconnection and natural-language writes, and the interactive ChatGPT dashboard. These external checks could not run without the managed-service configuration. ChatGPT also needs an accessible stable HTTPS endpoint; the protected preview cannot serve as its public endpoint.

The build currently reports Auth0 SDK warnings for its optional dynamic DPoP crypto import. DPoP is not enabled by this application. The full development dependency audit retains four moderate advisories from Drizzle Kit's transitive legacy esbuild loader; this is outside the production dependency tree.

## Review artifacts

- `artifacts/vibecheck-desktop.png`
- `artifacts/vibecheck-mobile.png`

The local standalone preview is available at http://localhost:3013/dashboard?preview=1 while the task's server is running.
