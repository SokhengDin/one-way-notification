"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import type { ExternalSystemRecord } from "@repo/schema";
import { LinkButton } from "../../components/button";
import { DataTable, type DataTableColumn } from "../../components/data-table";
import { PageHeader } from "../../components/page-header";
import { listExternalSystems } from "../../lib/api/external-systems";

const columns: ReadonlyArray<DataTableColumn<ExternalSystemRecord>> = [
  {
    header: "Name",
    cell: (row) => (
      <Link href={`/external-systems/${row.id}`} className="hover:underline">
        {row.name}
      </Link>
    ),
  },
  { header: "ID", cell: (row) => <span className="font-mono text-xs">{row.id}</span> },
  { header: "Created", cell: (row) => new Date(row.created_at).toLocaleString() },
];

export default function ExternalSystemsPage() {
  const [pagination, setPagination] = useState({ skip: 0, limit: 20 });

  const query = useQuery({
    queryKey: ["external-systems", pagination],
    queryFn: () => listExternalSystems(pagination),
  });

  return (
    <div>
      <PageHeader
        title="External systems"
        actions={<LinkButton href="/external-systems/new">New system</LinkButton>}
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
