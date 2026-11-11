"use client";

import { errorMessage } from "../../../lib/errors";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { ExternalUserLinkRecord } from "@repo/schema";
import { ApiKeysCard } from "../../../components/api-keys";
import { BrandAssets } from "../../../components/brand-assets";
import { Button } from "../../../components/button";
import { ConfirmButton } from "../../../components/confirm-button";
import { Card } from "../../../components/card";
import { TextField } from "../../../components/form-field";
import { DataTable, type DataTableColumn } from "../../../components/data-table";
import { PageHeader } from "../../../components/page-header";
import { IdChip } from "../../../components/id-chip";
import { UserLink } from "../../../components/entity-links";
import { UserPicker } from "../../../components/pickers";
import {
  addExternalUserLink,
  deleteExternalSystem,
  getExternalSystemById,
  listExternalUserLinksBySystem,
  updateExternalSystem,
} from "../../../lib/api/external-systems";

const linkColumns: ReadonlyArray<DataTableColumn<ExternalUserLinkRecord>> = [
  { header: "User", cell: (row) => <UserLink id={row.user_id} name={row.user_display_name} /> },
  { header: "Known here as", cell: (row) => <span className="font-mono text-xs">{row.external_user_id}</span> },
];

export default function ExternalSystemDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const systemId = params.id;

  const systemQuery = useQuery({
    queryKey: ["external-system", systemId],
    queryFn: () => getExternalSystemById(systemId),
  });

  const linksQuery = useQuery({
    queryKey: ["external-user-links-by-system", systemId],
    queryFn: () => listExternalUserLinksBySystem(systemId, { skip: 0, limit: 100 }),
  });

  const [name, setName] = useState("");
  // arriving from "New external system": open "Issue key" straight away
  const issueOnOpen = useSearchParams().get("issue") === "1";

  // reset the form whenever fresh data arrives (state adjusted during render,
  // not in an effect — see react.dev "you might not need an effect")
  const [syncedFrom, setSyncedFrom] = useState(systemQuery.data);
  if (systemQuery.data && systemQuery.data !== syncedFrom) {
    setSyncedFrom(systemQuery.data);
    setName(systemQuery.data.data.name);
  }

  const updateMutation = useMutation({
    meta: { success: "External system saved", inline: true },
    mutationFn: () => updateExternalSystem(systemId, { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["external-system", systemId] }),
  });

  const deleteMutation = useMutation({
    meta: { success: "External system deleted", error: "Could not delete the external system" },
    mutationFn: () => deleteExternalSystem(systemId),
    onSuccess: () => router.push("/external-systems"),
  });

  const [externalUserId, setExternalUserId] = useState("");
  const [userId, setUserId] = useState("");

  const linkMutation = useMutation({
    meta: { success: "User linked", inline: true },
    mutationFn: () => addExternalUserLink(systemId, { external_user_id: externalUserId, user_id: userId }),
    onSuccess: () => {
      setExternalUserId("");
      setUserId("");
      queryClient.invalidateQueries({ queryKey: ["external-user-links-by-system", systemId] });
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/external-systems", label: "External systems" }}
        title={systemQuery.data?.data.name ?? "External system"}
        actions={
          <>
          <IdChip id={systemId} />
          <ConfirmButton
            label="Delete system"
            title="Delete this external system?"
            description="It will no longer be able to send notifications. Its templates and assets stay in the database."
            isPending={deleteMutation.isPending}
            onConfirm={() => deleteMutation.mutate()}
          />
          </>
        }
      />

      <Card title="Details">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            updateMutation.mutate();
          }}
        >
          {updateMutation.isError && (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage(updateMutation.error, "Failed to update system.")}
            </p>
          )}
          <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} />
          <div>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </Card>

      <ApiKeysCard systemId={systemId} issueOnOpen={issueOnOpen} />

      <BrandAssets systemId={systemId} />

      <Card title="Linked users">
        <DataTable
          columns={linkColumns}
          data={linksQuery.data?.data}
          rowKey={(row) => row.id}
          rowHref={(row) => `/users/${row.user_id}`}
          isLoading={linksQuery.isLoading}
          error={linksQuery.error}
          emptyMessage="No users linked to this system yet."
        />
        <form
          className="mt-4 flex flex-col gap-3 border-t pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!userId || !externalUserId.trim()) return;
            linkMutation.mutate();
          }}
        >
          {linkMutation.isError && (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage(linkMutation.error, "Failed to add link.")}
            </p>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <UserPicker value={userId} onChange={(id) => setUserId(id)} />
            </div>
            <div className="min-w-0 flex-1">
              <TextField
                label="Their id in this system"
                value={externalUserId}
                onChange={(event) => setExternalUserId(event.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              variant="secondary"
              disabled={linkMutation.isPending || !userId || !externalUserId.trim()}
              title={!userId ? "Pick a user first" : undefined}
            >
              {linkMutation.isPending ? "Linking…" : "Add link"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
