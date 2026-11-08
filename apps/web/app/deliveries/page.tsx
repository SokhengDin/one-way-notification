"use client";

import { CHANNEL_TYPES, type ChannelType, type DeliveryListItem, type DeliveryStatus } from "@repo/schema";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DataTable, type DataTableColumn } from "../../components/data-table";
import {
  AttemptsCell,
  DeliveryActions,
  ErrorText,
  QueueActions,
  QueueTiles,
  WorkerStatus,
} from "../../components/deliveries";
import { ProviderLink, SystemLink, UserLink } from "../../components/entity-links";
import { SelectField } from "../../components/form-field";
import { PageHeader } from "../../components/page-header";
import { Segmented } from "../../components/segmented";
import { ChannelBadge, StatusBadge } from "../../components/status-badge";
import { getDeliveryQueue, listDeliveries } from "../../lib/api/deliveries";
import { timeAgo } from "../../lib/format";
import { useProviders } from "../../lib/lookups";
import { useDebounced } from "../../lib/use-debounced";
import { useMounted } from "../../lib/use-mounted";
import { useSlashFocus } from "../../lib/use-slash-focus";

type StatusFilter = "all" | DeliveryStatus;

const STATUS_TABS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: "all",       label: "All" },
  { value: "pending",   label: "Queued" },
  { value: "retrying",  label: "Retrying" },
  { value: "failed",    label: "Failed" },
  { value: "sent",      label: "Sent" },
  { value: "skipped",   label: "Skipped" },
  { value: "cancelled", label: "Cancelled" },
];

const CHANNEL_LABEL: Record<ChannelType, string> = { email: "Email", sms: "SMS", telegram: "Telegram" };

const columns: ReadonlyArray<DataTableColumn<DeliveryListItem>> = [
  {
    header: "Created",
    className: "whitespace-nowrap",
    cell: (row) => (
      <Link href={`/deliveries/${row.id}`} className="text-sm hover:underline" title={new Date(row.created_at).toLocaleString()}>
        {timeAgo(row.created_at)}
      </Link>
    ),
  },
  {
    header: "Recipient",
    cell: (row) => <UserLink id={row.user_id} name={row.user_display_name} detail={row.recipient} />,
  },
  {
    header: "Event",
    cell: (row) => (
      <div className="flex flex-col gap-0.5">
        <Link href={`/notifications/${row.notification_id}`} className="font-medium hover:underline">{row.event_type}</Link>
        <SystemLink id={row.external_system_id} name={row.system_name} className="text-xs text-muted-foreground" />
      </div>
    ),
  },
  {
    header: "Status",
    cell: (row) => (
      <div className="flex flex-col items-start gap-1">
        <StatusBadge status={row.status} inFlight={row.in_flight} />
        <ChannelBadge channel={row.channel} />
      </div>
    ),
  },
  { header: "Attempts", cell: (row) => <AttemptsCell delivery={row} /> },
  { header: "Provider", cell: (row) => <ProviderLink id={row.provider_id} name={row.provider_name} className="text-sm" /> },
  { header: "Last error", className: "max-w-xs", cell: (row) => <ErrorText text={row.last_error} /> },
  { header: "", className: "text-right", cell: (row) => <DeliveryActions delivery={row} compact /> },
];

export default function DeliveriesPage() {
  return (
    <Suspense>
      <Deliveries />
    </Suspense>
  );
}

function Deliveries() {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  // filters live in the URL, so a filtered view can be shared or bookmarked
  const status     = (searchParams.get("status") ?? "all") as StatusFilter;
  const channel    = (searchParams.get("channel") ?? "all") as ChannelType | "all";
  const providerId = searchParams.get("provider") ?? "all";
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const q          = useDebounced(search.trim());
  const [page, setPage] = useState({ skip: 0, limit: 20 });
  const searchRef = useRef<HTMLInputElement>(null);
  useSlashFocus(searchRef);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === null || value === "all" || value === "") next.delete(key);
    else next.set(key, value);
    setPage((current) => ({ ...current, skip: 0 }));
    router.replace(`${pathname}${next.size > 0 ? `?${next}` : ""}`, { scroll: false });
  };

  const providers = useProviders();

  const queueQuery = useQuery({
    queryKey:        ["delivery-queue"],
    queryFn:         getDeliveryQueue,
    refetchInterval: 5_000,
  });

  const filters = {
    ...page,
    status:      status === "all" ? undefined : status,
    channel:     channel === "all" ? undefined : channel,
    provider_id: providerId === "all" ? undefined : providerId,
    q:           q || undefined,
  };

  const deliveriesQuery = useQuery({
    queryKey:        ["deliveries", filters],
    queryFn:         () => listDeliveries(filters),
    placeholderData: keepPreviousData,
    // live while there's work in flight
    refetchInterval: (query) =>
      query.state.data?.data.items.some((item) => item.status === "pending" || item.status === "retrying") ? 5_000 : 30_000,
  });

  const mounted  = useMounted();
  const queue    = mounted ? queueQuery.data?.data : undefined;
  const filtered = status !== "all" || channel !== "all" || providerId !== "all" || q !== "";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Deliveries"
        description="Every message, per channel: what was sent, what's waiting, and what needs attention."
        actions={queue && <QueueActions queue={queue} />}
      />

      {queue && (
        <div className="-mt-2 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <WorkerStatus queue={queue} />
            <span className="text-xs text-muted-foreground">Updates every 5 seconds</span>
          </div>
          <QueueTiles queue={queue} />
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <Segmented
            label="Status"
            options={STATUS_TABS.map((tab) => ({
              ...tab,
              count:
                tab.value === "pending"  ? queue?.pending :
                tab.value === "retrying" ? queue?.retrying :
                undefined,
            }))}
            value={status}
            onChange={(value) => setParam("status", value)}
          />
          <div className="w-40">
            <SelectField
              label="Channel"
              value={channel}
              onValueChange={(value) => setParam("channel", value)}
              options={[{ value: "all", label: "All channels" }, ...CHANNEL_TYPES.map((value) => ({ value, label: CHANNEL_LABEL[value] }))]}
            />
          </div>
          <div className="w-52">
            <SelectField
              label="Provider"
              value={providerId}
              onValueChange={(value) => setParam("provider", value)}
              options={[{ value: "all", label: "All providers" }, ...providers.map((provider) => ({ value: provider.id, label: provider.name }))]}
            />
          </div>
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage((current) => ({ ...current, skip: 0 }));
              }}
              placeholder="Search recipient, user, event or error…"
              className="pr-8 pl-8"
              aria-label="Search deliveries"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            ) : (
              <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">/</kbd>
            )}
          </div>
          {deliveriesQuery.data && (
            <span className="ml-auto self-center rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground tabular-nums">
              {deliveriesQuery.data.data.total.toLocaleString()} {deliveriesQuery.data.data.total === 1 ? "row" : "rows"}
            </span>
          )}
          {filtered && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                router.replace(pathname, { scroll: false });
              }}
              className="flex h-9 items-center gap-1 px-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" /> Clear
            </button>
          )}
        </div>

        <div className={cn("transition-opacity", deliveriesQuery.isPlaceholderData && "opacity-60")}>
          <DataTable
            columns={columns}
            data={deliveriesQuery.data?.data}
            rowKey={(row) => row.id}
            rowHref={(row) => `/deliveries/${row.id}`}
            isLoading={deliveriesQuery.isLoading}
            error={deliveriesQuery.error}
            emptyMessage={filtered ? "No deliveries match these filters." : "No deliveries yet. Send a notification and it shows up here."}
            onPageChange={(skip, limit) => setPage({ skip, limit })}
          />
        </div>
      </div>
    </div>
  );
}
