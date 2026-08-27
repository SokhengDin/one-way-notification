"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "../../../components/button";
import { Card } from "../../../components/card";
import { CheckboxField, TextField } from "../../../components/form-field";
import { PageHeader } from "../../../components/page-header";
import { deleteChannelProvider, getChannelProviderById, updateChannelProvider } from "../../../lib/api/providers";

export default function ProviderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const providerId = params.id;

  const providerQuery = useQuery({
    queryKey: ["channel-provider", providerId],
    queryFn: () => getChannelProviderById(providerId),
  });

  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (providerQuery.data) {
      setName(providerQuery.data.data.name);
      setIsActive(providerQuery.data.data.is_active ?? true);
    }
  }, [providerQuery.data]);

  const updateMutation = useMutation({
    mutationFn: () => updateChannelProvider(providerId, { name, is_active: isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["channel-provider", providerId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteChannelProvider(providerId),
    onSuccess: () => router.push("/providers"),
  });

  return (
    <div>
      <PageHeader
        title={providerQuery.data?.data.name ?? "Provider"}
        description={providerQuery.data ? `Channel: ${providerQuery.data.data.channel}` : undefined}
        actions={
          <Button variant="danger" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? "Deleting…" : "Delete provider"}
          </Button>
        }
      />
      <Card>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            updateMutation.mutate();
          }}
        >
          {updateMutation.isError && (
            <p className="text-sm text-destructive">
              {updateMutation.error instanceof Error ? updateMutation.error.message : "Failed to update provider."}
            </p>
          )}
          <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} />
          <CheckboxField label="Active" checked={isActive} onCheckedChange={setIsActive} />
          <div>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
