import { Schema } from "effect";

export class UserNotFound extends Schema.TaggedErrorClass<UserNotFound>()(
  "UserNotFound",
  {
    id: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class UserContactNotFound extends Schema.TaggedErrorClass<UserContactNotFound>()(
  "UserContactNotFound",
  {
    userId: Schema.String,
    channel: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class UserContactConflict extends Schema.TaggedErrorClass<UserContactConflict>()(
  "UserContactConflict",
  {
    message: Schema.String,
  },
  { httpApiStatus: 409 },
) {}

export class UsersError extends Schema.TaggedErrorClass<UsersError>()(
  "UsersError",
  {
    reason: Schema.Union([
      UserNotFound,
      UserContactNotFound,
      UserContactConflict,
    ]),
  },
) {}
