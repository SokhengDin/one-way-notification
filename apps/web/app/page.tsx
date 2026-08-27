"use client";

import { useQuery } from "@tanstack/react-query";
import { Card } from "../components/card";
import { PageHeader } from "../components/page-header";
import { listExternalSystems } from "../lib/api/external-systems";
import { listNotifications } from "../lib/api/notifications";
import { listChannelProviders } from "../lib/api/providers";
import { listUsers } from "../lib/api/users";

function SummaryCard({ label, value, isLoading }: { label: string; value?: number; isLoading: boolean }) {
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">
        {isLoading ? "…" : (value ?? "—")}
      </p>
    </Card>
  );
}

export default function Home() {
  const usersQuery = useQuery({
    queryKey: ["users", { skip: 0, limit: 1 }],
    queryFn: () => listUsers({ skip: 0, limit: 1 }),
  });
  const notificationsQuery = useQuery({
    queryKey: ["notifications", { skip: 0, limit: 1 }],
    queryFn: () => listNotifications({ skip: 0, limit: 1 }),
  });
  const externalSystemsQuery = useQuery({
    queryKey: ["external-systems", { skip: 0, limit: 1 }],
    queryFn: () => listExternalSystems({ skip: 0, limit: 1 }),
  });
  const providersQuery = useQuery({
    queryKey: ["channel-providers", { skip: 0, limit: 1 }],
    queryFn: () => listChannelProviders({ skip: 0, limit: 1 }),
  });

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Summary of everything wired into the notification service."
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard
          label="Users"
          value={usersQuery.data?.data.total}
          isLoading={usersQuery.isLoading}
        />
        <SummaryCard
          label="Notifications sent"
          value={notificationsQuery.data?.data.total}
          isLoading={notificationsQuery.isLoading}
        />
        <SummaryCard
          label="External systems"
          value={externalSystemsQuery.data?.data.total}
          isLoading={externalSystemsQuery.isLoading}
        />
        <SummaryCard
          label="Channel providers"
          value={providersQuery.data?.data.total}
          isLoading={providersQuery.isLoading}
        />
      </div>
    </div>
  );
}
