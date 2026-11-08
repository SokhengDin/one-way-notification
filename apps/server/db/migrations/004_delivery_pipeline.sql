-- Delivery pipeline: the columns the worker needs to claim, retry and fail
-- over deliveries safely, plus per-provider health for the circuit breaker.

-- An operator can stop a delivery that hasn't gone out yet. (Not used in
-- this file: a value added by ALTER TYPE can't be referenced in the same
-- transaction.)
ALTER TYPE delivery_status ADD VALUE IF NOT EXISTS 'cancelled';

-- ---------- notifications ----------

-- Idempotency keys are scoped to the external system that sent them. Two
-- systems that both happen to use "order-42" must not collide.
DROP INDEX IF EXISTS uq_notifications_idempotency_key;
CREATE UNIQUE INDEX uq_notifications_idempotency_key
    ON notifications (external_system_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- ---------- notification_deliveries ----------
--
--   recipient        address snapshotted at fan-out (email, phone, chat id),
--                    so editing a contact later doesn't change history
--   next_attempt_at  the worker only claims rows that are due
--   locked_until     lease: a claimed row is invisible to other workers until
--   locked_by        the lease expires, so a crashed worker's rows come back
--   max_attempts     per delivery, so a retry from the dashboard can extend it
ALTER TABLE notification_deliveries
    ADD COLUMN recipient       TEXT,
    ADD COLUMN next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN locked_until    TIMESTAMPTZ,
    ADD COLUMN locked_by       TEXT,
    ADD COLUMN max_attempts    INT NOT NULL DEFAULT 5;

ALTER TABLE notification_deliveries
    ADD CONSTRAINT chk_notification_deliveries_max_attempts CHECK (max_attempts BETWEEN 1 AND 50);

-- one delivery per channel per notification: makes fan-out idempotent
CREATE UNIQUE INDEX uq_notification_deliveries_notification_channel
    ON notification_deliveries (notification_id, channel)
    WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS idx_notification_deliveries_status;
CREATE INDEX idx_notification_deliveries_due
    ON notification_deliveries (next_attempt_at)
    WHERE status IN ('pending', 'retrying') AND deleted_at IS NULL;

CREATE INDEX idx_notification_deliveries_status_created
    ON notification_deliveries (status, created_at DESC)
    WHERE deleted_at IS NULL;

-- ---------- provider_usage_log ----------
--
-- One row per send attempt against one provider.
ALTER TABLE provider_usage_log
    ADD COLUMN success     BOOLEAN,
    ADD COLUMN error       TEXT,
    ADD COLUMN duration_ms INT;

-- ---------- channel_providers: health ----------
--
--   consecutive_failures  reset to 0 on any success
--   cooldown_until        circuit breaker: while in the future, the provider
--                         is tried only after every healthy one
ALTER TABLE channel_providers
    ADD COLUMN consecutive_failures INT NOT NULL DEFAULT 0,
    ADD COLUMN last_success_at      TIMESTAMPTZ,
    ADD COLUMN last_failure_at      TIMESTAMPTZ,
    ADD COLUMN last_error           TEXT,
    ADD COLUMN cooldown_until       TIMESTAMPTZ;

-- ---------- users: a human-readable label ----------
--
-- Users had no name, so the dashboard could only show UUIDs. `name` is
-- optional; `user_labels.display_name` always has something readable:
-- name → email contact → the linking system's user id → short id.
ALTER TABLE users ADD COLUMN name TEXT;

CREATE VIEW user_labels AS
SELECT u.id,
       NULLIF(btrim(u.name), '') AS name,
       e.address                 AS email,
       l.external_user_id,
       COALESCE(NULLIF(btrim(u.name), ''), e.address, l.external_user_id, 'User ' || left(u.id::text, 8)) AS display_name
FROM users u
LEFT JOIN LATERAL (
    SELECT c.address FROM user_contacts c
    WHERE c.user_id = u.id AND c.channel = 'email' AND c.deleted_at IS NULL
    ORDER BY c.created_at LIMIT 1
) e ON TRUE
LEFT JOIN LATERAL (
    SELECT x.external_user_id FROM external_user_links x
    WHERE x.user_id = u.id AND x.deleted_at IS NULL
    ORDER BY x.created_at LIMIT 1
) l ON TRUE;
