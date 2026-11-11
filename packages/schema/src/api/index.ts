import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { ExternalSystemsApiGroup } from "./external-systems";
import { NotificationsApiGroup } from "./notifications";
import { ProvidersApiGroup } from "./providers";
import { UsersApiGroup } from "./users";
import { AssetsApiGroup } from "./assets";
import { StatsApiGroup } from "./stats";
import { DeliveriesApiGroup } from "./deliveries";
import { AuthApiGroup } from "./auth";
import { ApiKeysApiGroup } from "./api-keys";

export class SystemApiGroup extends HttpApiGroup.make("system", {
  topLevel: true,
}).add(
  HttpApiEndpoint.get("health", "/api/health", {
    success: HttpApiSchema.NoContent,
  }),
) {}

export class Api extends HttpApi.make("one-way-notification-api")
  .add(UsersApiGroup)
  .add(NotificationsApiGroup)
  .add(ExternalSystemsApiGroup)
  .add(ProvidersApiGroup)
  .add(AssetsApiGroup)
  .add(StatsApiGroup)
  .add(DeliveriesApiGroup)
  .add(AuthApiGroup)
  .add(ApiKeysApiGroup)
  .add(SystemApiGroup)
{}
