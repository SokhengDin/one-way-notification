import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { UsersApiGroup } from "./users";

export class SystemApiGroup extends HttpApiGroup.make("system", {
  topLevel: true,
}).add(
  HttpApiEndpoint.get("health", "/health", {
    success: HttpApiSchema.NoContent,
  }),
) {}

export class Api extends HttpApi.make("one-way-notification-api")
  .add(UsersApiGroup)
  .add(SystemApiGroup)
{}
