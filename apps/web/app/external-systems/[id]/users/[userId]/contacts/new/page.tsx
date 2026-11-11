"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { CHANNEL_TYPES, type ChannelType } from "@repo/schema";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { CheckboxField, SelectField, TextField } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { addUserContact, getUserById } from "@/lib/api/users";

const CHANNEL_LABEL: Record<ChannelType, string> = { email: "Email", sms: "SMS (phone)", telegram: "Telegram" };
const ADDRESS_HINT: Record<ChannelType, { placeholder: string; hint: string }> = {
  email:    { placeholder: "dara@example.com", hint: "Where emails go." },
  sms:      { placeholder: "+33612345678", hint: "Phone number in international format (E.164)." },
  telegram: { placeholder: "123456789", hint: "The chat id your bot gets when the user starts it. Mark it linked once they have." },
};

export default function NewUserContactPage() {
  const params = useParams<{ id: string; userId: string }>();
  const router = useRouter();
  const userId   = params.userId;
  const userPath = `/external-systems/${params.id}/users/${userId}`;

  const [channel, setChannel] = useState<ChannelType>("email");
  const [address, setAddress] = useState("");
  const [linked, setLinked] = useState(true);
  const [verified, setVerified] = useState(false);

  const userQuery = useQuery({ queryKey: ["user", userId], queryFn: () => getUserById(userId) });
  const userName  = userQuery.data?.data.display_name;

  const mutation = useMutation({
    meta: { success: "Contact added", inline: true },
    mutationFn: () =>
      addUserContact(userId, { channel, address: address || null, linked, verified }),
    onSuccess: () => router.push(userPath),
  });

  return (
    <div>
      <PageHeader
        back={{ href: userPath, label: userName ?? "User" }}
        title="Add contact"
        description={userName ? `A way to reach ${userName}.` : undefined}
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
              {mutation.error instanceof Error ? mutation.error.message : "Failed to add contact."}
            </p>
          )}
          <SelectField
            label="Channel"
            value={channel}
            onValueChange={(value) => setChannel(value as ChannelType)}
            options={CHANNEL_TYPES.map((value) => ({ value, label: CHANNEL_LABEL[value] }))}
          />
          <TextField
            label="Address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder={ADDRESS_HINT[channel].placeholder}
            hint={ADDRESS_HINT[channel].hint}
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
