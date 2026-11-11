"use client";

import type { DeliveryListItem } from "@repo/schema";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card } from "../../../components/card";
import { DataTable, type DataTableColumn } from "../../../components/data-table";
import { AttemptsCell, DeliveryActions, ErrorText } from "../../../components/deliveries";
import { ProviderLink, SystemLink, UserLink } from "../../../components/entity-links";
import { IdChip } from "../../../components/id-chip";
import { OutcomeSummary } from "../../../components/notification-outcome";
import { PageHeader } from "../../../components/page-header";
import { ChannelBadge, StatusBadge } from "../../../components/status-badge";
import { listDeliveries } from "../../../lib/api/deliveries";
import { getNotificationById, listNotificationTemplates } from "../../../lib/api/notifications";
import { errorMessage } from "../../../lib/errors";
import { formatDateTime } from "../../../lib/format";

const deliveryColumns: ReadonlyArray<DataTableColumn<DeliveryListItem>> = [
  {
    header: "Channel",
    cell: (row) => (
      <Link href={`/deliveries/${row.id}`} className="inline-flex">
        <ChannelBadge channel={row.channel} />
      </Link>
    ),
  },
  { header: "To", cell: (row) => <span className="font-mono text-xs">{row.recipient ?? "—"}</span> },
  {
    header: "Status",
    cell: (row) => (
      <Link href={`/deliveries/${row.id}`}>
        <StatusBadge status={row.status} inFlight={row.in_flight} />
      </Link>
    ),
  },
  { header: "Attempts", cell: (row) => <AttemptsCell delivery={row} /> },
  { header: "Provider", cell: (row) => <ProviderLink id={row.provider_id} name={row.provider_name} /> },
  { header: "Last error", className: "max-w-sm", cell: (row) => <ErrorText text={row.last_error} /> },
  {
    header: "Sent",
    className: "whitespace-nowrap text-muted-foreground",
    cell: (row) => (row.sent_at ? formatDateTime(row.sent_at) : "—"),
  },
  { header: "", className: "text-right", cell: (row) => <DeliveryActions delivery={row} compact /> },
];

export default function NotificationDetailPage() {
  const { id } = useParams<{ id: string }>();

  const notificationQuery = useQuery({
    queryKey: ["notification", id],
    queryFn:  () => getNotificationById(id),
  });

  const deliveriesQuery = useQuery({
    queryKey:        ["deliveries", { notification_id: id }],
    queryFn:         () => listDeliveries({ notification_id: id, limit: 10 }),
    refetchInterval: (query) =>
      query.state.data?.data.items.some((item) => item.status === "pending" || item.status === "retrying") ? 3_000 : false,
  });

  const notification = notificationQuery.data?.data;

  const templatesQuery = useQuery({
    queryKey: ["notification-templates", { external_system_id: notification?.external_system_id }],
    queryFn:  () => listNotificationTemplates({ skip: 0, limit: 100, external_system_id: notification!.external_system_id }),
    enabled:  !!notification,
  });
  const matchingTemplates = (templatesQuery.data?.data.items ?? []).filter(
    (template) => notification && template.event_type === notification.event_type,
  );

  if (notificationQuery.isError) {
    return <p className="text-sm text-destructive">{errorMessage(notificationQuery.error, "Could not load this notification.")}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/notifications", label: "Notifications" }}
        actions={notification && <IdChip id={notification.id} />}
        title={notification ? notification.event_type : "Notification"}
        description={notification ? `Sent to ${notification.user_display_name} by ${notification.system_name} · ${formatDateTime(notification.created_at)}` : undefined}
      />

      {notification && (
        <Card title="Details">
          <dl className="grid grid-cols-[10rem_1fr] items-center gap-x-6 gap-y-3 text-sm">
            <dt className="text-muted-foreground">User</dt>
            <dd><UserLink id={notification.user_id} systemId={notification.external_system_id} name={notification.user_display_name} /></dd>

            <dt className="text-muted-foreground">External system</dt>
            <dd><SystemLink id={notification.external_system_id} name={notification.system_name} /></dd>

            <dt className="text-muted-foreground">Outcome</dt>
            <dd><OutcomeSummary row={notification} /></dd>

            <dt className="text-muted-foreground">Templates</dt>
            <dd className="flex flex-wrap gap-1.5">
              {matchingTemplates.length === 0 && <span className="text-muted-foreground">None found</span>}
              {matchingTemplates.map((template) => (
                <Link key={template.id} href={`/notifications/templates/${template.id}`} title="Open template">
                  <ChannelBadge channel={template.channel} />
                </Link>
              ))}
            </dd>

            <dt className="text-muted-foreground">Idempotency key</dt>
            <dd className="font-mono text-xs">{notification.idempotency_key ?? <span className="font-sans text-muted-foreground">—</span>}</dd>
          </dl>
          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-muted-foreground">Payload</summary>
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
          rowHref={(row) => `/deliveries/${row.id}`}
          isLoading={deliveriesQuery.isLoading}
          error={deliveriesQuery.error}
          emptyMessage="No deliveries were planned for this notification."
        />
      </Card>
    </div>
  );
}
