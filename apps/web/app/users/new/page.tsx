"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "../../../components/button";
import { Card } from "../../../components/card";
import { TextField } from "../../../components/form-field";
import { PageHeader } from "../../../components/page-header";
import { addUser } from "../../../lib/api/users";
import { errorMessage } from "../../../lib/errors";

export default function NewUserPage() {
  const router = useRouter();
  const [name, setName] = useState("");

  const mutation = useMutation({
    mutationFn: () => addUser({ name: name.trim() || null }),
    onSuccess:  (response) => router.push(`/users/${response.data.id}`),
  });

  return (
    <div>
      <PageHeader back={{ href: "/users", label: "Users" }} title="New user" description="Add contacts (email, phone, Telegram) on the next page." />
      <Card>
        <form
          className="flex max-w-md flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          {mutation.isError && (
            <p className="text-sm text-destructive">{errorMessage(mutation.error, "Failed to create user.")}</p>
          )}
          <TextField
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Dara Sok"
            hint="Optional. Without a name the dashboard shows the user's email instead."
            autoFocus
          />
          <div>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Creating…" : "Create user"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
