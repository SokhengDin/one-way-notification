"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import type { ExternalUserLinkRecord } from "@repo/schema";
import { BrandAssets } from "../../../components/brand-assets";
import { Button } from "../../../components/button";
import { ConfirmButton } from "../../../components/confirm-button";
import { Card } from "../../../components/card";
import { TextField } from "../../../components/form-field";
import { DataTable, type DataTableColumn } from "../../../components/data-table";
import { PageHeader } from "../../../components/page-header";
import {
  addExternalUserLink,
  deleteExternalSystem,
  getExternalSystemById,
  listExternalUserLinksBySystem,
  updateExternalSystem,
} from "../../../lib/api/external-systems";

const linkColumns: ReadonlyArray<DataTableColumn<ExternalUserLinkRecord>> = [
  {
    header: "User",
    cell: (row) => (
      <Link href={`/users/${row.user_id}`} className="font-mono text-xs hover:underline">
        {row.user_id}
      </Link>
    ),
  },
  { header: "External user id", cell: (row) => row.external_user_id },
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
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  // reset the form whenever fresh data arrives (state adjusted during render,
  // not in an effect — see react.dev "you might not need an effect")
  const [syncedFrom, setSyncedFrom] = useState(systemQuery.data);
  if (systemQuery.data && systemQuery.data !== syncedFrom) {
    setSyncedFrom(systemQuery.data);
    setName(systemQuery.data.data.name);
    setApiKey(systemQuery.data.data.api_key);
  }

  const updateMutation = useMutation({
    mutationFn: () => updateExternalSystem(systemId, { name, api_key: apiKey }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["external-system", systemId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteExternalSystem(systemId),
    onSuccess: () => router.push("/external-systems"),
  });

  const [externalUserId, setExternalUserId] = useState("");
  const [userId, setUserId] = useState("");

  const linkMutation = useMutation({
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
        title={systemQuery.data?.data.name ?? "External system"}
        actions={
          <ConfirmButton
            label="Delete system"
            title="Delete this external system?"
            description="It will no longer be able to send notifications. Its templates and assets stay in the database."
            isPending={deleteMutation.isPending}
            onConfirm={() => deleteMutation.mutate()}
          />
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
            <p className="text-sm text-destructive">
              {updateMutation.error instanceof Error ? updateMutation.error.message : "Failed to update system."}
            </p>
          )}
          <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} />
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <TextField
                label="API key"
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </div>
            <Button type="button" variant="secondary" onClick={() => setShowApiKey((value) => !value)}>
              {showApiKey ? "Hide" : "Reveal"}
            </Button>
          </div>
          <div>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </Card>

      <BrandAssets systemId={systemId} />

      <Card title="Linked users">
        <DataTable
          columns={linkColumns}
          data={linksQuery.data?.data}
          rowKey={(row) => row.id}
          isLoading={linksQuery.isLoading}
          error={linksQuery.error}
          emptyMessage="No users linked to this system yet."
        />
        <form
          className="mt-4 flex items-end gap-3 border-t pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            linkMutation.mutate();
          }}
        >
          {linkMutation.isError && (
            <p className="text-sm text-destructive">
              {linkMutation.error instanceof Error ? linkMutation.error.message : "Failed to add link."}
            </p>
          )}
          <div className="flex-1">
            <TextField
              label="External user id"
              value={externalUserId}
              onChange={(event) => setExternalUserId(event.target.value)}
              required
            />
          </div>
          <div className="flex-1">
            <TextField
              label="User id"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              required
            />
          </div>
          <Button type="submit" variant="secondary" disabled={linkMutation.isPending}>
            {linkMutation.isPending ? "Linking…" : "Add link"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
