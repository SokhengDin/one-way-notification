import { Schema } from "effect";
import { channelTypeSchema, deliveryStatusSchema } from "../enums";

// The delivery pipeline as the dashboard sees it: one row per
// (notification, channel), joined with enough context to read on its own.

/** One send attempt against one provider (a provider_usage_log row). */
export class DeliveryAttempt extends Schema.Class<DeliveryAttempt>("DeliveryAttempt")({
  id:              Schema.String,
  provider_id:     Schema.String,
  provider_name:   Schema.String,
  provider_kind:   Schema.NullOr(Schema.String),
  success:         Schema.NullOr(Schema.Boolean),
  status_code:     Schema.NullOr(Schema.Int),
  error:           Schema.NullOr(Schema.String),
  provider_ref_id: Schema.NullOr(Schema.String),
  duration_ms:     Schema.NullOr(Schema.Int),
  attempted_at:    Schema.Date,
}) {}

export class DeliveryListItem extends Schema.Class<DeliveryListItem>("DeliveryListItem")({
  id:                 Schema.String,
  notification_id:    Schema.String,
  channel:            channelTypeSchema,
  status:             deliveryStatusSchema,
  recipient:          Schema.NullOr(Schema.String),
  attempt_count:      Schema.Int,
  max_attempts:       Schema.Int,
  last_error:         Schema.NullOr(Schema.String),
  next_attempt_at:    Schema.Date,
  sent_at:            Schema.NullOr(Schema.Date),
  // a worker holds the lease right now
  in_flight:          Schema.Boolean,
  provider_id:        Schema.NullOr(Schema.String),
  provider_name:      Schema.NullOr(Schema.String),
  event_type:         Schema.String,
  user_id:            Schema.String,
  user_display_name:  Schema.String,
  external_system_id: Schema.String,
  system_name:        Schema.String,
  created_at:         Schema.Date,
  updated_at:         Schema.NullOr(Schema.Date),
}) {}

export class DeliveryDetail extends Schema.Class<DeliveryDetail>("DeliveryDetail")({
  delivery: DeliveryListItem,
  attempts: Schema.Array(DeliveryAttempt),
}) {}

/** Live state of the queue, for the dashboard header. */
export class DeliveryQueueStats extends Schema.Class<DeliveryQueueStats>("DeliveryQueueStats")({
  pending:          Schema.Int,
  retrying:         Schema.Int,
  in_flight:        Schema.Int,
  // due now but not yet claimed
  due:              Schema.Int,
  // seconds the oldest due delivery has been waiting; null when none
  oldest_due_age_s: Schema.NullOr(Schema.Int),
  sent_last_hour:   Schema.Int,
  failed_last_hour: Schema.Int,
  failed_total:     Schema.Int,
  worker_enabled:   Schema.Boolean,
}) {}

export class BulkRetryResult extends Schema.Class<BulkRetryResult>("BulkRetryResult")({
  retried: Schema.Int,
}) {}

export class DeliveryProcessResult extends Schema.Class<DeliveryProcessResult>("DeliveryProcessResult")({
  claimed:  Schema.Int,
  sent:     Schema.Int,
  retrying: Schema.Int,
  failed:   Schema.Int,
}) {}
