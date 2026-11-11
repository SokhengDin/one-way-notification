import {
  ExternalSystemNotFound,
  ExternalUserLinkNotFound,
  SystemUserInvalid,
} from "@repo/schema";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { makeSqlExternalSystemsRepo } from "./external-systems.sql";
import type {
  AddSystemUser,
  AddSystemUserInput,
  ExternalSystemRepoService as ExternalSystemRepoServiceShape,
  ExternalSystemsService,
} from "./external-systems.types";

const blank = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
};

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

/** Trims and checks what an admin typed for a new user. */
function checkSystemUser(input: AddSystemUserInput): AddSystemUser | SystemUserInvalid {
  const externalUserId = blank(input.external_user_id);
  const name           = blank(input.name);
  const email          = blank(input.email)?.toLowerCase() ?? null;
  const phone          = blank(input.phone)?.replace(/[\s().-]/g, "") ?? null;
  const telegram       = blank(input.telegram_chat_id);
  const invalid = (message: string) => new SystemUserInvalid({ message });

  if (!externalUserId)                                    return invalid("external_user_id: the id this system knows the user by is required");
  if (externalUserId.length > 200 || CONTROL.test(externalUserId)) return invalid("external_user_id: at most 200 printable characters");
  if (name && (name.length > 200 || CONTROL.test(name))) return invalid("name: at most 200 printable characters");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return invalid("email: not an email address");
  if (phone && !/^\+[1-9]\d{6,14}$/.test(phone))         return invalid("phone: use the international format, e.g. +33612345678");
  if (telegram && !/^-?\d{1,20}$/.test(telegram))         return invalid("telegram_chat_id: digits only, e.g. 123456789");
  return { external_user_id: externalUserId, name, email, phone, telegram };
}

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

      // ---------- users under a system ----------

      const requireSystem = (id: string) =>
        repo.findExternalSystemById(id).pipe(
          Effect.flatMap((system) => (system ? Effect.void : Effect.fail(new ExternalSystemNotFound({ id })))),
        );

      const listSystemUsers: ExternalSystemsService["listSystemUsers"] =
        Effect.fn("ExternalSystems.listSystemUsers")(function* (externalSystemId, input) {
          yield* requireSystem(externalSystemId);
          return yield* repo.listSystemUsers(externalSystemId, input);
        });

      const addSystemUser: ExternalSystemsService["addSystemUser"] =
        Effect.fn("ExternalSystems.addSystemUser")(function* (externalSystemId, input) {
          const checked = checkSystemUser(input);
          if (checked instanceof SystemUserInvalid) return yield* checked;
          yield* requireSystem(externalSystemId);
          return yield* repo.addSystemUser(externalSystemId, checked);
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

      const listExternalUserLinksBySystem: ExternalSystemsService["listExternalUserLinksBySystem"] =
        Effect.fn("ExternalSystems.listExternalUserLinksBySystem")(function* (
          externalSystemId,
          input,
        ) {
          return yield* repo.listExternalUserLinksBySystem(
            externalSystemId,
            input,
          );
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
        listExternalUserLinksBySystem,
        deleteExternalUserLink,
        listSystemUsers,
        addSystemUser,
      };
    }),
  ).pipe(Layer.provide(ExternalSystemsRepo.layer));
}
