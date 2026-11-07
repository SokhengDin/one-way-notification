-- Provider configuration: which integration a provider uses, its settings,
-- and its credentials.
--
--   kind         catalog id (smtp, sendgrid, twilio, …); NULL for providers
--                created before configuration existed
--   config       non-secret settings (host, from_email, region, …)
--   secrets      AES-256-GCM encrypted JSON of credential fields, keyed by
--                PROVIDER_SECRET_KEY. Never returned by the API.
--   secret_keys  which credential fields are set, so the dashboard can show
--                "set" without decrypting anything
--   priority     lower is tried first when a channel has several providers
ALTER TABLE channel_providers
    ADD COLUMN kind        TEXT,
    ADD COLUMN config      JSONB  NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN secrets     BYTEA,
    ADD COLUMN secret_keys TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN priority    INT    NOT NULL DEFAULT 100;

ALTER TABLE channel_providers
    ADD CONSTRAINT chk_channel_providers_priority CHECK (priority BETWEEN 0 AND 1000);

DROP INDEX IF EXISTS idx_channel_providers_channel_active;
CREATE INDEX idx_channel_providers_channel_active
    ON channel_providers (channel, is_active, priority) WHERE deleted_at IS NULL;
