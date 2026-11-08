"use client";

import { useEffect, useState } from "react";

/** The current time, refreshed every `intervalMs`, for "due now" / "in 2 min" labels. */
export function useNow(intervalMs = 10_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
