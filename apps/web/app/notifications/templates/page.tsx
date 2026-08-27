"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import type { NotificationTemplateRecord } from "@repo/schema";
import { LinkButton } from "../../../components/button";
import { DataTable, type DataTableColumn } from "../../../components/data-table";
import { PageHeader } from "../../../components/page-header";
import { ChannelBadge } from "../../../components/status-badge";
import { listNotificationTemplates } from "../../../lib/api/notifications";

const columns: ReadonlyArray<DataTableColumn<NotificationTemplateRecord>> = [
  {
    header: "Event type",
    cell: (row) => (
      <Link href={`/notifications/templates/${row.id}`} className="font-medium hover:underline">
        {row.event_type}
      </Link>
    ),
  },
  { header: "Channel", cell: (row) => <ChannelBadge channel={row.channel} /> },
  { header: "External system", cell: (row) => <span className="font-mono text-xs">{row.external_system_id}</span> },
  { header: "Subject", cell: (row) => row.subject ?? "—" },
];

export default function NotificationTemplatesPage() {
  const [pagination, setPagination] = useState({ skip: 0, limit: 20 });

  const query = useQuery({
    queryKey: ["notification-templates", pagination],
    queryFn: () => listNotificationTemplates(pagination),
  });

  return (
    <div>
      <PageHeader
        title="Notification templates"
        actions={<LinkButton href="/notifications/templates/new">New template</LinkButton>}
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
