"use client";

import type { DeliveryAttempt, DeliveryListItem } from "@repo/schema";
import { providerKindSpec } from "@repo/schema";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleDashed, Clock, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Card } from "../../../components/card";
import { DeliveryActions } from "../../../components/deliveries";
import { ProviderLink, SystemLink, UserLink } from "../../../components/entity-links";
import { IdChip } from "../../../components/id-chip";
import { PageHeader } from "../../../components/page-header";
import { ChannelBadge, StatusBadge } from "../../../components/status-badge";
import { getDelivery } from "../../../lib/api/deliveries";
import { errorMessage } from "../../../lib/errors";
import { formatDateTime, formatMs, timeAgo } from "../../../lib/format";
import { useNow } from "../../../lib/use-now";

export default function DeliveryPage() {
  const { id } = useParams<{ id: string }>();

  const query = useQuery({
    queryKey:        ["delivery", id],
    queryFn:         () => getDelivery(id),
    refetchInterval: (q) => {
      const status = q.state.data?.data.delivery.status;
      return status === "pending" || status === "retrying" ? 3_000 : false;
    },
  });

  const detail = query.data?.data;
  if (query.isError) {
    return <p className="text-sm text-destructive">{errorMessage(query.error, "Could not load this delivery.")}</p>;
  }
  if (!detail) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const { delivery, attempts } = detail;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/deliveries", label: "Deliveries" }}
        title={`${delivery.event_type} → ${delivery.user_display_name}`}
        description={`${delivery.system_name} · created ${formatDateTime(delivery.created_at)}`}
        actions={<><IdChip id={delivery.id} /><DeliveryActions delivery={delivery} /></>}
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Delivery" className="xl:col-span-1">
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 text-sm">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="flex items-center gap-2">
              <StatusBadge status={delivery.status} inFlight={delivery.in_flight} />
              <ChannelBadge channel={delivery.channel} />
            </dd>

            <dt className="text-muted-foreground">To</dt>
            <dd className="flex flex-col gap-1">
              <UserLink id={delivery.user_id} systemId={delivery.external_system_id} name={delivery.user_display_name} />
              <span className="font-mono text-xs text-muted-foreground">{delivery.recipient ?? "no address"}</span>
            </dd>

            <dt className="text-muted-foreground">Event</dt>
            <dd>
              <Link href={`/notifications/${delivery.notification_id}`} className="font-medium hover:underline">
                {delivery.event_type}
              </Link>
            </dd>

            <dt className="text-muted-foreground">System</dt>
            <dd><SystemLink id={delivery.external_system_id} name={delivery.system_name} /></dd>

            <dt className="text-muted-foreground">Provider</dt>
            <dd><ProviderLink id={delivery.provider_id} name={delivery.provider_name} /></dd>

            <dt className="text-muted-foreground">Attempts</dt>
            <dd className="tabular-nums">{delivery.attempt_count} of {delivery.max_attempts}</dd>

            <Outcome delivery={delivery} />

          </dl>

          {delivery.last_error && (
            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="mb-1 text-xs font-medium text-destructive">Last error</p>
              <p className="font-mono text-xs break-words text-destructive">{delivery.last_error}</p>
            </div>
          )}
        </Card>

        <Card title="Timeline" className="xl:col-span-2">
          <Timeline delivery={delivery} attempts={attempts} />
        </Card>
      </div>
    </div>
  );
}

function Outcome({ delivery }: { delivery: DeliveryListItem }) {
  const now = useNow();
  if (delivery.status === "sent") {
    return (
      <>
        <dt className="text-muted-foreground">Sent</dt>
        <dd title={formatDateTime(delivery.sent_at)}>{timeAgo(delivery.sent_at)}</dd>
      </>
    );
  }
  if (delivery.status === "pending" || delivery.status === "retrying") {
    const due = new Date(delivery.next_attempt_at).getTime() <= now;
    return (
      <>
        <dt className="text-muted-foreground">Next try</dt>
        <dd title={formatDateTime(delivery.next_attempt_at)}>
          {delivery.in_flight ? "sending now" : due ? "due now" : timeAgo(delivery.next_attempt_at)}
        </dd>
      </>
    );
  }
  return null;
}

interface TimelineEntry {
  readonly key:   string;
  readonly at:    Date;
  readonly icon:  "ok" | "fail" | "wait" | "start";
  readonly title: React.ReactNode;
  readonly body?: React.ReactNode;
}

function Timeline({ delivery, attempts }: { delivery: DeliveryListItem; attempts: ReadonlyArray<DeliveryAttempt> }) {
  const now = useNow();
  const entries: Array<TimelineEntry> = [
    {
      key:   "created",
      at:    new Date(delivery.created_at),
      icon:  "start",
      title: "Queued",
      body:  delivery.recipient ? `for ${delivery.recipient}` : undefined,
    },
    ...[...attempts].reverse().map((attempt): TimelineEntry => ({
      key:   attempt.id,
      at:    new Date(attempt.attempted_at),
      icon:  attempt.success ? "ok" : "fail",
      title: (
        <span className="flex flex-wrap items-center gap-2">
          {attempt.success ? "Accepted by" : "Rejected by"}
          <ProviderLink id={attempt.provider_id} name={attempt.provider_name} className="font-medium" />
          {attempt.provider_kind && (
            <span className="text-xs text-muted-foreground">{providerKindSpec(attempt.provider_kind)?.label ?? attempt.provider_kind}</span>
          )}
        </span>
      ),
      body: (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {attempt.status_code !== null && <span>Status {attempt.status_code}</span>}
            {attempt.duration_ms !== null && <span>{formatMs(attempt.duration_ms)}</span>}
            {attempt.provider_ref_id && <span className="font-mono">ref {attempt.provider_ref_id}</span>}
          </div>
          {attempt.error && <p className="font-mono text-xs break-words text-destructive">{attempt.error}</p>}
        </div>
      ),
    })),
  ];

  if ((delivery.status === "pending" || delivery.status === "retrying") && !delivery.in_flight) {
    entries.push({
      key:   "next",
      at:    new Date(delivery.next_attempt_at),
      icon:  "wait",
      title: new Date(delivery.next_attempt_at).getTime() <= now ? "Waiting for the worker" : `Next try ${timeAgo(delivery.next_attempt_at, now)}`,
    });
  }
  if (delivery.status === "skipped" || delivery.status === "cancelled") {
    entries.push({
      key:   "end",
      at:    new Date(delivery.updated_at ?? delivery.created_at),
      icon:  "fail",
      title: delivery.status === "skipped" ? "Skipped" : "Cancelled",
      body:  delivery.last_error ?? undefined,
    });
  }

  return (
    <ol className="relative flex flex-col gap-5 pl-7">
      <span className="absolute top-2 bottom-2 left-[9px] w-px bg-border" aria-hidden />
      {entries.map((entry) => (
        <li key={entry.key} className="relative">
          <TimelineIcon kind={entry.icon} />
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <div className="text-sm">{entry.title}</div>
            <time className="text-xs text-muted-foreground" title={formatDateTime(entry.at)}>
              {formatDateTime(entry.at)}
            </time>
          </div>
          {entry.body && <div className="mt-1 text-sm text-muted-foreground">{entry.body}</div>}
        </li>
      ))}
      {attempts.length === 0 && delivery.status !== "skipped" && delivery.status !== "cancelled" && (
        <li className="text-sm text-muted-foreground">No send attempts yet.</li>
      )}
    </ol>
  );
}

function TimelineIcon({ kind }: { kind: TimelineEntry["icon"] }) {
  const Icon = kind === "ok" ? CheckCircle2 : kind === "fail" ? XCircle : kind === "wait" ? Clock : CircleDashed;
  return (
    <span className="absolute top-0.5 -left-7 flex size-5 items-center justify-center rounded-full bg-card">
      <Icon
        className={cn(
          "size-5",
          kind === "ok" && "text-success",
          kind === "fail" && "text-destructive",
          kind === "wait" && "text-warning",
          kind === "start" && "text-muted-foreground",
        )}
      />
    </span>
  );
}
