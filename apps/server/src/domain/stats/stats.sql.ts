import {
  makeMapSqlError,
  StatsChannel,
  StatsDay,
  StatsEventType,
  StatsFailure,
  StatsInventory,
  StatsOverview,
  StatsPreviousTotals,
  StatsProvider,
  StatsRange,
  StatsRepoError,
  StatsSystem,
  StatsTotals,
  type StatsRepoOperation,
} from "@repo/schema";
import { Effect } from "effect";
import type { SqlClient } from "effect/unstable/sql/SqlClient";
import type { StatsRepoService } from "./stats.types";

const { mapSqlError } = makeMapSqlError<StatsRepoOperation, StatsRepoError>(
  (fields) => new StatsRepoError(fields),
  "Failed to compute statistics",
);

const TOP_N           = 8;
const RECENT_FAILURES = 8;

// pg returns COUNT/SUM as strings for bigint/numeric; normalise at the edge
const int = (value: unknown) => Number(value ?? 0);
const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

export function makeSqlStatsRepo(sql: SqlClient): StatsRepoService {
  const overview: StatsRepoService["overview"] = Effect.fn("StatsRepo.overview")(
    function* ({ days, timezone }) {
      // Window: from local midnight (days - 1) days ago until now; the
      // previous window is the same length immediately before it.
      const [bounds] = yield* sql<{ from_ts: Date; to_ts: Date; prev_from: Date }>`
        WITH b AS (
          SELECT (date_trunc('day', now() AT TIME ZONE ${timezone})
                  - make_interval(days => ${days - 1}::int)) AT TIME ZONE ${timezone} AS from_ts,
                 now() AS to_ts
        )
        SELECT from_ts, to_ts, from_ts - make_interval(days => ${days}::int) AS prev_from FROM b
      `;
      const { from_ts: from, to_ts: to, prev_from: prevFrom } = bounds!;

      const [totalsRow] = yield* sql<Record<string, unknown>>`
        SELECT
          (SELECT count(*) FROM notifications
            WHERE deleted_at IS NULL AND created_at >= ${from} AND created_at <= ${to})               AS notifications,
          (SELECT count(*) FROM notifications
            WHERE deleted_at IS NULL AND created_at >= ${prevFrom} AND created_at < ${from})          AS prev_notifications,
          count(*)        FILTER (WHERE d.created_at >= ${from})                                      AS deliveries,
          count(*)        FILTER (WHERE d.created_at >= ${from} AND d.status = 'sent')                AS sent,
          count(*)        FILTER (WHERE d.created_at >= ${from} AND d.status = 'failed')              AS failed,
          count(*)        FILTER (WHERE d.created_at >= ${from} AND d.status = 'pending')             AS pending,
          count(*)        FILTER (WHERE d.created_at >= ${from} AND d.status = 'retrying')            AS retrying,
          count(*)        FILTER (WHERE d.created_at >= ${from} AND d.status = 'skipped')             AS skipped,
          avg(d.attempt_count) FILTER (WHERE d.created_at >= ${from} AND d.status IN ('sent', 'failed')) AS avg_attempts,
          count(*)        FILTER (WHERE d.created_at < ${from})                                       AS prev_deliveries,
          count(*)        FILTER (WHERE d.created_at < ${from} AND d.status = 'sent')                 AS prev_sent,
          count(*)        FILTER (WHERE d.created_at < ${from} AND d.status = 'failed')               AS prev_failed,
          (SELECT COALESCE(sum(cost), 0)::text FROM provider_usage_log
            WHERE attempted_at >= ${from} AND attempted_at <= ${to})                                  AS cost
        FROM notification_deliveries d
        WHERE d.deleted_at IS NULL AND d.created_at >= ${prevFrom} AND d.created_at <= ${to}
      `;
      const t = totalsRow!;
      const sent     = int(t.sent);
      const failed   = int(t.failed);
      const finished = sent + failed;

      const dailyRows = yield* sql<Record<string, unknown>>`
        WITH day_list AS (
          SELECT generate_series(
                   (${from}::timestamptz AT TIME ZONE ${timezone})::date,
                   (${to}::timestamptz   AT TIME ZONE ${timezone})::date,
                   interval '1 day'
                 )::date AS day
        ),
        n AS (
          SELECT (created_at AT TIME ZONE ${timezone})::date AS day, count(*) AS notifications
          FROM notifications
          WHERE deleted_at IS NULL AND created_at >= ${from} AND created_at <= ${to}
          GROUP BY 1
        ),
        d AS (
          SELECT (created_at AT TIME ZONE ${timezone})::date AS day,
                 count(*) FILTER (WHERE status = 'sent')                     AS sent,
                 count(*) FILTER (WHERE status = 'failed')                   AS failed,
                 count(*) FILTER (WHERE status IN ('pending', 'retrying'))   AS in_progress,
                 count(*) FILTER (WHERE status = 'skipped')                  AS skipped
          FROM notification_deliveries
          WHERE deleted_at IS NULL AND created_at >= ${from} AND created_at <= ${to}
          GROUP BY 1
        )
        SELECT to_char(day_list.day, 'YYYY-MM-DD') AS date,
               n.notifications, d.sent, d.failed, d.in_progress, d.skipped
        FROM day_list
        LEFT JOIN n USING (day)
        LEFT JOIN d USING (day)
        ORDER BY day_list.day
      `;

      const channelRows = yield* sql<Record<string, unknown>>`
        SELECT c.channel::text AS channel,
               count(d.id)                                                   AS deliveries,
               count(d.id) FILTER (WHERE d.status = 'sent')                  AS sent,
               count(d.id) FILTER (WHERE d.status = 'failed')                AS failed,
               count(d.id) FILTER (WHERE d.status IN ('pending', 'retrying')) AS in_progress,
               count(d.id) FILTER (WHERE d.status = 'skipped')               AS skipped
        FROM unnest(enum_range(NULL::channel_type)) AS c(channel)
        LEFT JOIN notification_deliveries d
               ON d.channel = c.channel AND d.deleted_at IS NULL
              AND d.created_at >= ${from} AND d.created_at <= ${to}
        GROUP BY c.channel
        ORDER BY c.channel
      `;

      const providerRows = yield* sql<Record<string, unknown>>`
        WITH d AS (
          SELECT provider_id,
                 count(*)                                  AS deliveries,
                 count(*) FILTER (WHERE status = 'sent')   AS sent,
                 count(*) FILTER (WHERE status = 'failed') AS failed
          FROM notification_deliveries
          WHERE deleted_at IS NULL AND provider_id IS NOT NULL
            AND created_at >= ${from} AND created_at <= ${to}
          GROUP BY provider_id
        ),
        u AS (
          SELECT provider_id, count(*) AS attempts, COALESCE(sum(cost), 0) AS cost
          FROM provider_usage_log
          WHERE attempted_at >= ${from} AND attempted_at <= ${to}
          GROUP BY provider_id
        )
        SELECT p.id, p.name, p.channel::text AS channel, p.kind, p.is_active,
               COALESCE(d.deliveries, 0) AS deliveries,
               COALESCE(d.sent, 0)       AS sent,
               COALESCE(d.failed, 0)     AS failed,
               COALESCE(u.attempts, 0)   AS attempts,
               COALESCE(u.cost, 0)::text AS cost
        FROM channel_providers p
        LEFT JOIN d ON d.provider_id = p.id
        LEFT JOIN u ON u.provider_id = p.id
        WHERE p.deleted_at IS NULL
        ORDER BY COALESCE(d.deliveries, 0) DESC, p.channel, p.priority, p.name
      `;

      const eventRows = yield* sql<Record<string, unknown>>`
        SELECT n.event_type,
               count(DISTINCT n.id)                          AS notifications,
               count(d.id) FILTER (WHERE d.status = 'sent')  AS sent,
               count(d.id) FILTER (WHERE d.status = 'failed') AS failed
        FROM notifications n
        LEFT JOIN notification_deliveries d ON d.notification_id = n.id AND d.deleted_at IS NULL
        WHERE n.deleted_at IS NULL AND n.created_at >= ${from} AND n.created_at <= ${to}
        GROUP BY n.event_type
        ORDER BY notifications DESC, n.event_type
        LIMIT ${TOP_N}
      `;

      const systemRows = yield* sql<Record<string, unknown>>`
        SELECT s.id, s.name,
               count(DISTINCT n.id)                           AS notifications,
               count(d.id) FILTER (WHERE d.status = 'sent')   AS sent,
               count(d.id) FILTER (WHERE d.status = 'failed') AS failed
        FROM notifications n
        JOIN external_systems s ON s.id = n.external_system_id
        LEFT JOIN notification_deliveries d ON d.notification_id = n.id AND d.deleted_at IS NULL
        WHERE n.deleted_at IS NULL AND n.created_at >= ${from} AND n.created_at <= ${to}
        GROUP BY s.id, s.name
        ORDER BY notifications DESC, s.name
        LIMIT ${TOP_N}
      `;

      const failureRows = yield* sql<Record<string, unknown>>`
        SELECT d.id AS delivery_id, d.notification_id, d.channel::text AS channel,
               n.event_type, s.name AS system_name, p.name AS provider_name,
               d.last_error, d.attempt_count,
               COALESCE(d.updated_at, d.created_at) AS failed_at
        FROM notification_deliveries d
        JOIN notifications n          ON n.id = d.notification_id
        JOIN external_systems s       ON s.id = n.external_system_id
        LEFT JOIN channel_providers p ON p.id = d.provider_id
        WHERE d.deleted_at IS NULL AND d.status = 'failed'
          AND d.created_at >= ${from} AND d.created_at <= ${to}
        ORDER BY failed_at DESC, d.id
        LIMIT ${RECENT_FAILURES}
      `;

      const [inventoryRow] = yield* sql<Record<string, unknown>>`
        SELECT
          (SELECT count(*) FROM users                  WHERE deleted_at IS NULL) AS users,
          (SELECT count(*) FROM external_systems       WHERE deleted_at IS NULL) AS external_systems,
          (SELECT count(*) FROM notification_templates WHERE deleted_at IS NULL) AS templates,
          (SELECT count(*) FROM channel_providers      WHERE deleted_at IS NULL AND is_active) AS providers_active,
          (SELECT count(*) FROM channel_providers      WHERE deleted_at IS NULL) AS providers_total
      `;
      const inv = inventoryRow!;

      return new StatsOverview({
        range: new StatsRange({ days, timezone, from, to }),
        totals: new StatsTotals({
          notifications: int(t.notifications),
          deliveries:    int(t.deliveries),
          sent,
          failed,
          pending:       int(t.pending),
          retrying:      int(t.retrying),
          skipped:       int(t.skipped),
          success_rate:  finished === 0 ? null : sent / finished,
          avg_attempts:  num(t.avg_attempts),
          cost:          String(t.cost ?? "0"),
        }),
        previous: new StatsPreviousTotals({
          notifications: int(t.prev_notifications),
          deliveries:    int(t.prev_deliveries),
          sent:          int(t.prev_sent),
          failed:        int(t.prev_failed),
        }),
        daily: dailyRows.map((row) => new StatsDay({
          date:          String(row.date),
          notifications: int(row.notifications),
          sent:          int(row.sent),
          failed:        int(row.failed),
          in_progress:   int(row.in_progress),
          skipped:       int(row.skipped),
        })),
        channels: channelRows.map((row) => new StatsChannel({
          channel:     row.channel as StatsChannel["channel"],
          deliveries:  int(row.deliveries),
          sent:        int(row.sent),
          failed:      int(row.failed),
          in_progress: int(row.in_progress),
          skipped:     int(row.skipped),
        })),
        providers: providerRows.map((row) => new StatsProvider({
          id:         String(row.id),
          name:       String(row.name),
          channel:    row.channel as StatsProvider["channel"],
          kind:       (row.kind as string | null) ?? null,
          is_active:  Boolean(row.is_active),
          deliveries: int(row.deliveries),
          sent:       int(row.sent),
          failed:     int(row.failed),
          attempts:   int(row.attempts),
          cost:       String(row.cost ?? "0"),
        })),
        event_types: eventRows.map((row) => new StatsEventType({
          event_type:    String(row.event_type),
          notifications: int(row.notifications),
          sent:          int(row.sent),
          failed:        int(row.failed),
        })),
        systems: systemRows.map((row) => new StatsSystem({
          id:            String(row.id),
          name:          String(row.name),
          notifications: int(row.notifications),
          sent:          int(row.sent),
          failed:        int(row.failed),
        })),
        recent_failures: failureRows.map((row) => new StatsFailure({
          delivery_id:     String(row.delivery_id),
          notification_id: String(row.notification_id),
          channel:         row.channel as StatsFailure["channel"],
          event_type:      String(row.event_type),
          system_name:     String(row.system_name),
          provider_name:   (row.provider_name as string | null) ?? null,
          last_error:      (row.last_error as string | null) ?? null,
          attempt_count:   int(row.attempt_count),
          failed_at:       row.failed_at as Date,
        })),
        inventory: new StatsInventory({
          users:            int(inv.users),
          external_systems: int(inv.external_systems),
          templates:        int(inv.templates),
          providers_active: int(inv.providers_active),
          providers_total:  int(inv.providers_total),
        }),
      });
    },
    // every query above shares one error mapping
    (effect) => effect.pipe(mapSqlError("overview")),
  );

  return { overview };
}
