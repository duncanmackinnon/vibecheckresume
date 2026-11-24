ALTER TABLE tracker.records DROP CONSTRAINT records_kind_check;
--> statement-breakpoint
ALTER TABLE tracker.records ADD CONSTRAINT records_kind_check CHECK (kind IN ('application','entry','source_resume','analysis','builder_draft','resume_version','ai_job','conversation','message','connection','usage','profile','job_match','discovery_run'));
--> statement-breakpoint
CREATE UNIQUE INDEX records_one_profile_per_owner ON tracker.records(owner_id) WHERE kind = 'profile';
