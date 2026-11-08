"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { ExternalSystemRecord } from "@repo/schema";
import { cn } from "@/lib/utils";
import { LinkButton } from "../../components/button";
import { DataTable, type DataTableColumn } from "../../components/data-table";
import { ListToolbar } from "../../components/list-toolbar";
import { PageHeader } from "../../components/page-header";
import { listExternalSystems } from "../../lib/api/external-systems";
import { timeAgo } from "../../lib/format";
import { useDebounced } from "../../lib/use-debounced";

const count = (value: number, noun: string) => (
  <span className={cn("tabular-nums", value === 0 && "text-muted-foreground")}>
    {value.toLocaleString()} <span className="text-muted-foreground">{noun}{value === 1 ? "" : "s"}</span>
  </span>
);

const columns: ReadonlyArray<DataTableColumn<ExternalSystemRecord>> = [
  {
    header: "Name",
    cell: (row) => (
      <Link href={`/external-systems/${row.id}`} className="flex items-center gap-2 font-medium hover:underline">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
          <Building2 className="size-4 text-muted-foreground" />
        </span>
        {row.name}
      </Link>
    ),
  },
  { header: "Templates", cell: (row) => count(row.template_count, "template") },
  { header: "Linked users", cell: (row) => count(row.user_count, "user") },
  { header: "Last 30 days", cell: (row) => count(row.notifications_30d, "notification") },
  {
    header: "Last activity",
    className: "whitespace-nowrap text-muted-foreground",
    cell: (row) =>
      row.last_notification_at
        ? <span title={new Date(row.last_notification_at).toLocaleString()}>{timeAgo(row.last_notification_at)}</span>
        : "never",
  },
];

export default function ExternalSystemsPage() {
  const [pagination, setPagination] = useState({ skip: 0, limit: 20 });
  const [search, setSearch]         = useState("");
  const name                        = useDebounced(search.trim());

  const query = useQuery({
    queryKey:        ["external-systems", { ...pagination, name }],
    queryFn:         () => listExternalSystems({ ...pagination, name: name || undefined }),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <PageHeader
        title="External systems"
        description="The applications that send notifications through this service, each with its own API key, templates and branding."
        actions={<LinkButton href="/external-systems/new">New system</LinkButton>}
      />
      <ListToolbar
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPagination((current) => ({ ...current, skip: 0 }));
        }}
        placeholder="Search systems…"
        active={name !== ""}
        onClear={() => setSearch("")}
      />
      <div className={cn("transition-opacity", query.isPlaceholderData && "opacity-60")}>
        <DataTable
          columns={columns}
          data={query.data?.data}
          rowKey={(row) => row.id}
          rowHref={(row) => `/external-systems/${row.id}`}
          isLoading={query.isLoading}
          error={query.error}
          emptyMessage={name ? "No systems match." : "No external systems yet."}
          emptyAction={!name && <LinkButton href="/external-systems/new">Add a system</LinkButton>}
          onPageChange={(skip, limit) => setPagination({ skip, limit })}
        />
      </div>
    </div>
  );
}
