"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { isUnauthorized } from "../lib/api-client";
import { errorMessage, errorTag } from "../lib/errors";
import { toast } from "../lib/toast";

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: {
      /** toast shown when the mutation succeeds */
      readonly success?: string;
      /** title of the error toast, e.g. "Could not delete the user" */
      readonly error?: string;
      /** the page already shows this mutation's error next to the form: no error toast */
      readonly inline?: boolean;
    };
  }
}

// Retry only what a retry can fix: network failures and server-side (500)
// repo errors. A typed 4xx (…NotFound, …Invalid, …Conflict, bad request)
// will fail the same way again — retrying it just keeps the user staring at
// a spinner for several seconds before the real message appears.
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  const tag = errorTag(error);
  return tag === undefined || tag === "HttpClientError" || tag.endsWith("RepoError");
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: shouldRetry } },

    // Every write gets feedback. A mutation with its own onError handles it
    // itself (inline form errors, a specific message); everything else gets
    // a toast here, so no button can fail silently. 401 redirects to sign-in.
    mutationCache: new MutationCache({
      onSuccess: (_data, _variables, _context, mutation) => {
        if (mutation.meta?.success) toast.success(mutation.meta.success);
      },
      onError: (error, _variables, _context, mutation) => {
        if (mutation.options.onError || mutation.meta?.inline || isUnauthorized(error)) return;
        const title = mutation.meta?.error ?? "Something went wrong";
        toast.error(title, { description: errorMessage(error, "The server didn't accept the change.") });
      },
    }),

    // A failed first load shows inline (tables, cards). A failed background
    // refresh would go unnoticed behind the old data, so it gets a toast.
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.state.data === undefined || isUnauthorized(error)) return;
        toast.warning("Couldn't refresh", { description: errorMessage(error, "Showing the last data loaded.") });
      },
    }),
  });
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeClient);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
