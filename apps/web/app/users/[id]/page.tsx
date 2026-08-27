"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { CHANNEL_TYPES, type ChannelType, type UserContactRecord, type UserPreferenceRecord } from "@repo/schema";
import { Button, LinkButton } from "../../../components/button";
import { Card } from "../../../components/card";
import { CheckboxField, SelectField } from "../../../components/form-field";
import { DataTable, type DataTableColumn } from "../../../components/data-table";
import { PageHeader } from "../../../components/page-header";
import { BooleanBadge, ChannelBadge } from "../../../components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listExternalUserLinksByUser } from "../../../lib/api/external-systems";
import { deleteUser, getUserById, listUserContacts, listUserPreferences, setUserPreference } from "../../../lib/api/users";

const contactColumns: ReadonlyArray<DataTableColumn<UserContactRecord>> = [
  { header: "Channel", cell: (row) => <ChannelBadge channel={row.channel} /> },
  { header: "Address", cell: (row) => row.address ?? "—" },
  { header: "Linked", cell: (row) => <BooleanBadge value={row.linked} /> },
  { header: "Verified", cell: (row) => <BooleanBadge value={row.verified} /> },
  {
    header: "",
    cell: (row) => (
      <Link
        className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        href={`/users/${row.user_id}/contacts/${row.channel}`}
      >
        Edit
      </Link>
    ),
  },
];

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const userId = params.id;

  const userQuery = useQuery({
    queryKey: ["user", userId],
    queryFn: () => getUserById(userId),
  });

  const contactsQuery = useQuery({
    queryKey: ["user-contacts", userId],
    queryFn: () => listUserContacts(userId, { skip: 0, limit: 100 }),
  });

  const preferencesQuery = useQuery({
    queryKey: ["user-preferences", userId],
    queryFn: () => listUserPreferences(userId, { skip: 0, limit: 100 }),
  });

  const linksQuery = useQuery({
    queryKey: ["external-user-links-by-user", userId],
    queryFn: () => listExternalUserLinksByUser(userId, { skip: 0, limit: 100 }),
  });

  const [preferenceChannel, setPreferenceChannel] = useState<ChannelType>("email");
  const [preferenceEnabled, setPreferenceEnabled] = useState(true);

  const setPreferenceMutation = useMutation({
    mutationFn: () => setUserPreference(userId, { channel: preferenceChannel, enabled: preferenceEnabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user-preferences", userId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteUser(userId),
    onSuccess: () => router.push("/users"),
  });

  const preferenceByChannel = new Map(
    (preferencesQuery.data?.data.items ?? []).map((preference) => [preference.channel, preference]),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={userQuery.data ? `User ${userQuery.data.data.id}` : "User"}
        description={userQuery.data ? `Created ${new Date(userQuery.data.data.created_at).toLocaleString()}` : undefined}
        actions={
          <Button variant="danger" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? "Deleting…" : "Delete user"}
          </Button>
        }
      />

      <Card
        title="Contacts"
        actions={<LinkButton variant="secondary" href={`/users/${userId}/contacts/new`}>Add contact</LinkButton>}
      >
        <DataTable
          columns={contactColumns}
          data={contactsQuery.data?.data}
          rowKey={(row) => row.id}
          isLoading={contactsQuery.isLoading}
          error={contactsQuery.error}
          emptyMessage="No contacts yet."
        />
      </Card>

      <Card title="Preferences">
        <div className="flex flex-col gap-4">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead>Enabled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {CHANNEL_TYPES.map((channel) => {
                  const preference = preferenceByChannel.get(channel) as UserPreferenceRecord | undefined;
                  return (
                    <TableRow key={channel}>
                      <TableCell>
                        <ChannelBadge channel={channel} />
                      </TableCell>
                      <TableCell>
                        {preference ? (
                          <BooleanBadge value={preference.enabled} />
                        ) : (
                          <span className="text-xs text-muted-foreground">Not set</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-end gap-3 border-t pt-4">
            <div className="w-40">
              <SelectField
                label="Channel"
                value={preferenceChannel}
                onValueChange={(value) => setPreferenceChannel(value as ChannelType)}
                options={CHANNEL_TYPES.map((channel) => ({ value: channel, label: channel }))}
              />
            </div>
            <CheckboxField label="Enabled" checked={preferenceEnabled} onCheckedChange={setPreferenceEnabled} />
            <Button
              variant="secondary"
              onClick={() => setPreferenceMutation.mutate()}
              disabled={setPreferenceMutation.isPending}
            >
              {setPreferenceMutation.isPending ? "Saving…" : "Set preference"}
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Linked external systems">
        <DataTable
          columns={[
            {
              header: "External system",
              cell: (row) => (
                <Link href={`/external-systems/${row.external_system_id}`} className="hover:underline">
                  {row.external_system_id}
                </Link>
              ),
            },
            { header: "External user id", cell: (row) => row.external_user_id },
          ]}
          data={linksQuery.data?.data}
          rowKey={(row) => row.id}
          isLoading={linksQuery.isLoading}
          error={linksQuery.error}
          emptyMessage="No linked external systems."
        />
      </Card>
    </div>
  );
}
