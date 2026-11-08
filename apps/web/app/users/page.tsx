"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { UserRecord } from "@repo/schema";
import { cn } from "@/lib/utils";
import { DataTable, type DataTableColumn } from "../../components/data-table";
import { LinkButton } from "../../components/button";
import { UserLink } from "../../components/entity-links";
import { ListToolbar } from "../../components/list-toolbar";
import { PageHeader } from "../../components/page-header";
import { ChannelBadge } from "../../components/status-badge";
import { listUsers } from "../../lib/api/users";
import { timeAgo } from "../../lib/format";
import { useDebounced } from "../../lib/use-debounced";

const columns: ReadonlyArray<DataTableColumn<UserRecord>> = [
  {
    header: "User",
    cell: (row) => <UserLink id={row.id} name={row.display_name} detail={row.email} />,
  },
  {
    header: "Reachable on",
    cell: (row) =>
      row.channels.length === 0
        ? <span className="text-xs text-muted-foreground">no contacts</span>
        : <div className="flex flex-wrap gap-1">{row.channels.map((channel) => <ChannelBadge key={channel} channel={channel} />)}</div>,
  },
  {
    header: "Created",
    className: "whitespace-nowrap text-muted-foreground",
    cell: (row) => <span title={new Date(row.created_at).toLocaleString()}>{timeAgo(row.created_at)}</span>,
  },
];

export default function UsersPage() {
  const [pagination, setPagination] = useState({ skip: 0, limit: 20 });
  const [search, setSearch]         = useState("");
  const q                           = useDebounced(search.trim());

  const query = useQuery({
    queryKey:        ["users", { ...pagination, q }],
    queryFn:         () => listUsers({ ...pagination, q: q || undefined }),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <PageHeader
        title="Users"
        description="The people notifications go to."
        actions={<LinkButton href="/users/new">New user</LinkButton>}
      />
      <ListToolbar
        count={query.data?.data.total}
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPagination((current) => ({ ...current, skip: 0 }));
        }}
        placeholder="Search by name, email or external id…"
        searchLabel="Search users"
        active={q !== ""}
        onClear={() => setSearch("")}
      />
      <div className={cn("transition-opacity", query.isPlaceholderData && "opacity-60")}>
        <DataTable
          columns={columns}
          data={query.data?.data}
          rowKey={(row) => row.id}
          rowHref={(row) => `/users/${row.id}`}
          emptyAction={!q && <LinkButton href="/users/new">Add a user</LinkButton>}
          isLoading={query.isLoading}
          error={query.error}
          emptyMessage={q ? "No users match." : "No users yet."}
          onPageChange={(skip, limit) => setPagination({ skip, limit })}
        />
      </div>
    </div>
  );
}
