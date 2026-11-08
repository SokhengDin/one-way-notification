"use client";

// Name lookups for the small, slow-changing sets (systems, providers), so a
// list of records carrying only ids can still show names.

import { useQuery } from "@tanstack/react-query";
import { listExternalSystems } from "./api/external-systems";
import { listChannelProviders } from "./api/providers";

export function useSystemNames(): ReadonlyMap<string, string> {
  const query = useQuery({
    queryKey:  ["external-systems", "names"],
    queryFn:   () => listExternalSystems({ skip: 0, limit: 100 }),
    staleTime: 60_000,
  });
  return new Map((query.data?.data.items ?? []).map((system) => [system.id, system.name]));
}

export function useProviders() {
  const query = useQuery({
    queryKey:  ["channel-providers", "all"],
    queryFn:   () => listChannelProviders({ skip: 0, limit: 100 }),
    staleTime: 30_000,
  });
  return query.data?.data.items ?? [];
}
