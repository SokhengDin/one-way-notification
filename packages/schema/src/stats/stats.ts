import { Schema } from "effect";
import { channelTypeSchema } from "../enums";

// Everything the overview dashboard shows, for one time window.
//
// Window semantics: notifications count by their created_at; deliveries by
// their created_at (when the send was requested) with their *current*
// status; provider attempts and cost by provider_usage_log.attempted_at.
// Days are calendar days in the requested timezone.

export const MAX_STATS_DAYS     = 365;
export const DEFAULT_STATS_DAYS = 30;

const Count = Schema.Int;

export class StatsRange extends Schema.Class<StatsRange>("StatsRange")({
  days:     Schema.Int,
  timezone: Schema.String,
  from:     Schema.Date,
  to:       Schema.Date,
}) {}

export class StatsTotals extends Schema.Class<StatsTotals>("StatsTotals")({
  notifications: Count,
  deliveries:    Count,
  sent:          Count,
  failed:        Count,
  pending:       Count,
  retrying:      Count,
  skipped:       Count,
  // sent / (sent + failed); null when nothing has finished
  success_rate:  Schema.NullOr(Schema.Number),
  // mean attempts per finished delivery
  avg_attempts:  Schema.NullOr(Schema.Number),
  // summed provider cost, decimal string (NUMERIC)
  cost:          Schema.String,
}) {}

export class StatsPreviousTotals extends Schema.Class<StatsPreviousTotals>("StatsPreviousTotals")({
  notifications: Count,
  deliveries:    Count,
  sent:          Count,
  failed:        Count,
}) {}

export class StatsDay extends Schema.Class<StatsDay>("StatsDay")({
  date:          Schema.String, // YYYY-MM-DD in the requested timezone
  notifications: Count,
  sent:          Count,
  failed:        Count,
  // pending + retrying
  in_progress:   Count,
  skipped:       Count,
}) {}

export class StatsChannel extends Schema.Class<StatsChannel>("StatsChannel")({
  channel:     channelTypeSchema,
  deliveries:  Count,
  sent:        Count,
  failed:      Count,
  in_progress: Count,
  skipped:     Count,
}) {}

export class StatsProvider extends Schema.Class<StatsProvider>("StatsProvider")({
  id:         Schema.String,
  name:       Schema.String,
  channel:    channelTypeSchema,
  kind:       Schema.NullOr(Schema.String),
  is_active:  Schema.Boolean,
  deliveries: Count,
  sent:       Count,
  failed:     Count,
  attempts:   Count,
  cost:       Schema.String,
}) {}

export class StatsEventType extends Schema.Class<StatsEventType>("StatsEventType")({
  event_type:    Schema.String,
  notifications: Count,
  sent:          Count,
  failed:        Count,
}) {}

export class StatsSystem extends Schema.Class<StatsSystem>("StatsSystem")({
  id:            Schema.String,
  name:          Schema.String,
  notifications: Count,
  sent:          Count,
  failed:        Count,
}) {}

export class StatsFailure extends Schema.Class<StatsFailure>("StatsFailure")({
  delivery_id:     Schema.String,
  notification_id: Schema.String,
  channel:         channelTypeSchema,
  event_type:      Schema.String,
  system_name:     Schema.String,
  provider_name:   Schema.NullOr(Schema.String),
  last_error:      Schema.NullOr(Schema.String),
  attempt_count:   Count,
  failed_at:       Schema.Date,
}) {}

export class StatsInventory extends Schema.Class<StatsInventory>("StatsInventory")({
  users:            Count,
  external_systems: Count,
  templates:        Count,
  providers_active: Count,
  providers_total:  Count,
}) {}

export class StatsOverview extends Schema.Class<StatsOverview>("StatsOverview")({
  range:           StatsRange,
  totals:          StatsTotals,
  previous:        StatsPreviousTotals,
  daily:           Schema.Array(StatsDay),
  channels:        Schema.Array(StatsChannel),
  providers:       Schema.Array(StatsProvider),
  event_types:     Schema.Array(StatsEventType),
  systems:         Schema.Array(StatsSystem),
  recent_failures: Schema.Array(StatsFailure),
  inventory:       StatsInventory,
}) {}
