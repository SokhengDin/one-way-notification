"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { providerKindSpec } from "@repo/schema";
import { Card } from "../../../components/card";
import { ConfirmButton } from "../../../components/confirm-button";
import { PageHeader } from "../../../components/page-header";
import { ProviderForm, providerFormFrom } from "../../../components/provider-form";
import { ChannelBadge } from "../../../components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { deleteChannelProvider, getChannelProviderById, updateChannelProvider } from "../../../lib/api/providers";
import { errorIssues, errorMessage, errorTag } from "../../../lib/errors";

export default function ProviderDetailPage() {
  const params      = useParams<{ id: string }>();
  const router      = useRouter();
  const queryClient = useQueryClient();
  const providerId  = params.id;

  const providerQuery = useQuery({
    queryKey: ["channel-provider", providerId],
    queryFn:  () => getChannelProviderById(providerId),
  });

  const provider = providerQuery.data?.data;

  const updateMutation = useMutation({
    mutationFn: (submit: Parameters<React.ComponentProps<typeof ProviderForm>["onSubmit"]>[0]) =>
      updateChannelProvider(providerId, {
        name:      submit.name,
        priority:  submit.priority,
        is_active: submit.isActive,
        config:    submit.config,
        secrets:   submit.secrets,
      }),
    onSuccess: (response) => {
      toast.success("Provider saved");
      queryClient.setQueryData(["channel-provider", providerId], response);
      void queryClient.invalidateQueries({ queryKey: ["channel-providers"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteChannelProvider(providerId),
    onSuccess:  () => {
      toast.success("Provider deleted");
      void queryClient.invalidateQueries({ queryKey: ["channel-providers"] });
      router.push("/providers");
    },
  });

  if (providerQuery.isError) {
    return (
      <div>
        <PageHeader title="Provider" />
        <Card>
          <p className="text-sm text-destructive" role="alert" data-testid="load-error">
            {errorTag(providerQuery.error) === "ChannelProviderNotFound"
              ? "This provider doesn't exist or has been deleted."
              : errorMessage(providerQuery.error, "Could not load this provider.")}
          </p>
          <Link href="/providers" className="mt-3 inline-block text-sm text-primary hover:underline">
            Back to providers
          </Link>
        </Card>
      </div>
    );
  }

  const spec = provider?.kind ? providerKindSpec(provider.kind) : undefined;

  return (
    <div>
      <PageHeader
        title={provider?.name ?? "Provider"}
        description={provider ? (spec ? spec.label : "Not configured") : undefined}
        actions={
          <>
            {provider && <ChannelBadge channel={provider.channel} />}
            <ConfirmButton
              label="Delete provider"
              title="Delete this provider?"
              description="Notifications on this channel will use the next active provider by priority. Delivery history keeps referring to it."
              isPending={deleteMutation.isPending}
              onConfirm={() => deleteMutation.mutate()}
            />
          </>
        }
      />
      {!provider ? (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading…">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <ProviderForm
          // remount on save so the form reflects what the server stored
          key={provider.updated_at?.toString() ?? provider.id}
          existing={provider}
          initial={providerFormFrom(provider)}
          isPending={updateMutation.isPending}
          serverError={
            updateMutation.isError
              ? { message: errorMessage(updateMutation.error, "Failed to save provider."), issues: errorIssues(updateMutation.error) }
              : null
          }
          submitLabel="Save"
          onSubmit={(submit) => updateMutation.mutate(submit)}
        />
      )}
    </div>
  );
}
