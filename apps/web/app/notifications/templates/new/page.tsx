"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CHANNEL_TYPES, type ChannelType } from "@repo/schema";
import { Button } from "../../../../components/button";
import { Card } from "../../../../components/card";
import { Combobox } from "../../../../components/combobox";
import { SelectField, TextField } from "../../../../components/form-field";
import { TemplateEditor } from "../../../../components/template-editor";
import { PageHeader } from "../../../../components/page-header";
import { listExternalSystems } from "../../../../lib/api/external-systems";
import { addNotificationTemplate, listNotificationTemplates } from "../../../../lib/api/notifications";
import { TemplatePreview } from "../../../../components/template-preview";
import { errorIssues, errorMessage } from "../../../../lib/errors";

export default function NewNotificationTemplatePage() {
  const router = useRouter();
  const [externalSystemId, setExternalSystemId] = useState("");
  const [systemSearch, setSystemSearch] = useState("");
  const [eventType, setEventType] = useState("");
  const [channel, setChannel] = useState<ChannelType>("email");
  const [template, setTemplate] = useState("");
  const [subject, setSubject] = useState("");
  const [previewIssues, setPreviewIssues] = useState<ReadonlyArray<string>>([]);
  const [payloadVariables, setPayloadVariables] = useState<ReadonlyArray<string>>([]);

  const systemsQuery = useQuery({
    queryKey: ["external-systems", { name: systemSearch }],
    queryFn: () => listExternalSystems({ skip: 0, limit: 20, name: systemSearch || undefined }),
  });

  const existingEventTypesQuery = useQuery({
    queryKey: ["notification-templates", { external_system_id: externalSystemId }],
    queryFn: () =>
      listNotificationTemplates({ skip: 0, limit: 100, external_system_id: externalSystemId }),
    enabled: !!externalSystemId,
  });

  const eventTypeOptions = Array.from(
    new Set((existingEventTypesQuery.data?.data.items ?? []).map((template) => template.event_type)),
  );

  const mutation = useMutation({
    mutationFn: () =>
      addNotificationTemplate({
        external_system_id: externalSystemId,
        event_type: eventType,
        channel,
        template,
        subject: subject || null,
      }),
    onSuccess: (response) => router.push(`/notifications/templates/${response.data.id}`),
  });

  const saveIssues = mutation.isError ? errorIssues(mutation.error) : [];

  return (
    <div>
      <PageHeader title="New template" back={{ href: "/notifications/templates", label: "Templates" }} />
      <div className="grid gap-6 xl:grid-cols-2">
      <Card title="Template">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          {mutation.isError && (
            <div className="text-sm text-destructive" role="alert" data-testid="save-error">
              <p>{errorMessage(mutation.error, "Failed to create template.")}</p>
              {saveIssues.length > 1 && (
                <ul className="mt-1 list-disc pl-5">
                  {saveIssues.map((issue) => <li key={issue}>{issue}</li>)}
                </ul>
              )}
            </div>
          )}
          <Combobox
            label="External system"
            value={externalSystemId}
            onValueChange={(value) => {
              setExternalSystemId(value);
              setEventType("");
            }}
            options={(systemsQuery.data?.data.items ?? []).map((system) => ({
              value: system.id,
              label: system.name,
            }))}
            search={systemSearch}
            onSearchChange={setSystemSearch}
            placeholder="Select an external system…"
            isLoading={systemsQuery.isLoading}
          />
          <TextField
            label="Event type"
            value={eventType}
            onChange={(event) => setEventType(event.target.value)}
            list="event-type-suggestions"
            placeholder="e.g. order.shipped"
            hint={
              externalSystemId
                ? "Pick an existing event type or type a new one."
                : "Select an external system first to see existing event types."
            }
            required
          />
          <datalist id="event-type-suggestions">
            {eventTypeOptions.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
          <SelectField
            label="Channel"
            value={channel}
            onValueChange={(value) => setChannel(value as ChannelType)}
            options={CHANNEL_TYPES.map((value) => ({ value, label: value }))}
          />
          <TextField
            label="Subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            required={channel === "email"}
            hint={channel === "email" ? "Required for email. Variables work here too." : "Not used for this channel."}
          />
          <TemplateEditor
            label="Template"
            value={template}
            onChange={setTemplate}
            channel={channel}
            externalSystemId={externalSystemId}
            variables={payloadVariables}
            issues={previewIssues}
            placeholder={channel === "email" ? "<p>Hello {{name}}</p>" : "Your code is {{code}}"}
          />
          <div>
            <Button type="submit" disabled={mutation.isPending || !externalSystemId || template.trim() === ""}>
              {mutation.isPending ? "Creating…" : "Create template"}
            </Button>
          </div>
        </form>
      </Card>
      <TemplatePreview
        externalSystemId={externalSystemId}
        channel={channel}
        template={template}
        subject={subject || null}
        onIssuesChange={setPreviewIssues}
        onPayloadPathsChange={setPayloadVariables}
      />
      </div>
    </div>
  );
}
