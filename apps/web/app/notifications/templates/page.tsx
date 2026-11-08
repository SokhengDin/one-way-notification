"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import type { NotificationTemplateRecord } from "@repo/schema";
import { LinkButton } from "../../../components/button";
import { DataTable, type DataTableColumn } from "../../../components/data-table";
import { PageHeader } from "../../../components/page-header";
import { ChannelBadge } from "../../../components/status-badge";
import { SystemLink } from "../../../components/entity-links";
import { listNotificationTemplates } from "../../../lib/api/notifications";
import { timeAgo } from "../../../lib/format";
import { useSystemNames } from "../../../lib/lookups";

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
  { header: "Subject", cell: (row) => row.subject ?? <span className="text-muted-foreground">—</span> },
  {
    header: "Updated",
    className: "whitespace-nowrap text-muted-foreground",
    cell: (row) => <span title={new Date(row.updated_at).toLocaleString()}>{timeAgo(row.updated_at)}</span>,
  },
];

export default function NotificationTemplatesPage() {
  const [pagination, setPagination] = useState({ skip: 0, limit: 20 });
  const systemNames = useSystemNames();
  const columnsWithSystem: ReadonlyArray<DataTableColumn<NotificationTemplateRecord>> = [
    columns[0]!,
    columns[1]!,
    {
      header: "External system",
      cell: (row) => <SystemLink id={row.external_system_id} name={systemNames.get(row.external_system_id) ?? "…"} />,
    },
    ...columns.slice(2),
  ];

  const query = useQuery({
    queryKey: ["notification-templates", pagination],
    queryFn: () => listNotificationTemplates(pagination),
  });

  return (
    <div>
      <PageHeader
        title="Notification templates"
        description="What each event looks like, per channel and external system."
        actions={<LinkButton href="/notifications/templates/new">New template</LinkButton>}
      />
      <DataTable
        columns={columnsWithSystem}
        data={query.data?.data}
        rowKey={(row) => row.id}
        isLoading={query.isLoading}
        error={query.error}
        onPageChange={(skip, limit) => setPagination({ skip, limit })}
      />
    </div>
  );
}
