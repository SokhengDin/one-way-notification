"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { CHANNEL_TYPES, type ChannelType, type NotificationTemplateRecord } from "@repo/schema";
import { cn } from "@/lib/utils";
import { LinkButton } from "../../../components/button";
import { DataTable, type DataTableColumn } from "../../../components/data-table";
import { SystemLink } from "../../../components/entity-links";
import { SelectField } from "../../../components/form-field";
import { FilterSlot, ListToolbar } from "../../../components/list-toolbar";
import { PageHeader } from "../../../components/page-header";
import { SystemPicker } from "../../../components/pickers";
import { ChannelBadge } from "../../../components/status-badge";
import { listNotificationTemplates } from "../../../lib/api/notifications";
import { timeAgo } from "../../../lib/format";
import { useDebounced } from "../../../lib/use-debounced";

const CHANNEL_LABEL: Record<ChannelType, string> = { email: "Email", sms: "SMS", telegram: "Telegram" };

/** First words of the body, tags stripped: enough to recognise a template. */
function excerpt(template: string): string {
  const text = template.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > 90 ? `${text.slice(0, 90)}…` : text;
}

const columns: ReadonlyArray<DataTableColumn<NotificationTemplateRecord>> = [
  {
    header: "Event",
    cell: (row) => (
      <div className="flex flex-col gap-0.5">
        <Link href={`/notifications/templates/${row.id}`} className="font-medium hover:underline">{row.event_type}</Link>
        <span className="line-clamp-1 max-w-md text-xs text-muted-foreground">
          {row.subject ? row.subject : excerpt(row.template)}
        </span>
      </div>
    ),
  },
  { header: "Channel", cell: (row) => <ChannelBadge channel={row.channel} /> },
  { header: "External system", cell: (row) => <SystemLink id={row.external_system_id} name={row.system_name} /> },
  {
    header: "Updated",
    className: "whitespace-nowrap text-muted-foreground",
    cell: (row) => <span title={new Date(row.updated_at).toLocaleString()}>{timeAgo(row.updated_at)}</span>,
  },
];

export default function NotificationTemplatesPage() {
  const [pagination, setPagination] = useState({ skip: 0, limit: 20 });
  const [search, setSearch]         = useState("");
  const [channel, setChannel]       = useState<ChannelType | "all">("all");
  const [systemId, setSystemId]     = useState("");
  const q                           = useDebounced(search.trim());

  const filters = {
    ...pagination,
    q:                  q || undefined,
    channel:            channel === "all" ? undefined : channel,
    external_system_id: systemId || undefined,
  };

  const query = useQuery({
    queryKey:        ["notification-templates", filters],
    queryFn:         () => listNotificationTemplates(filters),
    placeholderData: keepPreviousData,
  });

  const resetPage = () => setPagination((current) => ({ ...current, skip: 0 }));
  const active    = q !== "" || channel !== "all" || systemId !== "";

  return (
    <div>
      <PageHeader
        title="Templates"
        description="What each event looks like, per channel and external system."
        actions={<LinkButton href="/notifications/templates/new">New template</LinkButton>}
      />
      <ListToolbar
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          resetPage();
        }}
        placeholder="Search event or subject…"
        active={active}
        onClear={() => {
          setSearch("");
          setChannel("all");
          setSystemId("");
          resetPage();
        }}
      >
        <FilterSlot width="w-40">
          <SelectField
            label="Channel"
            hideLabel
            value={channel}
            onValueChange={(value) => {
              setChannel(value as ChannelType | "all");
              resetPage();
            }}
            options={[{ value: "all", label: "All channels" }, ...CHANNEL_TYPES.map((value) => ({ value, label: CHANNEL_LABEL[value] }))]}
          />
        </FilterSlot>
        <FilterSlot width="w-56">
          <SystemPicker
            label="External system"
            hideLabel
            allLabel="All systems"
            value={systemId}
            onChange={(id) => {
              setSystemId(id);
              resetPage();
            }}
          />
        </FilterSlot>
      </ListToolbar>
      <div className={cn("transition-opacity", query.isPlaceholderData && "opacity-60")}>
        <DataTable
          columns={columns}
          data={query.data?.data}
          rowKey={(row) => row.id}
          rowHref={(row) => `/notifications/templates/${row.id}`}
          isLoading={query.isLoading}
          error={query.error}
          emptyMessage={active ? "No templates match." : "No templates yet. A template decides what an event looks like on a channel."}
          emptyAction={!active && <LinkButton href="/notifications/templates/new">Create a template</LinkButton>}
          onPageChange={(skip, limit) => setPagination({ skip, limit })}
        />
      </div>
    </div>
  );
}
