"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import type { UserRecord } from "@repo/schema";
import { DataTable, type DataTableColumn } from "../../components/data-table";
import { LinkButton } from "../../components/button";
import { PageHeader } from "../../components/page-header";
import { listUsers } from "../../lib/api/users";

const columns: ReadonlyArray<DataTableColumn<UserRecord>> = [
  {
    header: "ID",
    cell: (row) => (
      <Link href={`/users/${row.id}`} className="font-mono text-xs text-foreground hover:underline">
        {row.id}
      </Link>
    ),
  },
  {
    header: "Created",
    cell: (row) => new Date(row.created_at).toLocaleString(),
  },
];

export default function UsersPage() {
  const [pagination, setPagination] = useState({ skip: 0, limit: 20 });

  const query = useQuery({
    queryKey: ["users", pagination],
    queryFn: () => listUsers(pagination),
  });

  return (
    <div>
      <PageHeader
        title="Users"
        actions={<LinkButton href="/users/new">New user</LinkButton>}
      />
      <DataTable
        columns={columns}
        data={query.data?.data}
        rowKey={(row) => row.id}
        isLoading={query.isLoading}
        error={query.error}
        onPageChange={(skip, limit) => setPagination({ skip, limit })}
      />
    </div>
  );
}
