import { Schema } from "effect";

export class NotificationsNotFound extends Schema.TaggedErrorClass<NotificationsNotFound>()(
  "NotificationsNotFound",
  {
    id: Schema.String
  },
  {
    httpApiStatus: 404
  },
) {}

export class NotificationsError extends Schema.TaggedErrorClass<NotificationsError>()(
  "NotificationsError",
  {
    reason: Schema.Union(
      [
        NotificationsNotFound
      ]
    )
  }
) {}