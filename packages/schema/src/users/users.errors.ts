import { Schema } from "effect";

export const UserRepoOperation = Schema.Literals([
  "addUser",
  "getUserById",
  "listUsers",
  "deleteUser",
  "listUserContacts",
  "getUserContact",
  "addUserContact",
  "updateUserContact",
  "listUserPreferences",
  "setUserPreference",
]);

export type UserRepoOperation = typeof UserRepoOperation.Type;

export class UserRepoError extends Schema.TaggedErrorClass<UserRepoError>()(
  "UserRepoError",
  {
    message: Schema.String,
    operation: UserRepoOperation,
    sqlState: Schema.optionalKey(Schema.String),
    constraint: Schema.optionalKey(Schema.String),
    cause: Schema.optionalKey(Schema.Defect()),
  },
  { httpApiStatus: 500 },
) {}

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
