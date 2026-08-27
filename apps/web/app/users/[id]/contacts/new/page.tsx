"use client";

import { useMutation } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { CHANNEL_TYPES, type ChannelType } from "@repo/schema";
import { Button } from "../../../../../components/button";
import { Card } from "../../../../../components/card";
import { CheckboxField, SelectField, TextField } from "../../../../../components/form-field";
import { PageHeader } from "../../../../../components/page-header";
import { addUserContact } from "../../../../../lib/api/users";

export default function NewUserContactPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const userId = params.id;

  const [channel, setChannel] = useState<ChannelType>("email");
  const [address, setAddress] = useState("");
  const [linked, setLinked] = useState(false);
  const [verified, setVerified] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      addUserContact(userId, { channel, address: address || null, linked, verified }),
    onSuccess: () => router.push(`/users/${userId}`),
  });

  return (
    <div>
      <PageHeader title="Add contact" />
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
              {mutation.error instanceof Error ? mutation.error.message : "Failed to add contact."}
            </p>
          )}
          <SelectField
            label="Channel"
            value={channel}
            onValueChange={(value) => setChannel(value as ChannelType)}
            options={CHANNEL_TYPES.map((value) => ({ value, label: value }))}
          />
          <TextField
            label="Address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="email@example.com / +1555… / @telegram_handle"
          />
          <CheckboxField label="Linked" checked={linked} onCheckedChange={setLinked} />
          <CheckboxField label="Verified" checked={verified} onCheckedChange={setVerified} />
          <div>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Adding…" : "Add contact"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
