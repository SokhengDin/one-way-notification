"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CHANNEL_TYPES, type ChannelType } from "@repo/schema";
import { Button } from "../../../../components/button";
import { Card } from "../../../../components/card";
import { Combobox } from "../../../../components/combobox";
import { SelectField, TextAreaField, TextField } from "../../../../components/form-field";
import { PageHeader } from "../../../../components/page-header";
import { listExternalSystems } from "../../../../lib/api/external-systems";
import { addNotificationTemplate, listNotificationTemplates } from "../../../../lib/api/notifications";

export default function NewNotificationTemplatePage() {
  const router = useRouter();
  const [externalSystemId, setExternalSystemId] = useState("");
  const [systemSearch, setSystemSearch] = useState("");
  const [eventType, setEventType] = useState("");
  const [channel, setChannel] = useState<ChannelType>("email");
  const [template, setTemplate] = useState("");
  const [subject, setSubject] = useState("");

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

  return (
    <div>
      <PageHeader title="New template" />
      <Card>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          {mutation.isError && (
            <p className="text-sm text-destructive">
              {mutation.error instanceof Error ? mutation.error.message : "Failed to create template."}
            </p>
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
            hint="Optional — used for email templates."
          />
          <TextAreaField
            label="Template"
            value={template}
            onChange={(event) => setTemplate(event.target.value)}
            required
          />
          <div>
            <Button type="submit" disabled={mutation.isPending || !externalSystemId}>
              {mutation.isPending ? "Creating…" : "Create template"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
