"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "../../../../components/button";
import { Card } from "../../../../components/card";
import { TextAreaField, TextField } from "../../../../components/form-field";
import { PageHeader } from "../../../../components/page-header";
import {
  deleteNotificationTemplate,
  getNotificationTemplateById,
  updateNotificationTemplate,
} from "../../../../lib/api/notifications";

export default function NotificationTemplateDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const templateId = params.id;

  const templateQuery = useQuery({
    queryKey: ["notification-template", templateId],
    queryFn: () => getNotificationTemplateById(templateId),
  });

  const [template, setTemplate] = useState("");
  const [subject, setSubject] = useState("");

  useEffect(() => {
    if (templateQuery.data) {
      setTemplate(templateQuery.data.data.template);
      setSubject(templateQuery.data.data.subject ?? "");
    }
  }, [templateQuery.data]);

  const updateMutation = useMutation({
    mutationFn: () => updateNotificationTemplate(templateId, { template, subject: subject || null }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notification-template", templateId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteNotificationTemplate(templateId),
    onSuccess: () => router.push("/notifications/templates"),
  });

  const data = templateQuery.data?.data;

  return (
    <div>
      <PageHeader
        title={data ? `${data.event_type} (${data.channel})` : "Template"}
        description={data ? `External system: ${data.external_system_id}` : undefined}
        actions={
          <Button variant="danger" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? "Deleting…" : "Delete template"}
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
              {updateMutation.error instanceof Error ? updateMutation.error.message : "Failed to update template."}
            </p>
          )}
          <TextField label="Subject" value={subject} onChange={(event) => setSubject(event.target.value)} />
          <TextAreaField label="Template" value={template} onChange={(event) => setTemplate(event.target.value)} />
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
