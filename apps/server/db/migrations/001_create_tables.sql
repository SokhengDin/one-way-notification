CREATE TYPE channel_type AS ENUM ('email', 'sms', 'telegram');

CREATE TYPE delivery_status AS ENUM ('pending', 'sent', 'failed', 'retrying', 'skipped');

CREATE TABLE external_systems (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    api_key     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ,
    deleted_at  TIMESTAMPTZ
);

CREATE UNIQUE INDEX uq_external_systems_name
    ON external_systems (name) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_external_systems_api_key
    ON external_systems (api_key) WHERE deleted_at IS NULL;

CREATE INDEX idx_external_systems_deleted_at ON external_systems (deleted_at);

CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ,
    deleted_at  TIMESTAMPTZ
);

CREATE INDEX idx_users_deleted_at ON users (deleted_at);

CREATE TABLE external_user_links (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_system_id  UUID NOT NULL REFERENCES external_systems(id),
    external_user_id    TEXT NOT NULL,
    user_id             UUID NOT NULL REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ,
    deleted_at          TIMESTAMPTZ
);

CREATE UNIQUE INDEX uq_external_user_links
    ON external_user_links (external_system_id, external_user_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_external_user_links_user_id ON external_user_links (user_id);
CREATE INDEX idx_external_user_links_deleted_at ON external_user_links (deleted_at);

CREATE TABLE user_contacts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id),
    channel     channel_type NOT NULL,
    address     TEXT,
    linked      BOOLEAN NOT NULL DEFAULT FALSE,
    verified    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ,

    CONSTRAINT chk_user_contacts_address CHECK (channel = 'telegram' OR address IS NOT NULL)
);

CREATE UNIQUE INDEX uq_user_contacts_user_channel
    ON user_contacts (user_id, channel) WHERE deleted_at IS NULL;

CREATE INDEX idx_user_contacts_user_id ON user_contacts (user_id);
CREATE INDEX idx_user_contacts_deleted_at ON user_contacts (deleted_at);

CREATE TABLE user_preferences (
    user_id     UUID NOT NULL REFERENCES users(id),
    channel     channel_type NOT NULL,
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,

    PRIMARY KEY (user_id, channel)
);

CREATE TABLE notification_templates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_system_id  UUID NOT NULL REFERENCES external_systems(id),
    event_type          TEXT NOT NULL,
    channel             channel_type NOT NULL,
    template            TEXT NOT NULL,
    subject             TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,

    CONSTRAINT chk_notification_templates_subject CHECK (channel != 'email' OR subject IS NOT NULL)
);

CREATE UNIQUE INDEX uq_notification_templates
    ON notification_templates (external_system_id, event_type, channel)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_notification_templates_lookup
    ON notification_templates (external_system_id, event_type, channel);

CREATE INDEX idx_notification_templates_deleted_at ON notification_templates (deleted_at);

CREATE TABLE channel_providers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel     channel_type NOT NULL,
    name        TEXT NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ,
    deleted_at  TIMESTAMPTZ
);

CREATE UNIQUE INDEX uq_channel_providers_name
    ON channel_providers (name) WHERE deleted_at IS NULL;

CREATE INDEX idx_channel_providers_channel_active
    ON channel_providers (channel, is_active) WHERE deleted_at IS NULL;

CREATE TABLE notifications (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_system_id   UUID NOT NULL REFERENCES external_systems(id),
    user_id              UUID NOT NULL REFERENCES users(id),
    event_type           TEXT NOT NULL,
    payload              JSONB NOT NULL,
    idempotency_key      TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ,
    deleted_at           TIMESTAMPTZ
);

CREATE UNIQUE INDEX uq_notifications_idempotency_key
    ON notifications (idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX idx_notifications_user_id            ON notifications (user_id);
CREATE INDEX idx_notifications_external_system_id ON notifications (external_system_id);
CREATE INDEX idx_notifications_event_type         ON notifications (event_type);
CREATE INDEX idx_notifications_created_at         ON notifications (created_at);
CREATE INDEX idx_notifications_deleted_at         ON notifications (deleted_at);

CREATE TABLE notification_deliveries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES notifications(id),
    channel         channel_type NOT NULL,
    provider_id     UUID REFERENCES channel_providers(id) ON DELETE SET NULL,
    status          delivery_status NOT NULL DEFAULT 'pending',
    attempt_count   INT NOT NULL DEFAULT 0,
    last_error      TEXT,
    sent_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ,

    CONSTRAINT chk_notification_deliveries_attempt_count CHECK (attempt_count >= 0)
);

CREATE INDEX idx_notification_deliveries_notification_id
    ON notification_deliveries (notification_id);

CREATE INDEX idx_notification_deliveries_status
    ON notification_deliveries (status)
    WHERE status IN ('pending', 'retrying') AND deleted_at IS NULL;

CREATE INDEX idx_notification_deliveries_provider_id
    ON notification_deliveries (provider_id);

CREATE TABLE provider_usage_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id     UUID NOT NULL REFERENCES notification_deliveries(id) ON DELETE CASCADE,
    provider_id     UUID NOT NULL REFERENCES channel_providers(id) ON DELETE RESTRICT,
    provider_ref_id TEXT,
    status_code     INT,
    cost            NUMERIC(10,4),
    raw_response    JSONB,
    attempted_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_provider_usage_log_delivery_id  ON provider_usage_log (delivery_id);
CREATE INDEX idx_provider_usage_log_provider_id  ON provider_usage_log (provider_id);
CREATE INDEX idx_provider_usage_log_attempted_at ON provider_usage_log (attempted_at);