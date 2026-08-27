"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { NotificationDeliveryRecord } from "@repo/schema";
import { Card } from "../../../components/card";
import { DataTable, type DataTableColumn } from "../../../components/data-table";
import { PageHeader } from "../../../components/page-header";
import { ChannelBadge, StatusBadge } from "../../../components/status-badge";
import { listNotificationTemplates } from "../../../lib/api/notifications";
import { getNotificationById, listNotificationDeliveries } from "../../../lib/api/notifications";

const deliveryColumns: ReadonlyArray<DataTableColumn<NotificationDeliveryRecord>> = [
  {
    header: "Channel",
    cell: (row) => (
      <Link href={`/notifications/${row.notification_id}/deliveries/${row.id}`} className="hover:underline">
        <ChannelBadge channel={row.channel} />
      </Link>
    ),
  },
  { header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
  { header: "Attempts", cell: (row) => row.attempt_count },
  { header: "Last error", cell: (row) => row.last_error ?? "—" },
  { header: "Sent at", cell: (row) => (row.sent_at ? new Date(row.sent_at).toLocaleString() : "—") },
];

export default function NotificationDetailPage() {
  const params = useParams<{ id: string }>();
  const notificationId = params.id;

  const notificationQuery = useQuery({
    queryKey: ["notification", notificationId],
    queryFn: () => getNotificationById(notificationId),
  });

  const deliveriesQuery = useQuery({
    queryKey: ["notification-deliveries", notificationId],
    queryFn: () => listNotificationDeliveries(notificationId, { skip: 0, limit: 100 }),
  });

  const templatesQuery = useQuery({
    queryKey: ["notification-templates", { skip: 0, limit: 100 }],
    queryFn: () => listNotificationTemplates({ skip: 0, limit: 100 }),
    enabled: !!notificationQuery.data,
  });

  const notification = notificationQuery.data?.data;
  const matchingTemplates = (templatesQuery.data?.data.items ?? []).filter(
    (template) =>
      notification &&
      template.external_system_id === notification.external_system_id &&
      template.event_type === notification.event_type,
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={notification ? notification.event_type : "Notification"}
        description={notification ? `Created ${new Date(notification.created_at).toLocaleString()}` : undefined}
      />

      {notification && (
        <Card title="Details">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <dt className="text-muted-foreground">External system</dt>
            <dd className="font-mono text-xs">
              <Link href={`/external-systems/${notification.external_system_id}`} className="hover:underline">
                {notification.external_system_id}
              </Link>
            </dd>
            <dt className="text-muted-foreground">User</dt>
            <dd className="font-mono text-xs">
              <Link href={`/users/${notification.user_id}`} className="hover:underline">
                {notification.user_id}
              </Link>
            </dd>
            <dt className="text-muted-foreground">Idempotency key</dt>
            <dd>{notification.idempotency_key ?? "—"}</dd>
            <dt className="text-muted-foreground">Matching templates</dt>
            <dd className="flex flex-wrap gap-1.5">
              {matchingTemplates.length === 0 && (
                <span className="text-muted-foreground">None found</span>
              )}
              {matchingTemplates.map((template) => (
                <Link key={template.id} href={`/notifications/templates/${template.id}`}>
                  <ChannelBadge channel={template.channel} />
                </Link>
              ))}
            </dd>
          </dl>
          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-muted-foreground">Raw payload</summary>
            <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(notification.payload, null, 2)}
            </pre>
          </details>
        </Card>
      )}

      <Card title="Deliveries">
        <DataTable
          columns={deliveryColumns}
          data={deliveriesQuery.data?.data}
          rowKey={(row) => row.id}
          isLoading={deliveriesQuery.isLoading}
          error={deliveriesQuery.error}
          emptyMessage="No deliveries recorded yet."
        />
      </Card>
    </div>
  );
}
