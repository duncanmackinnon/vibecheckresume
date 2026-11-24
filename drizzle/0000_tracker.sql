CREATE SCHEMA IF NOT EXISTS tracker;
--> statement-breakpoint
CREATE TABLE tracker.users (id uuid PRIMARY KEY, issuer text NOT NULL, subject text NOT NULL, email text NOT NULL, name text NOT NULL, UNIQUE(issuer,subject));
--> statement-breakpoint
CREATE TABLE tracker.records (id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES tracker.users(id), kind text NOT NULL CHECK(kind IN ('application','entry','source_resume','analysis','builder_draft','resume_version','ai_job','conversation','message','connection','usage')), application_id uuid, data jsonb NOT NULL, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE INDEX records_owner_kind ON tracker.records(owner_id,kind);
--> statement-breakpoint
CREATE INDEX records_application ON tracker.records(owner_id,application_id);
--> statement-breakpoint
CREATE TABLE tracker.operations (owner_id uuid NOT NULL REFERENCES tracker.users(id), key text NOT NULL, operation text NOT NULL, input jsonb NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(owner_id,key));
--> statement-breakpoint
ALTER TABLE tracker.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracker.users FORCE ROW LEVEL SECURITY;
ALTER TABLE tracker.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracker.records FORCE ROW LEVEL SECURITY;
ALTER TABLE tracker.operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracker.operations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY owner_users ON tracker.users USING(id = NULLIF(current_setting('app.user_id',true),'')::uuid) WITH CHECK(id = NULLIF(current_setting('app.user_id',true),'')::uuid);
CREATE POLICY owner_records ON tracker.records USING(owner_id = NULLIF(current_setting('app.user_id',true),'')::uuid) WITH CHECK(owner_id = NULLIF(current_setting('app.user_id',true),'')::uuid);
CREATE POLICY owner_operations ON tracker.operations USING(owner_id = NULLIF(current_setting('app.user_id',true),'')::uuid) WITH CHECK(owner_id = NULLIF(current_setting('app.user_id',true),'')::uuid);
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='vibecheck_app') THEN CREATE ROLE vibecheck_app NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$;
GRANT USAGE ON SCHEMA tracker TO vibecheck_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA tracker TO vibecheck_app;
REVOKE ALL ON SCHEMA tracker FROM PUBLIC;
