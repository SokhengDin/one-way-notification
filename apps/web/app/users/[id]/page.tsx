"use client";

import { useQuery } from "@tanstack/react-query";
import { UserRound } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { LinkButton } from "@/components/button";
import { Card } from "@/components/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { listExternalUserLinksByUser } from "@/lib/api/external-systems";

/**
 * Users live under their external system. Links that only know the user
 * (older bookmarks, a pasted id) land here and go on to the user's page in
 * the first system they belong to.
 */
export default function UserRedirectPage() {
  const userId = useParams<{ id: string }>().id;
  const router = useRouter();
  const query  = useQuery({
    queryKey: ["external-user-links-by-user", userId],
    queryFn:  () => listExternalUserLinksByUser(userId, { skip: 0, limit: 1 }),
  });
  const first = query.data?.data.items[0];

  useEffect(() => {
    if (first) router.replace(`/external-systems/${first.external_system_id}/users/${userId}`);
  }, [first, router, userId]);

  if (query.isLoading || first) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Opening the user…">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader back={{ href: "/external-systems", label: "External systems" }} title="User" />
      <Card>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500 dark:bg-zinc-800">
            <UserRound className="size-5" />
          </span>
          <p className="font-medium">
            {query.isError ? "Couldn't find this user." : "This user isn't under any external system."}
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Users are managed inside the external system they belong to. Open a system and add them from its Users tab.
          </p>
          <LinkButton href="/external-systems" variant="secondary">Go to external systems</LinkButton>
        </div>
      </Card>
    </div>
  );
}
