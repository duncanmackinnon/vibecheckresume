# Hosted product scope

Decision reviewed October 13, 2026: VibeCheck is a hosted resume and application workspace. Users sign in, create or upload a source resume, save a job, tailor a resume, and track their next step. Make that loop dependable before expanding integrations.

## ChatGPT decision

Remove ChatGPT subscription linking. OpenAI's public plan-usage flow covers local open-source tools and personal projects; remotely hosted apps must request access before offering it. There is no evidence this deployment has approval. Removed the OAuth routes, connection card, token encryption/refresh code and deployment variables. Auth0 remains website sign-in. Sources: [plan usage overview](https://developers.openai.com/siwc/token-sharing-open-source), [usage policy](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt#usage-policy-and-terms).

Hosted MCP servers are supported, but serve a different purpose: ChatGPT calls our authenticated tools from its own conversation. That supplies no inference credentials to the website. Preserve MCP as an optional advanced connection in Settings, with no onboarding step or core-flow dependency. Account/workspace availability and real OAuth validation still need testing; MCP is outside core launch acceptance. [Official MCP server guide](https://developers.openai.com/plugins/build/mcp-server).

Keep migration history intact: `0002_accounts_persistence.sql` also provides onboarding persistence and may already be applied. Obsolete connection tables are dormant. Any credential/table cleanup needs a separate reviewed migration after checking for stored connections; do not drop data in this scope change.

## Alternatives and delivery order

| Priority | Outcome | Method | Status and acceptance criteria |
| --- | --- | --- | --- |
| 1 | Save a job and its next step | Manual application entry with posting URL, pasted description, notes, follow-up and stage | Existing. Verify hosted persistence, duplicate handling and two-account isolation. |
| 1 | Tailor a truthful resume | Source upload/guided builder, DeepSeek analysis/generation, saved versions, PDF/LaTeX export | Existing. Verify private transfers, live provider execution, factual answers, version selection and exports. |
| 2 | Help with an application | Website assistant with a server-owned OpenAI API key and validated tracker tools | Existing, optional. Validate API project/model access, per-user quotas and spending limits. Measure costs. Keep manual actions usable when AI is off. No customer subscription or API-key setup. |
| 3 | Find sourced leads on demand | Existing website Responses web search, citations and review before saving | Existing, optional. Pilot live posting accuracy, cost per useful lead and duplicates. Do not imply exhaustive coverage. |
| Later | Predictable job coverage | One licensed feed or employer-provided public postings API behind a provider interface | Planned. Compare coverage, licensing, limits, freshness and costs before choosing. Normalize and deduplicate posting URLs; user reviews before saving. No broad scraping project. |
| Later | Less repetitive entry | CSV import/export and paste-to-structured-job extraction | Planned. Preview parsed fields, validate rows, detect duplicates, then explicitly save. Use optional AI only for ambiguous text; keep manual forms. |
| Later | Periodic discovery | Existing opt-in VibeCheck workflows | Implemented but outside core launch. Enable after on-demand reliability/cost are measured, with cancellation, bounded retries and a daily spend ceiling. These are VibeCheck jobs, not ChatGPT Tasks. |

## Launch gates

1. Configure Auth0, restricted PostgreSQL and private Storage. Verify a real user can create a resume, save an application, tailor a version, export and set a follow-up; repeat isolation checks with a second account.
2. Configure server AI only where the host intends to pay. Validate actual project/model access and show enabled/disabled states. Mocked tests do not establish live provider availability. Tracking and manual editing remain available without AI.
3. Pilot on-demand discovery, record useful-lead rate and request cost, set a budget, then decide whether a licensed feed is justified.
4. Revisit recurrence and MCP after the core succeeds. Restore subscription linking only with explicit hosted approval and a worthwhile use case.

Email/calendar sync, automatic submissions, autonomous outreach, directory listing and billing implementation are outside this scope. API costs belong to the host today; monetization is a separate decision. New feeds, CSV tools and stronger budget enforcement are plans, not shipped features.
