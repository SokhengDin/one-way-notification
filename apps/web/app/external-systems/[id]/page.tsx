"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ApiKeysCard } from "@/components/api-keys";
import { BrandAssets } from "@/components/brand-assets";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { ConfirmButton } from "@/components/confirm-button";
import { TextField } from "@/components/form-field";
import { IdChip } from "@/components/id-chip";
import { SystemHeader, useSystem } from "@/components/system-header";
import { deleteExternalSystem, updateExternalSystem } from "@/lib/api/external-systems";
import { errorMessage } from "@/lib/errors";

/** An external system's Settings tab: its name, API keys and branding. Its users are on the Users tab. */
export default function ExternalSystemSettingsPage() {
  const systemId    = useParams<{ id: string }>().id;
  const router      = useRouter();
  const queryClient = useQueryClient();
  const systemQuery = useSystem(systemId);

  // arriving from "New external system": open "Issue key" straight away
  const issueOnOpen = useSearchParams().get("issue") === "1";

  const [name, setName] = useState("");
  // reset the form whenever fresh data arrives (state adjusted during render,
  // not in an effect — see react.dev "you might not need an effect")
  const [syncedFrom, setSyncedFrom] = useState(systemQuery.data);
  if (systemQuery.data && systemQuery.data !== syncedFrom) {
    setSyncedFrom(systemQuery.data);
    setName(systemQuery.data.data.name);
  }

  const updateMutation = useMutation({
    meta:       { success: "External system saved", inline: true },
    mutationFn: () => updateExternalSystem(systemId, { name: name.trim() }),
    onSuccess:  () => {
      void queryClient.invalidateQueries({ queryKey: ["external-system", systemId] });
      void queryClient.invalidateQueries({ queryKey: ["external-systems"] });
    },
  });

  const deleteMutation = useMutation({
    meta:       { success: "External system deleted", error: "Could not delete the external system" },
    mutationFn: () => deleteExternalSystem(systemId),
    onSuccess:  () => router.push("/external-systems"),
  });

  const unchanged = name.trim() === "" || name.trim() === systemQuery.data?.data.name;

  return (
    <div>
      <SystemHeader
        systemId={systemId}
        actions={
          <>
            <IdChip id={systemId} />
            <ConfirmButton
              label="Delete system"
              title="Delete this external system?"
              description="Its API keys stop working at once and it can no longer send. Its templates, users and history stay in the database."
              isPending={deleteMutation.isPending}
              onConfirm={() => deleteMutation.mutate()}
            />
          </>
        }
      />

      <div className="flex flex-col gap-6">
        <Card title="Details">
          <form
            className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              if (!unchanged) updateMutation.mutate();
            }}
          >
            {updateMutation.isError && (
              <p className="text-sm text-destructive sm:order-last sm:basis-full" role="alert">
                {errorMessage(updateMutation.error, "Failed to update system.")}
              </p>
            )}
            <div className="min-w-0 flex-1 sm:max-w-md">
              <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} required />
            </div>
            <Button type="submit" disabled={updateMutation.isPending || unchanged}>
              {updateMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </form>
        </Card>

        <ApiKeysCard systemId={systemId} issueOnOpen={issueOnOpen} />

        <BrandAssets systemId={systemId} />
      </div>
    </div>
  );
}
