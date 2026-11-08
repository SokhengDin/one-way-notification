import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { AdminRecord, LoginResult } from "../auth/auth";
import { AccountLocked, AuthRepoError, InvalidCredentials, Unauthorized } from "../auth/auth.errors";
import { ApiResponse } from "./response";

export class AuthApiGroup extends HttpApiGroup.make("auth")
  .add(
    HttpApiEndpoint.post("login", "/auth/login", {
      payload: Schema.Struct({
        email:    Schema.String,
        password: Schema.String,
      }),
      success: ApiResponse(LoginResult),
      error:   [InvalidCredentials, AccountLocked, AuthRepoError],
    }),
    HttpApiEndpoint.post("logout", "/auth/logout", {
      success: HttpApiSchema.NoContent,
      error:   AuthRepoError,
    }),
    HttpApiEndpoint.get("me", "/auth/me", {
      success: ApiResponse(AdminRecord),
      error:   [Unauthorized, AuthRepoError],
    }),
  )
  .prefix("/api")
{}
