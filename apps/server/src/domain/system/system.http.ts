import { Api } from "@repo/schema";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

export const SystemApiHandlers = HttpApiBuilder.group(
  Api,
  "system",
  Effect.fn(function* (handlers) {
    return handlers.handle("health", () => Effect.void);
  }),
);
