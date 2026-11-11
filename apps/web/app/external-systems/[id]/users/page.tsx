"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import type { SystemUserRecord } from "@repo/schema";
import { LinkButton } from "@/components/button";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { UserLink } from "@/components/entity-links";
import { ListToolbar } from "@/components/list-toolbar";
import { ChannelBadge } from "@/components/status-badge";
import { SystemHeader } from "@/components/system-header";
import { listSystemUsers } from "@/lib/api/external-systems";
import { timeAgo } from "@/lib/format";
import { useDebounced } from "@/lib/use-debounced";
import { cn } from "@/lib/utils";

export default function SystemUsersPage() {
  const systemId = useParams<{ id: string }>().id;
  const base     = `/external-systems/${systemId}/users`;

  const [pagination, setPagination] = useState({ skip: 0, limit: 20 });
  const [search, setSearch]         = useState("");
  const q                           = useDebounced(search.trim());

  const query = useQuery({
    queryKey:        ["system-users", systemId, { ...pagination, q }],
    queryFn:         () => listSystemUsers(systemId, { ...pagination, q: q || undefined }),
    placeholderData: keepPreviousData,
  });

  const columns: ReadonlyArray<DataTableColumn<SystemUserRecord>> = [
    {
      header: "User",
      cell:   (row) => <UserLink id={row.id} systemId={systemId} name={row.display_name} detail={row.email} />,
    },
    {
      header:    "Their id",
      className: "whitespace-nowrap",
      cell:      (row) => <span className="font-mono text-xs text-muted-foreground">{row.external_user_id}</span>,
    },
    {
      header: "Reachable on",
      cell:   (row) =>
        row.channels.length === 0
          ? <span className="text-xs text-muted-foreground">no contacts</span>
          : <div className="flex flex-wrap gap-1">{row.channels.map((channel) => <ChannelBadge key={channel} channel={channel} />)}</div>,
    },
    {
      header:    "Added",
      className: "whitespace-nowrap text-muted-foreground",
      cell:      (row) => (
        <span title={new Date(row.created_at).toLocaleString()}>
          {timeAgo(row.created_at)}
          {row.other_systems > 0 && (
            <span className="ml-2 rounded-full bg-muted px-1.5 text-[11px]" title="Also a user of other external systems">
              +{row.other_systems} {row.other_systems === 1 ? "system" : "systems"}
            </span>
          )}
        </span>
      ),
    },
  ];

  return (
    <div>
      <SystemHeader
        systemId={systemId}
        description="The people this system sends notifications to. A system can only notify its own users."
        actions={<LinkButton href={`${base}/new`}><UserPlus /> Add user</LinkButton>}
      />
      <ListToolbar
        count={query.data?.data.total}
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPagination((current) => ({ ...current, skip: 0 }));
        }}
        placeholder="Search by name, email or their id…"
        searchLabel="Search users"
        active={q !== ""}
        onClear={() => setSearch("")}
      />
      <div className={cn("transition-opacity", query.isPlaceholderData && "opacity-60")}>
        <DataTable
          columns={columns}
          data={query.data?.data}
          rowKey={(row) => row.link_id}
          rowHref={(row) => `${base}/${row.id}`}
          emptyAction={!q && <LinkButton href={`${base}/new`}><UserPlus /> Add the first user</LinkButton>}
          isLoading={query.isLoading}
          error={query.error}
          emptyMessage={q ? "No users match." : "This system has no users yet."}
          onPageChange={(skip, limit) => setPagination({ skip, limit })}
        />
      </div>
    </div>
  );
}
