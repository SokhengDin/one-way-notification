"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import type { NotificationRecord } from "@repo/schema";
import { LinkButton } from "../../components/button";
import { DataTable, type DataTableColumn } from "../../components/data-table";
import { PageHeader } from "../../components/page-header";
import { listNotifications } from "../../lib/api/notifications";

const columns: ReadonlyArray<DataTableColumn<NotificationRecord>> = [
  {
    header: "Event type",
    cell: (row) => (
      <Link href={`/notifications/${row.id}`} className="hover:underline">
        {row.event_type}
      </Link>
    ),
  },
  {
    header: "User",
    cell: (row) => (
      <Link href={`/users/${row.user_id}`} className="font-mono text-xs hover:underline">
        {row.user_id}
      </Link>
    ),
  },
  { header: "External system", cell: (row) => <span className="font-mono text-xs">{row.external_system_id}</span> },
  { header: "Created", cell: (row) => new Date(row.created_at).toLocaleString() },
];

export default function NotificationsPage() {
  const [pagination, setPagination] = useState({ skip: 0, limit: 20 });

  const query = useQuery({
    queryKey: ["notifications", pagination],
    queryFn: () => listNotifications(pagination),
  });

  return (
    <div>
      <PageHeader
        title="Sent notifications"
        actions={<LinkButton href="/notifications/new">New notification</LinkButton>}
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
