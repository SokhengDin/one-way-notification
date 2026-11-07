import {
  ChannelProviderNotFound,
  ProviderInvalid,
  ProviderSecretsUnavailable,
  providerKindSpec,
  validateProviderConfig,
  type ProviderKindSpec,
} from "@repo/schema";
import { Context, Effect, Layer, Option, Redacted } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { AppConfigLive, AppConfigService } from "../../config/config";
import { decryptSecrets, deriveKey, encryptSecrets, type SecretValues } from "./provider-secrets";
import { makeSqlProvidersRepo } from "./providers.sql";
import type {
  ProviderConfig,
  ProviderRepoService as ProviderRepoServiceShape,
  ProvidersService,
} from "./providers.types";

export class ProvidersRepo extends Context.Service<
  ProvidersRepo,
  ProviderRepoServiceShape
>()("app/domain/providers/ProvidersRepo") {
  static readonly layer = Layer.effect(
    ProvidersRepo,
    Effect.gen(function* () {
      const sql = yield* SqlClient;
      return makeSqlProvidersRepo(sql);
    }),
  );
}

// ---------- pure helpers ----------

const invalid = (problems: ReadonlyArray<string>) =>
  new ProviderInvalid({
    message: problems.length === 1 ? problems[0]! : `Provider configuration has ${problems.length} problems`,
    issues:  [...problems],
  });

/** Trim text, drop blanks, fill catalog defaults for omitted fields. */
function normalizeConfig(spec: ProviderKindSpec, config: ProviderConfig): ProviderConfig {
  const result: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(config)) {
    const cleaned = typeof value === "string" ? value.trim() : value;
    if (cleaned !== "") result[key] = cleaned;
  }
  for (const field of spec.fields) {
    if (!field.secret && field.default !== undefined && result[field.key] === undefined) {
      result[field.key] = field.default;
    }
  }
  return result;
}

const validatePriority = (priority: number | undefined) =>
  priority === undefined || (Number.isInteger(priority) && priority >= 0 && priority <= 1000)
    ? []
    : ["priority: must be a whole number between 0 and 1000"];

const validateName = (name: string | undefined) =>
  name === undefined || name.trim().length > 0 ? [] : ["name: must not be empty"];

export class Providers extends Context.Service<
  Providers,
  ProvidersService
>()("app/domain/providers/Providers") {
  static readonly layer = Layer.effect(
    Providers,
    Effect.gen(function* () {
      const repo   = yield* ProvidersRepo;
      const config = yield* AppConfigService;

      const key = Option.map(config.providerSecretKey, (secret) => deriveKey(Redacted.value(secret)));

      const requireKey = Effect.fn("Providers.requireKey")(function* () {
        if (Option.isNone(key)) {
          return yield* new ProviderSecretsUnavailable({
            message: "PROVIDER_SECRET_KEY is not set on the server, so credentials can't be stored. Set it and restart the API.",
          });
        }
        return key.value;
      });

      const encrypt = Effect.fn("Providers.encrypt")(function* (providerId: string, values: SecretValues) {
        if (Object.keys(values).length === 0) return null;
        return encryptSecrets(yield* requireKey(), providerId, values);
      });

      const decrypt = Effect.fn("Providers.decrypt")(function* (providerId: string, blob: Uint8Array | null) {
        if (blob === null) return {} as SecretValues;
        const values = decryptSecrets(yield* requireKey(), providerId, blob);
        if (values === null) {
          return yield* new ProviderSecretsUnavailable({
            message: "Stored credentials can't be decrypted — PROVIDER_SECRET_KEY has changed since they were saved. Re-enter them.",
          });
        }
        return values;
      });

      // ---------- channel_providers ----------

      const addChannelProvider: ProvidersService["addChannelProvider"] =
        Effect.fn("Providers.addChannelProvider")(function* (input) {
          const spec = providerKindSpec(input.kind);
          if (!spec) {
            return yield* invalid([`kind: unknown provider "${input.kind}"`]);
          }
          if (spec.channel !== input.channel) {
            return yield* invalid([`kind: ${spec.label} is a ${spec.channel} provider, not ${input.channel}`]);
          }

          const providerConfig = normalizeConfig(spec, input.config);
          const secrets        = Object.fromEntries(
            Object.entries(input.secrets ?? {}).filter(([, value]) => value.trim() !== ""),
          );

          const problems = [
            ...validateName(input.name),
            ...validatePriority(input.priority),
            ...validateProviderConfig(spec, providerConfig, Object.keys(secrets)),
          ];
          if (problems.length > 0) {
            return yield* invalid(problems);
          }

          const id = crypto.randomUUID();
          return yield* repo.addChannelProvider({
            id,
            channel:     input.channel,
            name:        input.name.trim(),
            kind:        spec.kind,
            is_active:   input.is_active ?? true,
            priority:    input.priority ?? 100,
            config:      providerConfig,
            secrets:     yield* encrypt(id, secrets),
            secret_keys: Object.keys(secrets).sort(),
          });
        });

      const getChannelProviderById: ProvidersService["getChannelProviderById"] =
        Effect.fn("Providers.getChannelProviderById")(function* (id) {
          const provider = yield* repo.findChannelProviderById(id);
          if (provider === null) {
            return yield* new ChannelProviderNotFound({ id });
          }
          return provider;
        });

      const listChannelProviders: ProvidersService["listChannelProviders"] =
        Effect.fn("Providers.listChannelProviders")(function* (input) {
          return yield* repo.listChannelProviders(input);
        });

      const updateChannelProvider: ProvidersService["updateChannelProvider"] =
        Effect.fn("Providers.updateChannelProvider")(function* (id, input) {
          const current = yield* repo.findChannelProviderWithSecrets(id);
          if (current === null) {
            return yield* new ChannelProviderNotFound({ id });
          }

          const problems = [...validateName(input.name), ...validatePriority(input.priority)];
          const touchesConfig  = input.config !== undefined;
          const secretChanges  = Object.entries(input.secrets ?? {}).filter(([, value]) => value !== "");
          const touchesSecrets = secretChanges.length > 0;

          if (!touchesConfig && !touchesSecrets) {
            if (problems.length > 0) return yield* invalid(problems);
            const updated = yield* repo.updateChannelProvider(id, {
              name:      input.name?.trim(),
              is_active: input.is_active,
              priority:  input.priority,
            });
            if (updated === null) return yield* new ChannelProviderNotFound({ id });
            return updated;
          }

          const spec = current.record.kind ? providerKindSpec(current.record.kind) : undefined;
          if (!spec) {
            return yield* invalid([
              "kind: this provider was created before provider configuration existed — create a new one to configure it",
            ]);
          }

          const nextConfig = touchesConfig ? normalizeConfig(spec, input.config!) : current.record.config;

          // only decrypt (and so only need the key) when credentials change
          let nextSecrets: SecretValues | undefined;
          if (touchesSecrets) {
            const merged: Record<string, string> = { ...(yield* decrypt(id, current.secrets)) };
            for (const [field, value] of secretChanges) {
              if (value === null) delete merged[field];
              else merged[field] = value;
            }
            nextSecrets = merged;
          }

          problems.push(
            ...validateProviderConfig(spec, nextConfig, nextSecrets ? Object.keys(nextSecrets) : current.record.secret_keys),
          );
          if (problems.length > 0) {
            return yield* invalid(problems);
          }

          const updated = yield* repo.updateChannelProvider(id, {
            name:      input.name?.trim(),
            is_active: input.is_active,
            priority:  input.priority,
            config:    touchesConfig ? nextConfig : undefined,
            secrets:   nextSecrets
              ? { blob: yield* encrypt(id, nextSecrets), keys: Object.keys(nextSecrets).sort() }
              : undefined,
          });
          if (updated === null) {
            return yield* new ChannelProviderNotFound({ id });
          }
          return updated;
        });

      const deleteChannelProvider: ProvidersService["deleteChannelProvider"] =
        Effect.fn("Providers.deleteChannelProvider")(function* (id) {
          const deleted = yield* repo.deleteChannelProvider(id);
          if (!deleted) {
            return yield* new ChannelProviderNotFound({ id });
          }
        });

      const resolveProviderCredentials: ProvidersService["resolveProviderCredentials"] =
        Effect.fn("Providers.resolveProviderCredentials")(function* (id) {
          const current = yield* repo.findChannelProviderWithSecrets(id);
          if (current === null) {
            return yield* new ChannelProviderNotFound({ id });
          }
          if (current.record.kind === null) {
            return yield* invalid(["kind: this provider has no configuration"]);
          }
          return {
            id,
            channel: current.record.channel,
            kind:    current.record.kind,
            config:  current.record.config,
            secrets: yield* decrypt(id, current.secrets),
          };
        });

      // ---------- provider_usage_log ----------

      const addProviderUsageLog: ProvidersService["addProviderUsageLog"] =
        Effect.fn("Providers.addProviderUsageLog")(function* (input) {
          return yield* repo.addProviderUsageLog(input);
        });

      const listProviderUsageLogByDelivery: ProvidersService["listProviderUsageLogByDelivery"] =
        Effect.fn("Providers.listProviderUsageLogByDelivery")(function* (
          deliveryId,
          input,
        ) {
          return yield* repo.listProviderUsageLogByDelivery(
            deliveryId,
            input,
          );
        });

      return {
        addChannelProvider,
        getChannelProviderById,
        listChannelProviders,
        updateChannelProvider,
        deleteChannelProvider,
        resolveProviderCredentials,
        addProviderUsageLog,
        listProviderUsageLogByDelivery,
      };
    }),
  ).pipe(Layer.provide([ProvidersRepo.layer, AppConfigLive]));
}
