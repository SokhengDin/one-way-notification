"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CHANNEL_TYPES, type ChannelType } from "@repo/schema";
import { Button } from "../../../components/button";
import { Card } from "../../../components/card";
import { CheckboxField, SelectField, TextField } from "../../../components/form-field";
import { PageHeader } from "../../../components/page-header";
import { addChannelProvider } from "../../../lib/api/providers";

export default function NewProviderPage() {
  const router = useRouter();
  const [channel, setChannel] = useState<ChannelType>("email");
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);

  const mutation = useMutation({
    mutationFn: () => addChannelProvider({ channel, name, is_active: isActive }),
    onSuccess: (response) => router.push(`/providers/${response.data.id}`),
  });

  return (
    <div>
      <PageHeader title="New provider" />
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
              {mutation.error instanceof Error ? mutation.error.message : "Failed to create provider."}
            </p>
          )}
          <SelectField
            label="Channel"
            value={channel}
            onValueChange={(value) => setChannel(value as ChannelType)}
            options={CHANNEL_TYPES.map((value) => ({ value, label: value }))}
          />
          <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} required />
          <CheckboxField label="Active" checked={isActive} onCheckedChange={setIsActive} />
          <div>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Creating…" : "Create provider"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
