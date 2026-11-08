"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * false during server rendering and hydration, true after. For UI driven by
 * client-only data (e.g. a query another component already cached), so the
 * first client render matches the server HTML.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
