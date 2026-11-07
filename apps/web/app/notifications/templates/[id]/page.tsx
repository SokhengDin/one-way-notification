"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../../../../components/button";
import { Card } from "../../../../components/card";
import { ConfirmButton } from "../../../../components/confirm-button";
import { TextField } from "../../../../components/form-field";
import { TemplateEditor } from "../../../../components/template-editor";
import { PageHeader } from "../../../../components/page-header";
import { ChannelBadge } from "../../../../components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TemplatePreview } from "../../../../components/template-preview";
import { getExternalSystemById } from "../../../../lib/api/external-systems";
import {
  deleteNotificationTemplate,
  getNotificationTemplateById,
  updateNotificationTemplate,
} from "../../../../lib/api/notifications";
import { errorIssues, errorMessage, errorTag } from "../../../../lib/errors";

export default function NotificationTemplateDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const templateId = params.id;

  const templateQuery = useQuery({
    queryKey: ["notification-template", templateId],
    queryFn: () => getNotificationTemplateById(templateId),
  });

  const data = templateQuery.data?.data;

  const systemQuery = useQuery({
    queryKey: ["external-system", data?.external_system_id],
    queryFn: () => getExternalSystemById(data!.external_system_id),
    enabled: !!data,
  });

  const [template, setTemplate] = useState("");
  const [subject, setSubject] = useState("");
  const [previewIssues, setPreviewIssues] = useState<ReadonlyArray<string>>([]);
  const [payloadVariables, setPayloadVariables] = useState<ReadonlyArray<string>>([]);

  // Fill the form once, from the first load. Later refetches (e.g. on window
  // focus) must not overwrite unsaved edits; after a save the form already
  // holds what was saved. Adjusted during render rather than in an effect.
  const [loaded, setLoaded] = useState(false);
  if (templateQuery.data && !loaded) {
    setLoaded(true);
    setTemplate(templateQuery.data.data.template);
    setSubject(templateQuery.data.data.subject ?? "");
  }

  const isDirty = !!data && (template !== data.template || subject !== (data.subject ?? ""));

  const updateMutation = useMutation({
    mutationFn: () => updateNotificationTemplate(templateId, { template, subject: subject || null }),
    onSuccess: () => {
      toast.success("Template saved");
      void queryClient.invalidateQueries({ queryKey: ["notification-template", templateId] });
      void queryClient.invalidateQueries({ queryKey: ["notification-templates"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteNotificationTemplate(templateId),
    onSuccess: () => {
      toast.success("Template deleted");
      void queryClient.invalidateQueries({ queryKey: ["notification-templates"] });
      router.push("/notifications/templates");
    },
  });

  const saveIssues = updateMutation.isError ? errorIssues(updateMutation.error) : [];

  if (templateQuery.isError) {
    return (
      <div>
        <PageHeader title="Template" />
        <Card>
          <p className="text-sm text-destructive" role="alert" data-testid="load-error">
            {errorTag(templateQuery.error) === "NotificationTemplateNotFound"
              ? "This template doesn't exist or has been deleted."
              : errorMessage(templateQuery.error, "Could not load this template.")}
          </p>
          <Link href="/notifications/templates" className="mt-3 inline-block text-sm text-primary hover:underline">
            Back to templates
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={data ? data.event_type : "Template"}
        description={
          data
            ? `${systemQuery.data?.data.name ?? data.external_system_id} · last saved ${new Date(data.updated_at).toLocaleString()}`
            : undefined
        }
        actions={
          <>
            {data && <ChannelBadge channel={data.channel} />}
            <ConfirmButton
              label="Delete template"
              title="Delete this template?"
              description={
                data
                  ? `Notifications for "${data.event_type}" will no longer be sent by ${data.channel}. This can't be undone from the dashboard.`
                  : "This can't be undone from the dashboard."
              }
              isPending={deleteMutation.isPending}
              onConfirm={() => deleteMutation.mutate()}
            />
          </>
        }
      />

      {deleteMutation.isError && (
        <p className="mb-4 text-sm text-destructive" role="alert">
          {errorMessage(deleteMutation.error, "Failed to delete template.")}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Edit">
          {/* The form only mounts once the template is loaded: anything typed
              into an empty form before then would be overwritten by the sync. */}
          {!data ? (
            <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading…">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-72 w-full" />
            </div>
          ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              updateMutation.mutate();
            }}
          >
            {updateMutation.isError && (
              <div className="text-sm text-destructive" role="alert" data-testid="save-error">
                <p>{errorMessage(updateMutation.error, "Failed to update template.")}</p>
                {saveIssues.length > 1 && (
                  <ul className="mt-1 list-disc pl-5">
                    {saveIssues.map((issue) => <li key={issue}>{issue}</li>)}
                  </ul>
                )}
              </div>
            )}
            <TextField
              label="Subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              required={data?.channel === "email"}
              hint={data?.channel === "email" ? "Required for email." : "Not used for this channel."}
            />
            <TemplateEditor
              label="Template"
              value={template}
              onChange={setTemplate}
              channel={data.channel}
              externalSystemId={data.external_system_id}
              variables={payloadVariables}
              issues={previewIssues}
              minHeight={360}
            />
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={updateMutation.isPending || !isDirty}>
                {updateMutation.isPending ? "Saving…" : "Save"}
              </Button>
              {isDirty && <span className="text-xs text-muted-foreground">Unsaved changes — the preview shows them.</span>}
            </div>
          </form>
          )}
        </Card>

        {data && (
          <TemplatePreview
            externalSystemId={data.external_system_id}
            channel={data.channel}
            template={template}
            subject={subject || null}
            onIssuesChange={setPreviewIssues}
            onPayloadPathsChange={setPayloadVariables}
          />
        )}
      </div>
    </div>
  );
}
