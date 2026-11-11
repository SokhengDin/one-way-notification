"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ChannelType } from "@repo/schema";
import { Button } from "../../../components/button";
import { Card } from "../../../components/card";
import { SelectField, TextAreaField, TextField } from "../../../components/form-field";
import { PageHeader } from "../../../components/page-header";
import { SystemPicker, UserPicker } from "../../../components/pickers";
import { ChannelBadge } from "../../../components/status-badge";
import { addNotification, listNotificationTemplates } from "../../../lib/api/notifications";
import { errorMessage } from "../../../lib/errors";
import { variablesIn } from "../../../lib/template-variables";

export default function NewNotificationPage() {
  const router = useRouter();
  const [externalSystemId, setExternalSystemId] = useState("");
  const [userId, setUserId]                     = useState("");
  const [eventType, setEventType]               = useState("");
  const [payload, setPayload]                   = useState("{}");
  const [idempotencyKey, setIdempotencyKey]     = useState("");
  const [payloadError, setPayloadError]         = useState<string | undefined>();

  // events come from the system's templates: only those can be delivered
  const templatesQuery = useQuery({
    queryKey: ["notification-templates", { external_system_id: externalSystemId }],
    queryFn:  () => listNotificationTemplates({ skip: 0, limit: 100, external_system_id: externalSystemId }),
    enabled:  !!externalSystemId,
  });
  const templates = templatesQuery.data?.data.items ?? [];
  const events    = [...new Set(templates.map((template) => template.event_type))].sort();
  const channels  = templates.filter((template) => template.event_type === eventType).map((template) => template.channel as ChannelType);

  const pickEvent = (value: string) => {
    setEventType(value);
    // prefill the payload with the variables the templates use
    const variables = new Set(
      templates
        .filter((template) => template.event_type === value)
        .flatMap((template) => variablesIn(`${template.subject ?? ""} ${template.template}`))
        // built-in variables and nested paths are filled or shaped by the sender
        .filter((name) => !name.startsWith("system.") && !name.includes(".")),
    );
    if (variables.size > 0 && (payload.trim() === "{}" || payload.trim() === "")) {
      setPayload(JSON.stringify(Object.fromEntries([...variables].map((name) => [name, ""])), null, 2));
    }
  };

  const mutation = useMutation({
    meta: { success: "Notification queued", inline: true },
    mutationFn: () =>
      addNotification({
        external_system_id: externalSystemId,
        user_id:            userId,
        event_type:         eventType,
        payload:            JSON.parse(payload) as Record<string, unknown>,
        idempotency_key:    idempotencyKey || null,
      }),
    onSuccess: (response) => router.push(`/notifications/${response.data.id}`),
  });

  const ready = externalSystemId !== "" && userId !== "" && eventType !== "";

  return (
    <div>
      <PageHeader
        back={{ href: "/notifications", label: "Notifications" }}
        title="New notification"
        description="Send an event the way an external system would. Useful for testing templates and providers end to end."
      />
      <Card>
        <form
          className="flex max-w-2xl flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setPayloadError(undefined);
            try {
              const parsed: unknown = JSON.parse(payload);
              if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error();
            } catch {
              setPayloadError("Must be a JSON object, e.g. { \"name\": \"Dara\" }.");
              return;
            }
            mutation.mutate();
          }}
        >
          {mutation.isError && (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage(mutation.error, "Failed to create notification.")}
            </p>
          )}
          <SystemPicker
            value={externalSystemId}
            onChange={(id) => {
              setExternalSystemId(id);
              setEventType("");
            }}
          />
          <UserPicker value={userId} onChange={(id) => setUserId(id)} />
          {externalSystemId && events.length === 0 && !templatesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">
              This system has no templates yet, so nothing could be sent. Create a template first.
            </p>
          ) : (
            <SelectField
              label="Event"
              value={eventType}
              onValueChange={pickEvent}
              options={events.map((value) => ({ value, label: value }))}
              hint={externalSystemId ? "Events with at least one template." : "Pick a system first."}
            />
          )}
          {channels.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              Goes out on
              {channels.map((channel) => <ChannelBadge key={channel} channel={channel} />)}
              <span>(where the user has a contact)</span>
            </div>
          )}
          <TextAreaField
            label="Payload (JSON)"
            value={payload}
            onChange={(event) => setPayload(event.target.value)}
            error={payloadError}
            hint="Values for the template variables."
            required
          />
          <TextField
            label="Idempotency key"
            value={idempotencyKey}
            onChange={(event) => setIdempotencyKey(event.target.value)}
            hint="Optional. Sending again with the same key returns the original notification."
          />
          <div>
            <Button type="submit" disabled={!ready || mutation.isPending}>
              {mutation.isPending ? "Sending…" : "Send notification"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
