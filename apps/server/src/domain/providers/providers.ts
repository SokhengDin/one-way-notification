import { ChannelProviderNotFound } from "@repo/schema";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { makeSqlProvidersRepo } from "./providers.sql";
import type {
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

export class Providers extends Context.Service<
  Providers,
  ProvidersService
>()("app/domain/providers/Providers") {
  static readonly layer = Layer.effect(
    Providers,
    Effect.gen(function* () {
      const repo = yield* ProvidersRepo;

      // ---------- channel_providers ----------

      const addChannelProvider: ProvidersService["addChannelProvider"] =
        Effect.fn("Providers.addChannelProvider")(function* (input) {
          return yield* repo.addChannelProvider(input);
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
          const provider = yield* repo.updateChannelProvider(id, input);
          if (provider === null) {
            return yield* new ChannelProviderNotFound({ id });
          }
          return provider;
        });

      const deleteChannelProvider: ProvidersService["deleteChannelProvider"] =
        Effect.fn("Providers.deleteChannelProvider")(function* (id) {
          const deleted = yield* repo.deleteChannelProvider(id);
          if (!deleted) {
            return yield* new ChannelProviderNotFound({ id });
          }
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
        addProviderUsageLog,
        listProviderUsageLogByDelivery,
      };
    }),
  ).pipe(Layer.provide(ProvidersRepo.layer));
}
