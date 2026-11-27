CREATE TABLE IF NOT EXISTS tracker.auth_credentials (
  user_id uuid PRIMARY KEY REFERENCES tracker.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tracker.auth_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracker.auth_credentials FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_auth_credentials ON tracker.auth_credentials;
CREATE POLICY owner_auth_credentials ON tracker.auth_credentials
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON tracker.auth_credentials TO vibecheck_app;
