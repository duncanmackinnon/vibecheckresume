# Onboarding and job discovery

The website-first entry flow collects: a name, upload or guided resume creation, desired roles and work preferences, search cadence, and a personalized portal with navigation across the top. The public preview uses clearly labeled sample data. Its onboarding draft lives only in the current browser session; it does not claim that a file was uploaded or that a private account exists.

Authenticated onboarding stores an owner-protected profile and an unfinished draft, including builder answers and the current screen/step. Drafts autosave after 500 ms of inactivity and restore across devices. The entered display name is independent of identity-provider claims. Updates require the current version and a retry key. Apply **all three** Drizzle migrations using `npm run db:init`; `0001_onboarding_discovery.sql` adds discovery records and `0002_accounts_persistence.sql` adds onboarding drafts; its legacy connection tables are unused by the current app. Existing tracker records are preserved.

The guided builder derives a reusable source resume, a printable preview and LaTeX from the user's answers. It does not invent experience or require an AI provider. Saving creates an immutable source document. Source answers and exports remain private in PostgreSQL; generated text downloads check ownership. Uploaded PDF/TXT files retain the private Supabase Storage workflow. Application-specific tailoring remains available.

## Discovery

ChatGPT can read saved preferences with `get_search_preferences`, use native web search when available, and save selected sourced opportunities through `create_application`. This needs no hosted OpenAI approval or website API key. Website/manual server discovery and opt-in scheduled discovery separately require `OPENAI_API_KEY` and an accessible `OPENAI_DISCOVERY_MODEL` (default `gpt-5.5`) with Responses web search. Platform billing is explicit; there is no hosted token lookup or automatic provider fallback. DeepSeek remains responsible for resume AI. `DISCOVERY_DAILY_LIMIT` defaults to five server search jobs per user per UTC day. Follow [CHATGPT_MCP_SETUP.md](CHATGPT_MCP_SETUP.md).

Only saved job preferences are sent to discovery. Resume text, account email and contact details are not included. Results retain source citations and timestamps. The server rejects proposed vacancy URLs absent from the search's sources. A cited result is a lead to review, not a guarantee that an opening remains available. Saving a result creates a Saved application; it does not submit an application or contact an employer. Repeated saves resolve to the existing application.

Manual searches start durable Workflow jobs and return a job ID. The MCP tools `find_jobs`, `list_discovered_jobs`, `get_job_search`, and `save_discovered_job` use the same owner-scoped services as the website. Website discovery requires a signed-in account and configured API service. Optional MCP calls additionally require the appropriate scopes.

Daily and weekly searches require explicit opt-in. Vercel Workflow persists each wait and the following search. A preference fingerprint, owner ID and generation/sequence guard prevent stale or duplicate scheduled cycles from creating new searches. Changing preferences or disabling recurrence invalidates earlier sleeping runs. Each cycle schedules its successor on the latest deployment; the history of an individual run stays bounded. These are **VibeCheck schedules**, not ChatGPT Tasks created on the user's behalf. First recurring search is due one day or seven days after scheduling; Find jobs can run immediately.

When a provider or scheduler is unavailable, profile saving and tracking remain available. Discover shows the failure and a restart control. No automatic external messages, scraping pipeline, calendar connection or application submission are included.

## Hosted verification

Use a stable public HTTPS hostname for Auth0 callbacks and ChatGPT's MCP endpoint. A protected Vercel preview can demonstrate the website to the project owner, but ChatGPT cannot use its protection page as an MCP endpoint. Follow [TRACKER_SETUP.md](TRACKER_SETUP.md) for managed-service setup. Before production, exercise real sign-in, upload, completion, job search, recurrence opt-out, source links with two accounts. Validate ChatGPT reads/writes separately if enabling optional MCP. Local fixtures and ownership-policy tests do not establish that external credentials or consent have been configured.
