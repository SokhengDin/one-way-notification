"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { PageHeader } from "../../../components/page-header";
import { emptyProviderForm, ProviderForm } from "../../../components/provider-form";
import { addChannelProvider } from "../../../lib/api/providers";
import { errorIssues, errorMessage } from "../../../lib/errors";

export default function NewProviderPage() {
  const router      = useRouter();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    meta: { inline: true },
    mutationFn: (submit: Parameters<React.ComponentProps<typeof ProviderForm>["onSubmit"]>[0]) =>
      addChannelProvider({
        channel:   submit.channel,
        kind:      submit.kind,
        name:      submit.name,
        priority:  submit.priority,
        is_active: submit.isActive,
        config:    submit.config,
        // nothing is stored yet, so there's nothing to clear
        secrets:   Object.fromEntries(
          Object.entries(submit.secrets).filter((entry): entry is [string, string] => entry[1] !== null),
        ),
      }),
    onSuccess: (response) => {
      toast.success("Provider created");
      void queryClient.invalidateQueries({ queryKey: ["channel-providers"] });
      router.push(`/providers/${response.data.id}`);
    },
  });

  return (
    <div>
      <PageHeader
        back={{ href: "/providers", label: "Providers" }}
        title="New provider"
        description="Connect an email service, your own domain over SMTP, an SMS gateway or a Telegram bot."
      />
      <ProviderForm
        existing={null}
        initial={emptyProviderForm()}
        isPending={mutation.isPending}
        serverError={
          mutation.isError
            ? { message: errorMessage(mutation.error, "Failed to create provider."), issues: errorIssues(mutation.error) }
            : null
        }
        submitLabel="Create provider"
        onSubmit={(submit) => mutation.mutate(submit)}
      />
    </div>
  );
}
