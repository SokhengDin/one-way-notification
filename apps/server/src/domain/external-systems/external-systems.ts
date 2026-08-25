import {
  ExternalSystemNotFound,
  ExternalUserLinkNotFound,
} from "@repo/schema";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { makeSqlExternalSystemsRepo } from "./external-systems.sql";
import type {
  ExternalSystemRepoService as ExternalSystemRepoServiceShape,
  ExternalSystemsService,
} from "./external-systems.types";

export class ExternalSystemsRepo extends Context.Service<
  ExternalSystemsRepo,
  ExternalSystemRepoServiceShape
>()("app/domain/external-systems/ExternalSystemsRepo") {
  static readonly layer = Layer.effect(
    ExternalSystemsRepo,
    Effect.gen(function* () {
      const sql = yield* SqlClient;
      return makeSqlExternalSystemsRepo(sql);
    }),
  );
}

export class ExternalSystems extends Context.Service<
  ExternalSystems,
  ExternalSystemsService
>()("app/domain/external-systems/ExternalSystems") {
  static readonly layer = Layer.effect(
    ExternalSystems,
    Effect.gen(function* () {
      const repo = yield* ExternalSystemsRepo;

      // ---------- external_systems ----------

      const addExternalSystem: ExternalSystemsService["addExternalSystem"] =
        Effect.fn("ExternalSystems.addExternalSystem")(function* (input) {
          return yield* repo.addExternalSystem(input);
        });

      const getExternalSystemById: ExternalSystemsService["getExternalSystemById"] =
        Effect.fn("ExternalSystems.getExternalSystemById")(function* (id) {
          const system = yield* repo.findExternalSystemById(id);
          if (system === null) {
            return yield* new ExternalSystemNotFound({ id });
          }
          return system;
        });

      const listExternalSystems: ExternalSystemsService["listExternalSystems"] =
        Effect.fn("ExternalSystems.listExternalSystems")(function* (input) {
          return yield* repo.listExternalSystems(input);
        });

      const updateExternalSystem: ExternalSystemsService["updateExternalSystem"] =
        Effect.fn("ExternalSystems.updateExternalSystem")(function* (
          id,
          input,
        ) {
          const system = yield* repo.updateExternalSystem(id, input);
          if (system === null) {
            return yield* new ExternalSystemNotFound({ id });
          }
          return system;
        });

      const deleteExternalSystem: ExternalSystemsService["deleteExternalSystem"] =
        Effect.fn("ExternalSystems.deleteExternalSystem")(function* (id) {
          const deleted = yield* repo.deleteExternalSystem(id);
          if (!deleted) {
            return yield* new ExternalSystemNotFound({ id });
          }
        });

      // ---------- external_user_links ----------

      const addExternalUserLink: ExternalSystemsService["addExternalUserLink"] =
        Effect.fn("ExternalSystems.addExternalUserLink")(function* (input) {
          return yield* repo.addExternalUserLink(input);
        });

      const listExternalUserLinksByUser: ExternalSystemsService["listExternalUserLinksByUser"] =
        Effect.fn("ExternalSystems.listExternalUserLinksByUser")(function* (
          userId,
          input,
        ) {
          return yield* repo.listExternalUserLinksByUser(userId, input);
        });

      const deleteExternalUserLink: ExternalSystemsService["deleteExternalUserLink"] =
        Effect.fn("ExternalSystems.deleteExternalUserLink")(function* (id) {
          const deleted = yield* repo.deleteExternalUserLink(id);
          if (!deleted) {
            return yield* new ExternalUserLinkNotFound({ id });
          }
        });

      return {
        addExternalSystem,
        getExternalSystemById,
        listExternalSystems,
        updateExternalSystem,
        deleteExternalSystem,
        addExternalUserLink,
        listExternalUserLinksByUser,
        deleteExternalUserLink,
      };
    }),
  ).pipe(Layer.provide(ExternalSystemsRepo.layer));
}
