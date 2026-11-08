import { Schema } from "effect";

export const AuthRepoOperation = Schema.Literals([
  "login",
  "logout",
  "authenticate",
  "bootstrapAdmin",
]);

export type AuthRepoOperation = typeof AuthRepoOperation.Type;

export class AuthRepoError extends Schema.TaggedErrorClass<AuthRepoError>()(
  "AuthRepoError",
  {
    message:    Schema.String,
    operation:  AuthRepoOperation,
    sqlState:   Schema.optionalKey(Schema.String),
    constraint: Schema.optionalKey(Schema.String),
    cause:      Schema.optionalKey(Schema.Defect()),
  },
  { httpApiStatus: 500 },
) {}

// Deliberately one message for "no such email" and "wrong password".
export class InvalidCredentials extends Schema.TaggedErrorClass<InvalidCredentials>()(
  "InvalidCredentials",
  { message: Schema.String },
  { httpApiStatus: 401 },
) {}

export class AccountLocked extends Schema.TaggedErrorClass<AccountLocked>()(
  "AccountLocked",
  { message: Schema.String, locked_until: Schema.Date },
  { httpApiStatus: 423 },
) {}

export class Unauthorized extends Schema.TaggedErrorClass<Unauthorized>()(
  "Unauthorized",
  { message: Schema.String },
  { httpApiStatus: 401 },
) {}
