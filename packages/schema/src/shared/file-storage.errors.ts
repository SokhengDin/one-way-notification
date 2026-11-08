import { Schema } from "effect";

// The file storage service (file-vault) is not configured, unreachable, or
// refused the request. Callers can retry later; nothing was half-written.
export class FileStorageUnavailable extends Schema.TaggedErrorClass<FileStorageUnavailable>()(
  "FileStorageUnavailable",
  {
    message: Schema.String,
  },
  { httpApiStatus: 503 },
) {}
