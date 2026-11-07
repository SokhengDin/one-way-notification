"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { errorTag } from "../lib/errors";

// Retry only what a retry can fix: network failures and server-side (500)
// repo errors. A typed 4xx (…NotFound, …Invalid, …Conflict, bad request)
// will fail the same way again — retrying it just keeps the user staring at
// a spinner for several seconds before the real message appears.
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  const tag = errorTag(error);
  return tag === undefined || tag === "HttpClientError" || tag.endsWith("RepoError");
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: shouldRetry } } }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
