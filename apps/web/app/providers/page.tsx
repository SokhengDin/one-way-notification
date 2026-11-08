"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { providerKindSpec, type ChannelProviderRecord } from "@repo/schema";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "../../components/button";
import { DataTable, type DataTableColumn } from "../../components/data-table";
import { PageHeader } from "../../components/page-header";
import { BooleanBadge, ChannelBadge } from "../../components/status-badge";
import { HealthBadge } from "../../components/provider-health";
import { listChannelProviders } from "../../lib/api/providers";

function sender(provider: ChannelProviderRecord): string {
  const { config } = provider;
  const value = config.from_email ?? config.from_number ?? config.from ?? null;
  if (value === null) return "—";
  return config.from_name ? `${config.from_name} <${value}>` : String(value);
}

function CredentialsBadge({ provider }: { readonly provider: ChannelProviderRecord }) {
  const spec = provider.kind ? providerKindSpec(provider.kind) : undefined;
  if (!spec) return <Badge variant="outline">Not configured</Badge>;
  const missing = spec.fields.filter((field) => field.secret && field.required && !provider.secret_keys.includes(field.key));
  return missing.length === 0 ? (
    <Badge variant="outline" className="border-transparent bg-success/15 text-success">Saved</Badge>
  ) : (
    <Badge variant="outline" className="border-transparent bg-destructive/10 text-destructive">
      Missing {missing.map((field) => field.label.toLowerCase()).join(", ")}
    </Badge>
  );
}

const columns: ReadonlyArray<DataTableColumn<ChannelProviderRecord>> = [
  {
    header: "Name",
    cell: (row) => (
      <Link href={`/providers/${row.id}`} className="font-medium hover:underline">
        {row.name}
      </Link>
    ),
  },
  { header: "Channel",     cell: (row) => <ChannelBadge channel={row.channel} /> },
  { header: "Service",     cell: (row) => (row.kind ? providerKindSpec(row.kind)?.label ?? row.kind : "—") },
  { header: "Sends from",  cell: (row) => <span className="text-xs">{sender(row)}</span> },
  { header: "Priority",    cell: (row) => <span className="tabular-nums">{row.priority}</span> },
  { header: "Credentials", cell: (row) => <CredentialsBadge provider={row} /> },
  { header: "Health",      cell: (row) => <HealthBadge provider={row} /> },
  { header: "Active",      cell: (row) => <BooleanBadge value={row.is_active ?? true} /> },
];

export default function ProvidersPage() {
  const [pagination, setPagination] = useState({ skip: 0, limit: 20 });

  const query = useQuery({
    queryKey: ["channel-providers", pagination],
    queryFn:  () => listChannelProviders(pagination),
    refetchInterval: 15_000,
  });

  return (
    <div>
      <PageHeader
        title="Providers"
        description="Where notifications are sent through. Per channel, the lowest priority is tried first and the next one takes over if it fails."
        actions={<LinkButton href="/providers/new">New provider</LinkButton>}
      />
      <DataTable
        columns={columns}
        data={query.data?.data}
        rowKey={(row) => row.id}
        isLoading={query.isLoading}
        error={query.error}
        onPageChange={(skip, limit) => setPagination({ skip, limit })}
        emptyMessage="No providers yet. Add one to start sending."
      />
    </div>
  );
}
