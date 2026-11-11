// API keys external systems send with (X-Api-Key). Issued, rolled and
// revoked from the dashboard; see api-keys.crypto.ts for what a key is.

import {
  API_KEY_MAX_ACTIVE,
  API_KEY_MAX_DAYS,
  API_KEY_MIN_DAYS,
  API_KEY_ROLL_GRACE_HOURS,
  ApiKeyInvalid,
  ApiKeyLimitReached,
  ApiKeyNotFound,
  ApiKeyRepoError,
  ExternalSystemNotFound,
  IssuedApiKey,
} from "@repo/schema";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { ExternalSystemsRepo } from "../external-systems/external-systems";
import { generateApiKey, hashApiKey, plausibleApiKey } from "./api-keys.crypto";
import { makeSqlApiKeysRepo } from "./api-keys.sql";
import type { ApiKeysRepoService, ApiKeysService } from "./api-keys.types";

export class ApiKeysRepo extends Context.Service<ApiKeysRepo, ApiKeysRepoService>()("app/domain/api-keys/ApiKeysRepo") {
  static readonly layer = Layer.effect(
    ApiKeysRepo,
    Effect.gen(function* () {
      const sql = yield* SqlClient;
      return makeSqlApiKeysRepo(sql);
    }),
  );
}

function checkName(raw: string): string | ApiKeyInvalid {
  const name = raw.trim();
  if (name.length === 0)   return new ApiKeyInvalid({ message: "name: give the key a name, e.g. \"Production\"" });
  if (name.length > 100)   return new ApiKeyInvalid({ message: "name: at most 100 characters" });
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) return new ApiKeyInvalid({ message: "name: no control characters" });
  return name;
}

function checkDays(days: number): ApiKeyInvalid | null {
  return Number.isInteger(days) && days >= API_KEY_MIN_DAYS && days <= API_KEY_MAX_DAYS
    ? null
    : new ApiKeyInvalid({ message: `expires_in_days: between ${API_KEY_MIN_DAYS} and ${API_KEY_MAX_DAYS} days` });
}

const limitReached = () =>
  new ApiKeyLimitReached({
    message: `This system already has ${API_KEY_MAX_ACTIVE} working keys. Revoke one you no longer use first.`,
  });

export class ApiKeys extends Context.Service<ApiKeys, ApiKeysService>()("app/domain/api-keys/ApiKeys") {
  static readonly layer = Layer.effect(
    ApiKeys,
    Effect.gen(function* () {
      const repo    = yield* ApiKeysRepo;
      const systems = yield* ExternalSystemsRepo;
      const sql     = yield* SqlClient;

      const transaction = <A, E>(effect: Effect.Effect<A, E>) =>
        sql.withTransaction(effect).pipe(
          Effect.catchTag("SqlError", (cause) =>
            Effect.fail(new ApiKeyRepoError({ message: "Failed to save the API key", operation: "insertApiKey", cause }))),
        );

      const requireSystem = (id: string) =>
        systems.findExternalSystemById(id).pipe(
          Effect.flatMap((system) => (system ? Effect.void : Effect.fail(new ExternalSystemNotFound({ id })))),
        );

      const insert = (externalSystemId: string, name: string, days: number, adminId: string) => {
        const key = generateApiKey();
        return repo
          .insertApiKey({
            external_system_id: externalSystemId,
            name,
            prefix:          key.prefix,
            last_four:       key.last_four,
            key_hash:        key.key_hash,
            created_by:      adminId,
            expires_in_days: days,
          })
          .pipe(Effect.map((record) => new IssuedApiKey({ key: record, secret: key.secret })));
      };

      const listApiKeys: ApiKeysService["listApiKeys"] = Effect.fn("ApiKeys.listApiKeys")(function* (externalSystemId, includeInactive) {
        yield* requireSystem(externalSystemId);
        return yield* repo.listApiKeys(externalSystemId, includeInactive);
      });

      const issueApiKey: ApiKeysService["issueApiKey"] = Effect.fn("ApiKeys.issueApiKey")(function* (externalSystemId, input, adminId) {
        const name = checkName(input.name);
        if (name instanceof ApiKeyInvalid) return yield* name;
        const badDays = checkDays(input.expires_in_days);
        if (badDays) return yield* badDays;
        yield* requireSystem(externalSystemId);

        return yield* transaction(
          Effect.gen(function* () {
            // serialise issuing per system so two clicks can't pass the limit together
            yield* sql`SELECT pg_advisory_xact_lock(hashtext(${externalSystemId}))`;
            if ((yield* repo.countActiveApiKeys(externalSystemId)) >= API_KEY_MAX_ACTIVE) return yield* limitReached();
            return yield* insert(externalSystemId, name, input.expires_in_days, adminId);
          }),
        );
      });

      const revokeApiKey: ApiKeysService["revokeApiKey"] = Effect.fn("ApiKeys.revokeApiKey")(function* (id, adminId) {
        const record = yield* repo.revokeApiKey(id, adminId);
        if (!record) return yield* new ApiKeyNotFound({ id });
        return record;
      });

      const rollApiKey: ApiKeysService["rollApiKey"] = Effect.fn("ApiKeys.rollApiKey")(function* (id, input, adminId) {
        if (!(API_KEY_ROLL_GRACE_HOURS as ReadonlyArray<number>).includes(input.grace_hours)) {
          return yield* new ApiKeyInvalid({ message: `grace_hours: one of ${API_KEY_ROLL_GRACE_HOURS.join(", ")}` });
        }
        const badDays = checkDays(input.expires_in_days);
        if (badDays) return yield* badDays;

        const old = yield* repo.findApiKeyById(id);
        if (!old) return yield* new ApiKeyNotFound({ id });
        if (old.status !== "active") {
          return yield* new ApiKeyInvalid({ message: `This key is ${old.status}: issue a new key instead of rolling it.` });
        }

        return yield* transaction(
          Effect.gen(function* () {
            yield* sql`SELECT pg_advisory_xact_lock(hashtext(${old.external_system_id}))`;
            if (input.grace_hours === 0) {
              // revoked first, so rolling works even at the limit
              yield* repo.revokeApiKey(id, adminId);
            } else {
              if ((yield* repo.countActiveApiKeys(old.external_system_id)) >= API_KEY_MAX_ACTIVE) return yield* limitReached();
              yield* repo.shortenApiKey(id, input.grace_hours);
            }
            return yield* insert(old.external_system_id, old.name, input.expires_in_days, adminId);
          }),
        );
      });

      const authenticateKey: ApiKeysService["authenticateKey"] = Effect.fn("ApiKeys.authenticateKey")(function* (key, ip) {
        if (!plausibleApiKey(key)) return null;
        const found = yield* repo.findActiveKeyByHash(hashApiKey(key));
        if (!found) return null;
        // bookkeeping must never fail a send
        yield* repo.touchApiKey(found.id, ip?.slice(0, 100) ?? null).pipe(
          Effect.catch((error) => Effect.logWarning("Could not record API key use", error)),
        );
        return found.external_system_id;
      });

      return { listApiKeys, issueApiKey, revokeApiKey, rollApiKey, authenticateKey };
    }),
  ).pipe(Layer.provide([ApiKeysRepo.layer, ExternalSystemsRepo.layer]));
}
