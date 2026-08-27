import { Api, ok } from "@repo/schema";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { ExternalSystems } from "./external-systems";

export const ExternalSystemsApiHandlers = HttpApiBuilder.group(
  Api,
  "external-systems",
  Effect.fn(function* (handlers) {
    const externalSystems = yield* ExternalSystems;

    return handlers
      // ---------- external_systems ----------
      .handle("listExternalSystems", ({ query }) =>
        externalSystems
          .listExternalSystems(query)
          .pipe(Effect.map((data) => ok(data))),
      )
      .handle("addExternalSystem", ({ payload }) =>
        externalSystems
          .addExternalSystem(payload)
          .pipe(Effect.map((data) => ok(data, 201, "Created"))),
      )
      .handle("getExternalSystemById", ({ params }) =>
        externalSystems
          .getExternalSystemById(params.id)
          .pipe(Effect.map((data) => ok(data))),
      )
      .handle("updateExternalSystem", ({ params, payload }) =>
        externalSystems
          .updateExternalSystem(params.id, payload)
          .pipe(Effect.map((data) => ok(data))),
      )
      .handle("deleteExternalSystem", ({ params }) =>
        externalSystems.deleteExternalSystem(params.id),
      )
      // ---------- external_user_links ----------
      .handle("listExternalUserLinksByUser", ({ params, query }) =>
        externalSystems
          .listExternalUserLinksByUser(params.userId, query)
          .pipe(Effect.map((data) => ok(data))),
      )
      .handle("addExternalUserLink", ({ params, payload }) =>
        externalSystems
          .addExternalUserLink({
            ...payload,
            external_system_id: params.externalSystemId,
          })
          .pipe(Effect.map((data) => ok(data, 201, "Created"))),
      )
      .handle("listExternalUserLinksBySystem", ({ params, query }) =>
        externalSystems
          .listExternalUserLinksBySystem(params.externalSystemId, query)
          .pipe(Effect.map((data) => ok(data))),
      )
      .handle("deleteExternalUserLink", ({ params }) =>
        externalSystems.deleteExternalUserLink(params.id),
      );
  }),
).pipe(Layer.provide(ExternalSystems.layer));
