import { Schema } from "effect";

export const ExternalSystemRepoOperation = Schema.Literals([
  // external_systems
  "addExternalSystem",
  "findExternalSystemById",
  "listExternalSystems",
  "updateExternalSystem",
  "deleteExternalSystem",
  // external_user_links
  "addExternalUserLink",
  "listExternalUserLinksByUser",
  "deleteExternalUserLink",
]);

export type ExternalSystemRepoOperation =
  typeof ExternalSystemRepoOperation.Type;

export class ExternalSystemRepoError extends Schema.TaggedErrorClass<ExternalSystemRepoError>()(
  "ExternalSystemRepoError",
  {
    message: Schema.String,
    operation: ExternalSystemRepoOperation,
    sqlState: Schema.optionalKey(Schema.String),
    constraint: Schema.optionalKey(Schema.String),
    cause: Schema.optionalKey(Schema.Defect()),
  },
  { httpApiStatus: 500 },
) {}

export class ExternalSystemNotFound extends Schema.TaggedErrorClass<ExternalSystemNotFound>()(
  "ExternalSystemNotFound",
  {
    id: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class ExternalSystemConflict extends Schema.TaggedErrorClass<ExternalSystemConflict>()(
  "ExternalSystemConflict",
  {
    message: Schema.String,
  },
  { httpApiStatus: 409 },
) {}

export class ExternalUserLinkNotFound extends Schema.TaggedErrorClass<ExternalUserLinkNotFound>()(
  "ExternalUserLinkNotFound",
  {
    id: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class ExternalUserLinkConflict extends Schema.TaggedErrorClass<ExternalUserLinkConflict>()(
  "ExternalUserLinkConflict",
  {
    message: Schema.String,
  },
  { httpApiStatus: 409 },
) {}
