CREATE TYPE brand_asset_kind AS ENUM ('logo', 'logo_dark', 'icon', 'email_header');

-- Logos and other brand images an external system uses in its notifications.
-- Stored in Postgres: they are small (capped at 2 MiB by the API) and this
-- keeps the service free of an object-store dependency.
--
-- Two different "gone" states:
--   replaced_at  superseded by a newer upload of the same kind. Still served,
--                because emails already delivered reference the old URL.
--   deleted_at   removed by the user. No longer served.
CREATE TABLE brand_assets (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_system_id  UUID NOT NULL REFERENCES external_systems(id),
    kind                brand_asset_kind NOT NULL,
    filename            TEXT NOT NULL,
    content_type        TEXT NOT NULL,
    byte_size           INT  NOT NULL,
    width               INT,
    height              INT,
    sha256              TEXT NOT NULL,
    data                BYTEA NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ,
    replaced_at         TIMESTAMPTZ,
    deleted_at          TIMESTAMPTZ,

    CONSTRAINT chk_brand_assets_byte_size CHECK (byte_size > 0 AND byte_size = octet_length(data)),
    CONSTRAINT chk_brand_assets_content_type CHECK (content_type IN (
        'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/x-icon'
    ))
);

-- at most one current asset per (system, kind)
CREATE UNIQUE INDEX uq_brand_assets_current
    ON brand_assets (external_system_id, kind)
    WHERE deleted_at IS NULL AND replaced_at IS NULL;

CREATE INDEX idx_brand_assets_external_system_id ON brand_assets (external_system_id);
