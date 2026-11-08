"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { CHANNEL_TYPES, type ChannelType, type UserContactRecord, type UserPreferenceRecord } from "@repo/schema";
import { Button, LinkButton } from "../../../components/button";
import { Card } from "../../../components/card";
import { CheckboxField, SelectField, TextField } from "../../../components/form-field";
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
import { toast } from "sonner";
import { ConfirmButton } from "../../../components/confirm-button";
import { SystemLink } from "../../../components/entity-links";
import { IdChip } from "../../../components/id-chip";
import { OutcomeSummary } from "../../../components/notification-outcome";
import { listExternalUserLinksByUser } from "../../../lib/api/external-systems";
import { listNotifications } from "../../../lib/api/notifications";
import { deleteUser, getUserById, listUserContacts, listUserPreferences, setUserPreference, updateUser } from "../../../lib/api/users";
import { errorMessage } from "../../../lib/errors";
import { timeAgo } from "../../../lib/format";

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

  const notificationsQuery = useQuery({
    queryKey: ["notifications", { user_id: userId, limit: 10 }],
    queryFn:  () => listNotifications({ user_id: userId, skip: 0, limit: 10 }),
  });

  const user = userQuery.data?.data;
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const renameMutation = useMutation({
    mutationFn: () => updateUser(userId, { name: (nameDraft ?? "").trim() || null }),
    onSuccess: () => {
      toast.success("Name saved");
      setNameDraft(null);
      void queryClient.invalidateQueries({ queryKey: ["user", userId] });
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => toast.error(errorMessage(error, "Could not save the name")),
  });

  const preferenceByChannel = new Map(
    (preferencesQuery.data?.data.items ?? []).map((preference) => [preference.channel, preference]),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={user ? user.display_name : "User"}
        description={user ? `${user.email ?? "No email"} · created ${timeAgo(user.created_at)}` : undefined}
        actions={
          <ConfirmButton
            label="Delete user"
            title={`Delete ${user?.display_name ?? "this user"}?`}
            description="Their contacts and links go with them. Past notifications stay in the history."
            isPending={deleteMutation.isPending}
            onConfirm={() => deleteMutation.mutate()}
          />
        }
      />

      {user && (
        <Card title="Profile">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              renameMutation.mutate();
            }}
          >
            <div className="w-72">
              <TextField
                label="Name"
                value={nameDraft ?? user.name ?? ""}
                onChange={(event) => setNameDraft(event.target.value)}
                placeholder="Not set"
                hint={user.name ? undefined : `Shown as "${user.display_name}" until a name is set.`}
              />
            </div>
            <Button type="submit" variant="secondary" disabled={nameDraft === null || renameMutation.isPending}>
              {renameMutation.isPending ? "Saving…" : "Save name"}
            </Button>
            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              <IdChip id={user.id} label="Id" />
            </div>
          </form>
        </Card>
      )}

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
                options={CHANNEL_TYPES.map((channel) => ({ value: channel, label: { email: "Email", sms: "SMS", telegram: "Telegram" }[channel] }))}
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
              cell: (row) => <SystemLink id={row.external_system_id} name={row.system_name} />,
            },
            { header: "Known there as", cell: (row) => <span className="font-mono text-xs">{row.external_user_id}</span> },
          ]}
          data={linksQuery.data?.data}
          rowKey={(row) => row.id}
          isLoading={linksQuery.isLoading}
          error={linksQuery.error}
          emptyMessage="No linked external systems."
        />
      </Card>

      <Card
        title="Recent notifications"
        actions={<LinkButton variant="outline" href={`/deliveries?q=${encodeURIComponent(user?.display_name ?? "")}`}>All deliveries</LinkButton>}
      >
        <DataTable
          columns={[
            {
              header: "Event",
              cell: (row) => <Link href={`/notifications/${row.id}`} className="font-medium hover:underline">{row.event_type}</Link>,
            },
            { header: "System", cell: (row) => <SystemLink id={row.external_system_id} name={row.system_name} /> },
            { header: "Outcome", cell: (row) => <OutcomeSummary row={row} /> },
            {
              header: "When",
              className: "whitespace-nowrap text-muted-foreground",
              cell: (row) => <span title={new Date(row.created_at).toLocaleString()}>{timeAgo(row.created_at)}</span>,
            },
          ]}
          data={notificationsQuery.data?.data}
          rowKey={(row) => row.id}
          isLoading={notificationsQuery.isLoading}
          error={notificationsQuery.error}
          emptyMessage="Nothing sent to this user yet."
        />
      </Card>
    </div>
  );
}
