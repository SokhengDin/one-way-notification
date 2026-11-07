import { Schema } from "effect";
import { Uuid } from "../shared/ids";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { channelTypeSchema } from "../enums";
import {
  ChannelProviderRecord,
  ProviderConfigValueSchema,
  ProviderUsageLogRecord,
} from "../providers/providers";
import {
  ChannelProviderConflict,
  ChannelProviderNotFound,
  ProviderInvalid,
  ProviderRepoError,
  ProviderSecretsUnavailable,
} from "../providers/providers.errors";
import { PaginatedData, PaginationQuery } from "../shared/pagination";
import { ApiResponse } from "./response";

export class ProvidersApiGroup extends HttpApiGroup.make("providers")
  .add(
    // ---------- channel_providers ----------
    HttpApiEndpoint.get("listChannelProviders", "/channel-provider", {
      query: {
        ...PaginationQuery,
        channel: Schema.optional(channelTypeSchema),
      },
      success: ApiResponse(PaginatedData(ChannelProviderRecord)),
      error: ProviderRepoError,
    }),
    HttpApiEndpoint.post("addChannelProvider", "/channel-provider", {
      payload: Schema.Struct({
        channel: channelTypeSchema,
        name: Schema.String,
        // a catalog id from PROVIDER_KINDS, matching the channel
        kind: Schema.String,
        is_active: Schema.optional(Schema.Boolean),
        priority: Schema.optional(Schema.Int),
        config: Schema.Record(Schema.String, ProviderConfigValueSchema),
        secrets: Schema.optional(Schema.Record(Schema.String, Schema.String)),
      }),
      success: ApiResponse(ChannelProviderRecord),
      error: [ChannelProviderConflict, ProviderInvalid, ProviderSecretsUnavailable, ProviderRepoError],
    }),
    HttpApiEndpoint.get("getChannelProviderById", "/channel-provider/:id", {
      params: { id: Uuid },
      success: ApiResponse(ChannelProviderRecord),
      error: [ChannelProviderNotFound, ProviderRepoError],
    }),
    HttpApiEndpoint.patch("updateChannelProvider", "/channel-provider/:id", {
      params: { id: Uuid },
      payload: Schema.Struct({
        name: Schema.optional(Schema.String),
        is_active: Schema.optional(Schema.Boolean),
        priority: Schema.optional(Schema.Int),
        // replaces the whole non-secret config when given
        config: Schema.optional(Schema.Record(Schema.String, ProviderConfigValueSchema)),
        // per field: a string sets it, null clears it, omitted keeps it
        secrets: Schema.optional(Schema.Record(Schema.String, Schema.NullOr(Schema.String))),
      }),
      success: ApiResponse(ChannelProviderRecord),
      error: [
        ChannelProviderNotFound,
        ChannelProviderConflict,
        ProviderInvalid,
        ProviderSecretsUnavailable,
        ProviderRepoError,
      ],
    }),
    HttpApiEndpoint.make("DELETE")(
      "deleteChannelProvider",
      "/channel-provider/:id",
      {
        params: { id: Uuid },
        success: HttpApiSchema.NoContent,
        error: [ChannelProviderNotFound, ProviderRepoError],
      },
    ),

    // ---------- provider_usage_log ----------
    HttpApiEndpoint.get(
      "listProviderUsageLogByDelivery",
      "/channel-provider/delivery/:deliveryId/usage-log",
      {
        params: { deliveryId: Uuid },
        query: PaginationQuery,
        success: ApiResponse(PaginatedData(ProviderUsageLogRecord)),
        error: ProviderRepoError,
      },
    ),
    HttpApiEndpoint.post(
      "addProviderUsageLog",
      "/channel-provider/usage-log",
      {
        payload: Schema.Struct({
          delivery_id: Uuid,
          provider_id: Uuid,
          provider_ref_id: Schema.optional(Schema.NullOr(Schema.String)),
          status_code: Schema.optional(Schema.NullOr(Schema.Int)),
          cost: Schema.optional(Schema.NullOr(Schema.String)),
          raw_response: Schema.optional(
            Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown)),
          ),
        }),
        success: ApiResponse(ProviderUsageLogRecord),
        error: ProviderRepoError,
      },
    ),
  )
  .prefix("/api")
{}
