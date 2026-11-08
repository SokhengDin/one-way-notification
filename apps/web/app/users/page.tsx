"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState } from "react";
import type { UserRecord } from "@repo/schema";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DataTable, type DataTableColumn } from "../../components/data-table";
import { LinkButton } from "../../components/button";
import { UserLink } from "../../components/entity-links";
import { PageHeader } from "../../components/page-header";
import { listUsers } from "../../lib/api/users";
import { timeAgo } from "../../lib/format";
import { useDebounced } from "../../lib/use-debounced";

const columns: ReadonlyArray<DataTableColumn<UserRecord>> = [
  {
    header: "User",
    cell: (row) => <UserLink id={row.id} name={row.display_name} detail={row.email} />,
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
      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPagination((current) => ({ ...current, skip: 0 }));
          }}
          placeholder="Search by name, email or external id…"
          className="pl-8"
          aria-label="Search users"
        />
      </div>
      <div className={cn("transition-opacity", query.isPlaceholderData && "opacity-60")}>
        <DataTable
          columns={columns}
          data={query.data?.data}
          rowKey={(row) => row.id}
          isLoading={query.isLoading}
          error={query.error}
          emptyMessage={q ? "No users match." : "No users yet."}
          onPageChange={(skip, limit) => setPagination({ skip, limit })}
        />
      </div>
    </div>
  );
}
