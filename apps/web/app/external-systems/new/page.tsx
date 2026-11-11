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

  const mutation = useMutation({
    mutationFn: () => addExternalSystem({ name: name.trim() }),
    meta: { success: "External system created", inline: true },
    onSuccess: (response) => router.push(`/external-systems/${response.data.id}?issue=1`),
  });

  return (
    <div>
      <PageHeader title="New external system" back={{ href: "/external-systems", label: "External systems" }} />
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
          <TextField
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            hint="The service that will send through this API. You'll issue its API key next."
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
