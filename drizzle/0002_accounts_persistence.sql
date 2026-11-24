ALTER TABLE tracker.records DROP CONSTRAINT records_kind_check;
--> statement-breakpoint
ALTER TABLE tracker.records ADD CONSTRAINT records_kind_check CHECK (kind IN ('application','entry','source_resume','analysis','builder_draft','resume_version','ai_job','conversation','message','connection','usage','profile','job_match','discovery_run','onboarding_draft'));
--> statement-breakpoint
CREATE UNIQUE INDEX records_one_onboarding_draft_per_owner ON tracker.records(owner_id) WHERE kind = 'onboarding_draft';
--> statement-breakpoint
CREATE TABLE tracker.openai_connections (
  owner_id uuid PRIMARY KEY REFERENCES tracker.users(id), id uuid NOT NULL UNIQUE,
  issuer text NOT NULL, client_id text NOT NULL, subject text NOT NULL,
  email text, name text, credentials text, expires_at timestamptz, usage_paused_until timestamptz,
  inference_authorized boolean NOT NULL DEFAULT false, selected_model text,
  status text NOT NULL CHECK(status IN ('active','reconnect_required','disconnected')),
  generation integer NOT NULL DEFAULT 1 CHECK(generation > 0), version integer NOT NULL DEFAULT 1 CHECK(version > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(issuer,client_id,subject)
);
--> statement-breakpoint
CREATE TABLE tracker.openai_oauth_transactions (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES tracker.users(id),
  state_hash text NOT NULL UNIQUE, browser_hash text NOT NULL, verifier text NOT NULL, nonce text NOT NULL,
  redirect_uri text NOT NULL, return_to text NOT NULL, prior_generation integer,
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX openai_transactions_owner_expiry ON tracker.openai_oauth_transactions(owner_id,expires_at);
--> statement-breakpoint
ALTER TABLE tracker.openai_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracker.openai_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE tracker.openai_oauth_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracker.openai_oauth_transactions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY owner_openai_connections ON tracker.openai_connections USING(owner_id = NULLIF(current_setting('app.user_id',true),'')::uuid) WITH CHECK(owner_id = NULLIF(current_setting('app.user_id',true),'')::uuid);
CREATE POLICY owner_openai_transactions ON tracker.openai_oauth_transactions USING(owner_id = NULLIF(current_setting('app.user_id',true),'')::uuid) WITH CHECK(owner_id = NULLIF(current_setting('app.user_id',true),'')::uuid);
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON tracker.openai_connections,tracker.openai_oauth_transactions TO vibecheck_app;
REVOKE ALL ON tracker.openai_connections,tracker.openai_oauth_transactions FROM PUBLIC;
