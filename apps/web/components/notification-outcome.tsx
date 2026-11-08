import type { NotificationSummary } from "@repo/schema";

/** One compact line saying how the notification's deliveries went. */
export function OutcomeSummary({ row }: { row: NotificationSummary }) {
  const parts: Array<{ label: string; className: string }> = [];
  if (row.deliveries_sent > 0)    parts.push({ label: `${row.deliveries_sent} sent`, className: "text-success" });
  if (row.deliveries_failed > 0)  parts.push({ label: `${row.deliveries_failed} failed`, className: "text-destructive" });
  if (row.deliveries_active > 0)  parts.push({ label: `${row.deliveries_active} in progress`, className: "text-warning" });
  if (row.deliveries_skipped > 0) parts.push({ label: `${row.deliveries_skipped} skipped`, className: "text-muted-foreground" });
  if (parts.length === 0) return <span className="text-muted-foreground">No deliveries</span>;
  return (
    <span className="flex flex-wrap gap-x-2 text-sm">
      {parts.map((part) => <span key={part.label} className={part.className}>{part.label}</span>)}
    </span>
  );
}
