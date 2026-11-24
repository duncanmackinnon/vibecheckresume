# Optional integration

This supported MCP connection is outside the core hosted launch requirements. Onboarding and website AI work independently of ChatGPT. See [HOSTED_PRODUCT_PLAN.md](HOSTED_PRODUCT_PLAN.md).

# Connect VibeCheck inside ChatGPT

The release uses ChatGPT as the conversation interface and VibeCheck as the private tracker. No hosted OpenAI OAuth client, partner approval, ChatGPT token sharing, or website AI key is required for tracker tools. Custom MCP availability still depends on your ChatGPT account and workspace policy. Native web search, when available, runs in ChatGPT; the tracker does not claim to provide or unlock that feature.

## Required service setup

1. Create an Auth0 tenant and Regular Web Application. Enable Google and email/password through Universal Login, signup verification and password-reset email. Set `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, and `AUTH0_SECRET` in Vercel. Use the exact website callback `APP_BASE_URL/auth/callback`, logout URL and origin; development, preview and production callbacks are separate.
2. Create Supabase PostgreSQL. Apply all additive migrations with the administrative `MIGRATION_DATABASE_URL` using `npm run db:init`. Create a separate runtime login with the `vibecheck_app` role, no table ownership, SUPERUSER or BYPASSRLS. Set the transaction-pooler URL with certificate-verifying TLS as `DATABASE_URL`. Keep migration credentials off Vercel. Uploaded resumes additionally require private Storage; see [TRACKER_SETUP.md](TRACKER_SETUP.md).
3. Choose a stable public HTTPS hostname for `APP_BASE_URL` and set `MCP_AUDIENCE=APP_BASE_URL/mcp`. The MCP endpoint and protected-resource discovery must be reachable without a Vercel protection login. A rotating protected preview demonstrates the UI but cannot be the live ChatGPT connection. Private tool data remains protected by Auth0 OAuth.
4. Run `npm run setup:mcp` for a redacted configuration report and `npm run setup:mcp -- --probe-db` for migration/role/policy readiness. Configure missing values in the service dashboards or local `.env.local`; do not paste credentials into ChatGPT. `/api/health` must report database readiness and sign-in configuration before live account testing.

## Auth0 MCP client

Create an Auth0 API whose identifier is the exact MCP audience. Define `applications:read`, `applications:write`, `resumes:read` and `resumes:write`. Enable the Resource Parameter Compatibility Profile, issuer in authorization responses and Client ID Metadata Document Registration.

Register ChatGPT using its published client metadata URL shown in the connection flow. In Auth0, Applications → Create Application → Import from URL imports the CIMD. Use the public-client `none` method with PKCE; match exact redirects from the published metadata. Grant only user-delegated access to the four tracker scopes and allow refresh tokens. Keep client/machine access denied. Promote the Google and database login connections to domain level so this third-party client can use them. Do not register a hosted OpenAI identity client for this flow. See [Auth0 manual CIMD registration](https://auth0.com/ai/docs/mcp/guides/registering-your-mcp-client-application/manual-cimd-registration).

## Add the connection

In [ChatGPT Plugins](https://chatgpt.com/plugins), select the plus button → Add custom MCP server. Enter VibeCheck's name and description, the public `https://YOUR_HOST/mcp` URL, and OAuth authentication. Review the connection warning, create the plugin, and review its discovered tools. Connect the same VibeCheck account used on the website. Start a new chat and select the plugin with `@`. See [official connection instructions](https://developers.openai.com/plugins/deploy/connect-chatgpt).

Useful prompts:

- “Show my application dashboard and overdue follow-ups.”
- “Read my saved job-search preferences, then search the web for relevant openings if web search is available. Show actual vacancy links and don't save anything yet.”
- “Save the first two jobs I selected to VibeCheck as Saved applications, with their source links.”
- “Move this application to Interview and add a preparation task for Friday.”

`get_search_preferences` returns only saved job preferences. `create_application` saves sourced leads without an AI-provider call, with retry receipts and ownership checks. ChatGPT must ask for missing preferences or report unavailable web search rather than invent listings. Optional `find_jobs` is separately billed server discovery and requires the deployment's platform API key; it is not needed for the native ChatGPT flow.

## Verify live access

Run MCP Inspector for initialization, typed tool discovery, OAuth challenges and representative calls. Test two real accounts: saved preferences, application creation/reload in the website, edits with current versions, tasks, interviews, private downloads, resume jobs and the interactive dashboard. Verify expired, wrong-audience, read-only and revoked tokens cannot access or mutate records. Disconnect in VibeCheck Settings and confirm prior tokens fail; reconnect with fresh consent. Refresh metadata in ChatGPT after changing tools and start a new conversation.

Website AI is optional. Configuring `OPENAI_API_KEY` explicitly enables platform-billed assistant/server discovery; no hosted ChatGPT credentials are used and no provider changes happen automatically. DeepSeek remains separate. Keep `OPENAI_HOSTED_APPROVED=false` and `OPENAI_HOSTED_INFERENCE_APPROVED=false` for this release.
