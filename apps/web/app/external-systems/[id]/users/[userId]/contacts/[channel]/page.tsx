"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import type { ChannelType } from "@repo/schema";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { CheckboxField, TextField } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { getUserById, getUserContact, updateUserContact } from "@/lib/api/users";

const CHANNEL_LABEL: Record<ChannelType, string> = { email: "email", sms: "phone", telegram: "Telegram" };

export default function EditUserContactPage() {
  const params = useParams<{ id: string; userId: string; channel: ChannelType }>();
  const router = useRouter();
  const { userId, channel } = params;
  const userPath = `/external-systems/${params.id}/users/${userId}`;

  const contactQuery = useQuery({
    queryKey: ["user-contact", userId, channel],
    queryFn: () => getUserContact(userId, channel),
  });

  const userQuery = useQuery({ queryKey: ["user", userId], queryFn: () => getUserById(userId) });
  const userName  = userQuery.data?.data.display_name;

  const [address, setAddress] = useState("");
  const [linked, setLinked] = useState(false);
  const [verified, setVerified] = useState(false);

  // reset the form whenever fresh data arrives (adjusted during render)
  const [syncedFrom, setSyncedFrom] = useState(contactQuery.data);
  if (contactQuery.data && contactQuery.data !== syncedFrom) {
    setSyncedFrom(contactQuery.data);
    setAddress(contactQuery.data.data.address ?? "");
    setLinked(contactQuery.data.data.linked);
    setVerified(contactQuery.data.data.verified);
  }

  const mutation = useMutation({
    meta: { success: "Contact saved", inline: true },
    mutationFn: () => updateUserContact(userId, channel, { address: address || null, linked, verified }),
    onSuccess: () => router.push(userPath),
  });

  if (contactQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div>
      <PageHeader
        back={{ href: userPath, label: userName ?? "User" }}
        title={`Edit ${CHANNEL_LABEL[channel] ?? channel} contact`}
        description={userName ? `For ${userName}` : undefined}
      />
      <Card>
        <form
          className="flex max-w-xl flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          {mutation.isError && (
            <p className="text-sm text-destructive">
              {mutation.error instanceof Error ? mutation.error.message : "Failed to update contact."}
            </p>
          )}
          <TextField label="Address" value={address} onChange={(event) => setAddress(event.target.value)} />
          <CheckboxField label="Linked" checked={linked} onCheckedChange={setLinked} />
          <CheckboxField label="Verified" checked={verified} onCheckedChange={setVerified} />
          <div>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
