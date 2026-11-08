// Small display helpers shared by every page.

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year",   365 * 24 * 3600],
  ["month",  30 * 24 * 3600],
  ["week",   7 * 24 * 3600],
  ["day",    24 * 3600],
  ["hour",   3600],
  ["minute", 60],
  ["second", 1],
];

/** "3 minutes ago", "in 2 hours". */
export function timeAgo(value: Date | string | null | undefined, now = Date.now()): string {
  if (!value) return "—";
  const seconds = Math.round((new Date(value).getTime() - now) / 1000);
  if (Math.abs(seconds) < 5) return "just now";
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size || unit === "second") {
      return rtf.format(Math.round(seconds / size), unit);
    }
  }
  return "—";
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

/** 95 → "1m 35s" */
export function formatSeconds(total: number | null | undefined): string {
  if (total === null || total === undefined) return "—";
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m ${total % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export const shortId = (id: string) => id.slice(0, 8);
