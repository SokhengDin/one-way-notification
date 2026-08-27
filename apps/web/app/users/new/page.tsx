"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "../../../components/button";
import { Card } from "../../../components/card";
import { PageHeader } from "../../../components/page-header";
import { addUser } from "../../../lib/api/users";

export default function NewUserPage() {
  const router = useRouter();

  const mutation = useMutation({
    mutationFn: addUser,
    onSuccess: (response) => {
      router.push(`/users/${response.data.id}`);
    },
  });

  return (
    <div>
      <PageHeader title="New user" description="Users have no fields of their own — contacts and preferences are added afterward." />
      <Card>
        <div className="flex flex-col gap-4">
          {mutation.isError && (
            <p className="text-sm text-destructive">
              {mutation.error instanceof Error ? mutation.error.message : "Failed to create user."}
            </p>
          )}
          <div>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? "Creating…" : "Create user"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
