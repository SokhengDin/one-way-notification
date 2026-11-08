// Retry schedule: 30 s, 1 min, 2 min, 4 min… capped at 1 h, with ±20 %
// jitter so a burst of failures doesn't retry in lockstep.

export const RETRY_BASE_MS = 30_000;
export const RETRY_MAX_MS  = 60 * 60_000;

/** Delay before attempt number `attempt + 1`, given `attempt` already made (≥ 1). */
export function retryDelayMs(attempt: number, random: () => number = Math.random): number {
  const exponent = Math.min(Math.max(attempt, 1) - 1, 20);
  const base     = Math.min(RETRY_BASE_MS * 2 ** exponent, RETRY_MAX_MS);
  return Math.round(base * (0.8 + random() * 0.4));
}
