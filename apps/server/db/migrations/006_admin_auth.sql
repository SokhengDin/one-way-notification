-- Dashboard sign-in: administrators and their sessions.
--
--   password_hash    Argon2id (Bun.password), never returned by the API
--   failed_attempts  consecutive wrong passwords; reset on success
--   locked_until     set after too many failures; sign-in refused until then
CREATE TABLE admins (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email            TEXT NOT NULL,
    name             TEXT NOT NULL,
    password_hash    TEXT NOT NULL,
    failed_attempts  INT  NOT NULL DEFAULT 0,
    locked_until     TIMESTAMPTZ,
    last_login_at    TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ,
    deleted_at       TIMESTAMPTZ
);

CREATE UNIQUE INDEX uq_admins_email ON admins (lower(email)) WHERE deleted_at IS NULL;

-- Only a SHA-256 of the session token is stored: a database leak doesn't
-- hand out live sessions.
CREATE TABLE admin_sessions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id      UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    token_hash    TEXT NOT NULL,
    user_agent    TEXT,
    ip            TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ NOT NULL,
    revoked_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX uq_admin_sessions_token_hash ON admin_sessions (token_hash);
CREATE INDEX idx_admin_sessions_admin_id ON admin_sessions (admin_id);
