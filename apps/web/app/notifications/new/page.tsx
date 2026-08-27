"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "../../../components/button";
import { Card } from "../../../components/card";
import { TextAreaField, TextField } from "../../../components/form-field";
import { PageHeader } from "../../../components/page-header";
import { addNotification } from "../../../lib/api/notifications";

export default function NewNotificationPage() {
  const router = useRouter();
  const [externalSystemId, setExternalSystemId] = useState("");
  const [userId, setUserId] = useState("");
  const [eventType, setEventType] = useState("");
  const [payload, setPayload] = useState("{}");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [payloadError, setPayloadError] = useState<string | undefined>();

  const mutation = useMutation({
    mutationFn: () => {
      let parsedPayload: Record<string, unknown>;
      try {
        parsedPayload = JSON.parse(payload);
      } catch {
        throw new Error("Payload must be valid JSON.");
      }
      return addNotification({
        external_system_id: externalSystemId,
        user_id: userId,
        event_type: eventType,
        payload: parsedPayload,
        idempotency_key: idempotencyKey || null,
      });
    },
    onSuccess: (response) => router.push(`/notifications/${response.data.id}`),
  });

  return (
    <div>
      <PageHeader title="New notification" />
      <Card>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setPayloadError(undefined);
            try {
              JSON.parse(payload);
            } catch {
              setPayloadError("Must be valid JSON.");
              return;
            }
            mutation.mutate();
          }}
        >
          {mutation.isError && (
            <p className="text-sm text-destructive">
              {mutation.error instanceof Error ? mutation.error.message : "Failed to create notification."}
            </p>
          )}
          <TextField
            label="External system id"
            value={externalSystemId}
            onChange={(event) => setExternalSystemId(event.target.value)}
            required
          />
          <TextField label="User id" value={userId} onChange={(event) => setUserId(event.target.value)} required />
          <TextField label="Event type" value={eventType} onChange={(event) => setEventType(event.target.value)} required />
          <TextAreaField
            label="Payload (JSON)"
            value={payload}
            onChange={(event) => setPayload(event.target.value)}
            error={payloadError}
            required
          />
          <TextField
            label="Idempotency key"
            value={idempotencyKey}
            onChange={(event) => setIdempotencyKey(event.target.value)}
            hint="Optional — replays with the same key return the original notification."
          />
          <div>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Sending…" : "Send notification"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
