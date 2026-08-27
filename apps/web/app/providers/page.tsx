"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import type { ChannelProviderRecord } from "@repo/schema";
import { LinkButton } from "../../components/button";
import { DataTable, type DataTableColumn } from "../../components/data-table";
import { PageHeader } from "../../components/page-header";
import { BooleanBadge, ChannelBadge } from "../../components/status-badge";
import { listChannelProviders } from "../../lib/api/providers";

const columns: ReadonlyArray<DataTableColumn<ChannelProviderRecord>> = [
  {
    header: "Name",
    cell: (row) => (
      <Link href={`/providers/${row.id}`} className="font-medium hover:underline">
        {row.name}
      </Link>
    ),
  },
  { header: "Channel", cell: (row) => <ChannelBadge channel={row.channel} /> },
  { header: "Active", cell: (row) => <BooleanBadge value={row.is_active ?? true} /> },
];

export default function ProvidersPage() {
  const [pagination, setPagination] = useState({ skip: 0, limit: 20 });

  const query = useQuery({
    queryKey: ["channel-providers", pagination],
    queryFn: () => listChannelProviders(pagination),
  });

  return (
    <div>
      <PageHeader
        title="Providers"
        actions={<LinkButton href="/providers/new">New provider</LinkButton>}
      />
      <DataTable
        columns={columns}
        data={query.data?.data}
        rowKey={(row) => row.id}
        isLoading={query.isLoading}
        error={query.error}
        onPageChange={(skip, limit) => setPagination({ skip, limit })}
      />
    </div>
  );
}
