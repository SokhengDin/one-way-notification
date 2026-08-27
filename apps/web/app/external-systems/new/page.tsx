"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "../../../components/button";
import { Card } from "../../../components/card";
import { TextField } from "../../../components/form-field";
import { PageHeader } from "../../../components/page-header";
import { addExternalSystem } from "../../../lib/api/external-systems";

export default function NewExternalSystemPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");

  const mutation = useMutation({
    mutationFn: () => addExternalSystem({ name, api_key: apiKey }),
    onSuccess: (response) => router.push(`/external-systems/${response.data.id}`),
  });

  return (
    <div>
      <PageHeader title="New external system" />
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
              {mutation.error instanceof Error ? mutation.error.message : "Failed to create system."}
            </p>
          )}
          <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} required />
          <TextField
            label="API key"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            required
            hint="Shared secret the external system will authenticate with."
          />
          <div>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Creating…" : "Create system"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
