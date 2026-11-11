"use client";

// Building blocks shared by the Deliveries page, a notification's page and
// a delivery's page.

import type { DeliveryListItem, DeliveryQueueStats } from "@repo/schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, Play, RotateCcw } from "lucide-react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { cancelDelivery, processDueDeliveries, retryDelivery, retryFailedDeliveries } from "@/lib/api/deliveries";
import { errorMessage } from "@/lib/errors";
import { formatSeconds, timeAgo } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { Button } from "./button";
import { ConfirmButton } from "./confirm-button";

/** Everything showing deliveries or their counts refetches after an action. */
export function useInvalidateDeliveries() {
  const client = useQueryClient();
  return () => {
    for (const key of ["deliveries", "delivery", "delivery-queue", "notifications", "notification", "notification-deliveries", "stats-overview", "channel-providers", "channel-provider"]) {
      void client.invalidateQueries({ queryKey: [key] });
    }
  };
}

export const canRetry  = (delivery: DeliveryListItem) =>
  !delivery.in_flight && delivery.status !== "sent" && delivery.status !== "pending";
export const canCancel = (delivery: DeliveryListItem) =>
  !delivery.in_flight && (delivery.status === "pending" || delivery.status === "retrying");

export function DeliveryActions({ delivery, compact = false }: { delivery: DeliveryListItem; compact?: boolean }) {
  const invalidate = useInvalidateDeliveries();

  const retry = useMutation({
    mutationFn: () => retryDelivery(delivery.id),
    onSuccess:  () => {
      toast.success(delivery.status === "retrying" ? "Sending now" : "Queued to send again");
      invalidate();
    },
    onError: (error) => toast.error("Could not retry", { description: errorMessage(error, "Please try again.") }),
  });

  // cancelling is reversible (a cancelled delivery can be retried), so no
  // confirmation step
  const cancel = useMutation({
    mutationFn: () => cancelDelivery(delivery.id),
    onSuccess:  () => {
      toast.success("Delivery cancelled", {
        action: {
          label:   "Undo",
          onClick: () =>
            void retryDelivery(delivery.id)
              .then(() => { toast.success("Delivery queued again"); invalidate(); })
              .catch((error: unknown) => toast.error("Could not undo", { description: errorMessage(error, "The delivery stays cancelled.") })),
        },
      });
      invalidate();
    },
    onError: (error) => toast.error("Could not cancel", { description: errorMessage(error, "Please try again.") }),
  });

  if (!canRetry(delivery) && !canCancel(delivery)) return null;

  const retryLabel = delivery.status === "retrying" ? "Send now" : "Retry";

  return (
    <div className="flex justify-end gap-1">
      {canRetry(delivery) && (
        <Button
          type="button"
          variant="outline"
          size={compact ? "icon-sm" : "default"}
          disabled={retry.isPending}
          onClick={() => retry.mutate()}
          title={delivery.status === "retrying" ? "Skip the wait and send now" : "Send again"}
          aria-label={retryLabel}
        >
          <RotateCcw className="size-3.5" />
          {!compact && retryLabel}
        </Button>
      )}
      {canCancel(delivery) && (
        <Button
          type="button"
          variant="ghost"
          size={compact ? "icon-sm" : "default"}
          disabled={cancel.isPending}
          onClick={() => cancel.mutate()}
          title="Cancel: don't send this"
          aria-label="Cancel"
        >
          <Ban className="size-3.5" />
          {!compact && "Cancel"}
        </Button>
      )}
    </div>
  );
}

/** "2 / 5" plus, for queued work, when the next try happens. */
export function AttemptsCell({ delivery }: { delivery: DeliveryListItem }) {
  const now    = useNow();
  const queued = delivery.status === "pending" || delivery.status === "retrying";
  return (
    <div className="flex flex-col leading-tight">
      <span className="tabular-nums">
        {delivery.attempt_count}
        <span className="text-muted-foreground"> / {delivery.max_attempts}</span>
      </span>
      {queued && !delivery.in_flight && (
        <span className="text-xs text-muted-foreground" title={new Date(delivery.next_attempt_at).toLocaleString()}>
          {new Date(delivery.next_attempt_at).getTime() <= now ? "due now" : `next ${timeAgo(delivery.next_attempt_at, now)}`}
        </span>
      )}
    </div>
  );
}

export function ErrorText({ text, className }: { text: string | null; className?: string }) {
  if (!text) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("line-clamp-2 block w-56 font-mono text-xs whitespace-normal break-words text-destructive", className)} title={text}>
      {text}
    </span>
  );
}

// ---------- queue ----------

function QueueTile({
  label, value, tone, hint, href,
}: { label: string; value: string; tone?: "warn" | "bad" | "good"; hint?: string; href?: string }) {
  const body = (
    <div className={cn("flex h-full flex-col gap-1 rounded-xl border bg-card px-4 py-3 transition-colors", href && "hover:bg-muted/50")}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-2xl font-semibold tabular-nums tracking-tight",
          tone === "warn" && "text-warning",
          tone === "bad"  && "text-destructive",
          tone === "good" && "text-success",
        )}
      >
        {value}
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function QueueTiles({ queue }: { queue: DeliveryQueueStats }) {
  const backlog = queue.oldest_due_age_s !== null && queue.oldest_due_age_s > 60;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <QueueTile label="Queued" value={queue.pending.toLocaleString()} href="/deliveries?status=pending" />
      <QueueTile label="Retrying" value={queue.retrying.toLocaleString()} tone={queue.retrying > 0 ? "warn" : undefined} href="/deliveries?status=retrying" />
      <QueueTile label="Sending now" value={queue.in_flight.toLocaleString()} />
      <QueueTile
        label="Waiting"
        value={queue.due.toLocaleString()}
        tone={backlog ? "warn" : undefined}
        hint={queue.oldest_due_age_s !== null ? `oldest ${formatSeconds(queue.oldest_due_age_s)}` : "nothing due"}
      />
      <QueueTile label="Sent, last hour" value={queue.sent_last_hour.toLocaleString()} tone={queue.sent_last_hour > 0 ? "good" : undefined} />
      <QueueTile
        label="Failed, last hour"
        value={queue.failed_last_hour.toLocaleString()}
        tone={queue.failed_last_hour > 0 ? "bad" : undefined}
        hint={`${queue.failed_total.toLocaleString()} failed in total`}
        href="/deliveries?status=failed"
      />
    </div>
  );
}

export function WorkerStatus({ queue }: { queue: DeliveryQueueStats }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        queue.worker_enabled ? "bg-success/15 text-success" : "bg-warning/20 text-warning-foreground",
      )}
      title={queue.worker_enabled ? "The background worker sends due deliveries continuously" : "DELIVERY_WORKER_ENABLED=false: nothing is sent unless you process the queue manually"}
    >
      <span className={cn("size-1.5 rounded-full bg-current", queue.worker_enabled && "animate-pulse")} />
      {queue.worker_enabled ? "Worker running" : "Worker paused"}
    </span>
  );
}

export function QueueActions({ queue }: { queue: DeliveryQueueStats }) {
  const invalidate = useInvalidateDeliveries();

  const process = useMutation({
    mutationFn: processDueDeliveries,
    onSuccess:  (response) => {
      const { claimed, sent, retrying, failed } = response.data;
      toast.success(claimed === 0 ? "Nothing was due" : `Processed ${claimed}: ${sent} sent, ${retrying} retrying, ${failed} failed`);
      invalidate();
    },
    onError: (error) => toast.error("Could not process the queue", { description: errorMessage(error, "Please try again.") }),
  });

  const retryAll = useMutation({
    mutationFn: () => retryFailedDeliveries(),
    onSuccess:  (response) => {
      toast.success(`Requeued ${response.data.retried} failed deliveries`);
      invalidate();
    },
    onError: (error) => toast.error("Could not requeue", { description: errorMessage(error, "Please try again.") }),
  });

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={process.isPending}
        onClick={() => process.mutate()}
        title="Send everything that's due right now, in this request"
      >
        <Play className="size-3.5" />
        {process.isPending ? "Processing…" : "Process now"}
      </Button>
      {queue.failed_total > 0 && (
        <ConfirmButton
          label={`Retry failed (${Math.min(queue.failed_total, 500).toLocaleString()})`}
          title="Retry every failed delivery?"
          description={`Up to 500 failed deliveries go back in the queue with a fresh attempt budget. Fix the cause first (provider credentials, templates), or they will fail again.`}
          confirmLabel="Retry failed"
          pendingLabel="Requeuing…"
          variant="outline"
          isPending={retryAll.isPending}
          onConfirm={() => retryAll.mutate()}
        />
      )}
    </>
  );
}
