-- API keys issued from the dashboard, replacing the plaintext
-- external_systems.api_key column.
--
--   key_hash      SHA-256 (hex) of the whole key. The key itself is shown
--                 once when issued and never stored: a database leak hands
--                 out nothing that can send.
--   prefix        public part ("ownk_Ab12Cd34") and last_four, so people can
--                 tell keys apart without seeing them
--   expires_at    required for issued keys; only migrated (legacy) keys may
--                 have none, until someone rotates them
--   revoked_at    revocation is immediate: every request checks it
--   last_used_*   written at most once a minute per key
CREATE TABLE api_keys (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_system_id  UUID NOT NULL REFERENCES external_systems(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    prefix              TEXT NOT NULL,
    last_four           TEXT NOT NULL,
    key_hash            TEXT NOT NULL,
    legacy              BOOLEAN NOT NULL DEFAULT false,
    created_by          UUID REFERENCES admins(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at          TIMESTAMPTZ,
    revoked_at          TIMESTAMPTZ,
    revoked_by          UUID REFERENCES admins(id) ON DELETE SET NULL,
    last_used_at        TIMESTAMPTZ,
    last_used_ip        TEXT,
    CONSTRAINT ck_api_keys_expiry CHECK (legacy OR expires_at IS NOT NULL),
    CONSTRAINT ck_api_keys_name   CHECK (length(btrim(name)) BETWEEN 1 AND 100)
);

CREATE UNIQUE INDEX uq_api_keys_key_hash ON api_keys (key_hash);
CREATE INDEX idx_api_keys_external_system_id ON api_keys (external_system_id, created_at DESC);

-- Existing keys keep working, now stored as a hash. Short legacy keys don't
-- get their last characters shown: that would give most of them away.
INSERT INTO api_keys (external_system_id, name, prefix, last_four, key_hash, legacy, created_at)
SELECT id,
       'Migrated key',
       'legacy',
       CASE WHEN length(api_key) >= 20 THEN right(api_key, 4) ELSE '····' END,
       encode(sha256(convert_to(api_key, 'UTF8')), 'hex'),
       true,
       created_at
FROM external_systems
WHERE deleted_at IS NULL
  AND api_key <> '';

DROP INDEX IF EXISTS uq_external_systems_api_key;
ALTER TABLE external_systems DROP COLUMN api_key;
