-- user_labels also lists which channels the user can be reached on, so
-- the users list can show it without a request per row.
CREATE OR REPLACE VIEW user_labels AS
SELECT u.id,
       NULLIF(btrim(u.name), '') AS name,
       e.address                 AS email,
       l.external_user_id,
       COALESCE(NULLIF(btrim(u.name), ''), e.address, l.external_user_id, 'User ' || left(u.id::text, 8)) AS display_name,
       COALESCE(ch.channels, '{}') AS channels
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
) l ON TRUE
LEFT JOIN LATERAL (
    SELECT array_agg(DISTINCT c.channel::text ORDER BY c.channel::text) AS channels
    FROM user_contacts c
    WHERE c.user_id = u.id AND c.deleted_at IS NULL
      AND c.address IS NOT NULL AND btrim(c.address) <> ''
) ch ON TRUE;
