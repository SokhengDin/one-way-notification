"use client";

import type { NotificationSummary } from "@repo/schema";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { LinkButton } from "../../components/button";
import { DataTable, type DataTableColumn } from "../../components/data-table";
import { SystemLink, UserLink } from "../../components/entity-links";
import { PageHeader } from "../../components/page-header";
import { SystemPicker } from "../../components/pickers";
import { Segmented } from "../../components/segmented";
import { OutcomeSummary } from "../../components/notification-outcome";
import { ChannelBadge } from "../../components/status-badge";
import { listNotifications, type NotificationOutcome } from "../../lib/api/notifications";
import { timeAgo } from "../../lib/format";

type OutcomeFilter = "all" | NotificationOutcome;

const OUTCOMES: ReadonlyArray<{ value: OutcomeFilter; label: string }> = [
  { value: "all",    label: "All" },
  { value: "active", label: "In progress" },
  { value: "failed", label: "With failures" },
  { value: "sent",   label: "Delivered" },
];

const columns: ReadonlyArray<DataTableColumn<NotificationSummary>> = [
  {
    header: "Event",
    cell: (row) => (
      <Link href={`/notifications/${row.id}`} className="font-medium hover:underline">
        {row.event_type}
      </Link>
    ),
  },
  { header: "User", cell: (row) => <UserLink id={row.user_id} name={row.user_display_name} /> },
  { header: "External system", cell: (row) => <SystemLink id={row.external_system_id} name={row.system_name} /> },
  {
    header: "Channels",
    cell: (row) => (
      <div className="flex flex-wrap gap-1">
        {row.channels.map((channel) => <ChannelBadge key={channel} channel={channel} />)}
      </div>
    ),
  },
  { header: "Outcome", cell: (row) => <OutcomeSummary row={row} /> },
  {
    header: "Created",
    className: "whitespace-nowrap text-muted-foreground",
    cell: (row) => <span title={new Date(row.created_at).toLocaleString()}>{timeAgo(row.created_at)}</span>,
  },
];

export default function NotificationsPage() {
  const [pagination, setPagination] = useState({ skip: 0, limit: 20 });
  const [outcome, setOutcome]       = useState<OutcomeFilter>("all");
  const [systemId, setSystemId]     = useState("");

  const filters = {
    ...pagination,
    outcome:            outcome === "all" ? undefined : outcome,
    external_system_id: systemId || undefined,
  };

  const query = useQuery({
    queryKey:        ["notifications", filters],
    queryFn:         () => listNotifications(filters),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <PageHeader
        title="Sent notifications"
        description="Each event an external system sent, and how its deliveries went."
        actions={<LinkButton href="/notifications/new">New notification</LinkButton>}
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Segmented
          label="Outcome"
          options={OUTCOMES}
          value={outcome}
          onChange={(value) => {
            setOutcome(value);
            setPagination((current) => ({ ...current, skip: 0 }));
          }}
        />
        <div className="w-64">
          <SystemPicker
            label="External system"
            value={systemId}
            placeholder="All systems"
            onChange={(id) => {
              setSystemId(id === systemId ? "" : id);
              setPagination((current) => ({ ...current, skip: 0 }));
            }}
          />
        </div>
        {systemId && (
          <button type="button" className="h-9 text-sm text-muted-foreground hover:text-foreground" onClick={() => setSystemId("")}>
            Clear
          </button>
        )}
      </div>
      <div className={cn("transition-opacity", query.isPlaceholderData && "opacity-60")}>
        <DataTable
          columns={columns}
          data={query.data?.data}
          rowKey={(row) => row.id}
          isLoading={query.isLoading}
          error={query.error}
          emptyMessage="No notifications match."
          onPageChange={(skip, limit) => setPagination({ skip, limit })}
        />
      </div>
    </div>
  );
}
