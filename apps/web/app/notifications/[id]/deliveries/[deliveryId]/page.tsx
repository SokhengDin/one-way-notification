"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { DELIVERY_STATUSES, type DeliveryStatus, type ProviderUsageLogRecord } from "@repo/schema";
import { Button } from "../../../../../components/button";
import { Card } from "../../../../../components/card";
import { SelectField, TextField } from "../../../../../components/form-field";
import { DataTable, type DataTableColumn } from "../../../../../components/data-table";
import { PageHeader } from "../../../../../components/page-header";
import { ChannelBadge, StatusBadge } from "../../../../../components/status-badge";
import { listNotificationDeliveries, updateNotificationDeliveryStatus } from "../../../../../lib/api/notifications";
import { addProviderUsageLog, listProviderUsageLogByDelivery } from "../../../../../lib/api/providers";

const usageLogColumns: ReadonlyArray<DataTableColumn<ProviderUsageLogRecord>> = [
  {
    header: "Provider",
    cell: (row) => (
      <Link href={`/providers/${row.provider_id}`} className="font-mono text-xs hover:underline">
        {row.provider_id}
      </Link>
    ),
  },
  { header: "Status code", cell: (row) => row.status_code ?? "—" },
  { header: "Cost", cell: (row) => row.cost ?? "—" },
  { header: "Provider ref", cell: (row) => row.provider_ref_id ?? "—" },
  { header: "Attempted at", cell: (row) => new Date(row.attempted_at).toLocaleString() },
];

export default function DeliveryDetailPage() {
  const params = useParams<{ id: string; deliveryId: string }>();
  const queryClient = useQueryClient();
  const { id: notificationId, deliveryId } = params;

  const deliveriesQuery = useQuery({
    queryKey: ["notification-deliveries", notificationId],
    queryFn: () => listNotificationDeliveries(notificationId, { skip: 0, limit: 100 }),
  });

  const delivery = deliveriesQuery.data?.data.items.find((item) => item.id === deliveryId);

  const usageLogQuery = useQuery({
    queryKey: ["provider-usage-log", deliveryId],
    queryFn: () => listProviderUsageLogByDelivery(deliveryId, { skip: 0, limit: 100 }),
  });

  const [status, setStatus] = useState<DeliveryStatus>("pending");
  const [lastError, setLastError] = useState("");

  const statusMutation = useMutation({
    mutationFn: () =>
      updateNotificationDeliveryStatus(deliveryId, {
        status,
        last_error: lastError || null,
        sent_at: status === "sent" ? new Date().toISOString() : undefined,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notification-deliveries", notificationId] }),
  });

  const [providerId, setProviderId] = useState("");
  const [providerRefId, setProviderRefId] = useState("");
  const [statusCode, setStatusCode] = useState("");
  const [cost, setCost] = useState("");

  const usageLogMutation = useMutation({
    mutationFn: () =>
      addProviderUsageLog({
        delivery_id: deliveryId,
        provider_id: providerId,
        provider_ref_id: providerRefId || null,
        status_code: statusCode ? Number(statusCode) : null,
        cost: cost || null,
      }),
    onSuccess: () => {
      setProviderRefId("");
      setStatusCode("");
      setCost("");
      queryClient.invalidateQueries({ queryKey: ["provider-usage-log", deliveryId] });
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Delivery"
        description={delivery ? `${delivery.attempt_count} attempt(s)` : undefined}
        actions={
          delivery && (
            <div className="flex items-center gap-2">
              <ChannelBadge channel={delivery.channel} />
              <StatusBadge status={delivery.status} />
            </div>
          )
        }
      />

      <Card title="Update status">
        <form
          className="flex items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            statusMutation.mutate();
          }}
        >
          {statusMutation.isError && (
            <p className="text-sm text-destructive">
              {statusMutation.error instanceof Error ? statusMutation.error.message : "Failed to update status."}
            </p>
          )}
          <div className="w-40">
            <SelectField
              label="Status"
              value={status}
              onValueChange={(value) => setStatus(value as DeliveryStatus)}
              options={DELIVERY_STATUSES.map((value) => ({ value, label: value }))}
            />
          </div>
          <div className="flex-1">
            <TextField label="Last error" value={lastError} onChange={(event) => setLastError(event.target.value)} />
          </div>
          <Button type="submit" disabled={statusMutation.isPending}>
            {statusMutation.isPending ? "Updating…" : "Update"}
          </Button>
        </form>
      </Card>

      <Card title="Provider usage log">
        <DataTable
          columns={usageLogColumns}
          data={usageLogQuery.data?.data}
          rowKey={(row) => row.id}
          isLoading={usageLogQuery.isLoading}
          error={usageLogQuery.error}
          emptyMessage="No usage log entries yet."
        />
        <form
          className="mt-4 flex flex-wrap items-end gap-3 border-t pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            usageLogMutation.mutate();
          }}
        >
          {usageLogMutation.isError && (
            <p className="w-full text-sm text-destructive">
              {usageLogMutation.error instanceof Error ? usageLogMutation.error.message : "Failed to add log entry."}
            </p>
          )}
          <div className="w-56">
            <TextField label="Provider id" value={providerId} onChange={(event) => setProviderId(event.target.value)} required />
          </div>
          <div className="w-40">
            <TextField
              label="Provider ref id"
              value={providerRefId}
              onChange={(event) => setProviderRefId(event.target.value)}
            />
          </div>
          <div className="w-28">
            <TextField
              label="Status code"
              type="number"
              value={statusCode}
              onChange={(event) => setStatusCode(event.target.value)}
            />
          </div>
          <div className="w-28">
            <TextField label="Cost" value={cost} onChange={(event) => setCost(event.target.value)} />
          </div>
          <Button type="submit" variant="secondary" disabled={usageLogMutation.isPending}>
            {usageLogMutation.isPending ? "Adding…" : "Add log entry"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
