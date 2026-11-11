"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { CHANNEL_TYPES, type ChannelType, type UserContactRecord, type UserPreferenceRecord } from "@repo/schema";
import { Button, LinkButton } from "@/components/button";
import { Card } from "@/components/card";
import { TextField } from "@/components/form-field";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { BooleanBadge, ChannelBadge } from "@/components/status-badge";
import { toast } from "@/lib/toast";
import { ConfirmButton } from "@/components/confirm-button";
import { SystemLink } from "@/components/entity-links";
import { IdChip } from "@/components/id-chip";
import { OutcomeSummary } from "@/components/notification-outcome";
import { deleteExternalUserLink, listExternalUserLinksByUser } from "@/lib/api/external-systems";
import { useSystem } from "@/components/system-header";
import { listNotifications } from "@/lib/api/notifications";
import { deleteUser, getUserById, listUserContacts, listUserPreferences, setUserPreference, updateUser } from "@/lib/api/users";
import { errorMessage } from "@/lib/errors";
import { timeAgo } from "@/lib/format";

const contactColumns = (userPath: string): ReadonlyArray<DataTableColumn<UserContactRecord>> => [
  { header: "Channel", cell: (row) => <ChannelBadge channel={row.channel} /> },
  { header: "Address", cell: (row) => row.address ?? "—" },
  { header: "Linked", cell: (row) => <BooleanBadge value={row.linked} /> },
  { header: "Verified", cell: (row) => <BooleanBadge value={row.verified} /> },
  {
    header: "",
    cell: (row) => (
      <Link
        className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        href={`${userPath}/contacts/${row.channel}`}
      >
        Edit
      </Link>
    ),
  },
];

const CHANNEL_LABEL: Record<ChannelType, string> = { email: "Email", sms: "SMS", telegram: "Telegram" };

export default function UserDetailPage() {
  const params      = useParams<{ id: string; userId: string }>();
  const router      = useRouter();
  const queryClient = useQueryClient();
  const systemId    = params.id;
  const userId      = params.userId;
  const usersPath   = `/external-systems/${systemId}/users`;
  const userPath    = `${usersPath}/${userId}`;
  const systemName  = useSystem(systemId).data?.data.name;

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


  const setPreferenceMutation = useMutation({
    meta: { error: "Could not change the preference" },
    mutationFn: (input: { channel: ChannelType; enabled: boolean }) => setUserPreference(userId, input),
    onSuccess: (_response, { channel, enabled }) => {
      toast.success(`${CHANNEL_LABEL[channel]} notifications ${enabled ? "on" : "off"}`);
      return queryClient.invalidateQueries({ queryKey: ["user-preferences", userId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteUser(userId),
    meta:      { success: "User deleted", error: "Could not delete the user" },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["system-users"] });
      router.push(usersPath);
    },
  });

  const notificationsQuery = useQuery({
    queryKey: ["notifications", { user_id: userId, external_system_id: systemId, limit: 10 }],
    queryFn:  () => listNotifications({ user_id: userId, external_system_id: systemId, skip: 0, limit: 10 }),
  });

  const user       = userQuery.data?.data;
  const links      = linksQuery.data?.data.items ?? [];
  const thisLink   = links.find((link) => link.external_system_id === systemId);
  const otherLinks = links.filter((link) => link.external_system_id !== systemId);

  const unlinkMutation = useMutation({
    mutationFn: (linkId: string) => deleteExternalUserLink(linkId),
    meta:       { success: "Removed from this system", error: "Could not remove the user" },
    onSuccess:  () => {
      void queryClient.invalidateQueries({ queryKey: ["system-users", systemId] });
      void queryClient.invalidateQueries({ queryKey: ["external-system", systemId] });
      router.push(usersPath);
    },
  });
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const renameMutation = useMutation({
    mutationFn: () => updateUser(userId, { name: (nameDraft ?? "").trim() || null }),
    onSuccess: () => {
      toast.success("Name saved");
      setNameDraft(null);
      void queryClient.invalidateQueries({ queryKey: ["user", userId] });
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      void queryClient.invalidateQueries({ queryKey: ["system-users", systemId] });
    },
    onError: (error) => toast.error("Could not save the name", { description: errorMessage(error, "Please try again.") }),
  });

  const preferenceByChannel = new Map(
    (preferencesQuery.data?.data.items ?? []).map((preference) => [preference.channel, preference]),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: usersPath, label: systemName ? `${systemName} users` : "Users" }}
        title={user ? user.display_name : "User"}
        description={
          user ? (
            <>
              {thisLink && <>Known to {systemName ?? "this system"} as <code className="rounded bg-muted px-1 font-mono text-xs text-foreground">{thisLink.external_user_id}</code> · </>}
              {user.email ?? "No email"} · created {timeAgo(user.created_at)}
            </>
          ) : undefined
        }
        actions={
          <>
            {thisLink && otherLinks.length > 0 && (
              <ConfirmButton
                label="Remove from this system"
                variant="outline"
                title={`Remove ${user?.display_name ?? "this user"} from ${systemName ?? "this system"}?`}
                description="This system can no longer notify them. They stay a user of their other systems, with their contacts."
                confirmLabel="Remove"
                pendingLabel="Removing…"
                isPending={unlinkMutation.isPending}
                onConfirm={() => unlinkMutation.mutate(thisLink.id)}
              />
            )}
            <ConfirmButton
              label="Delete user"
              title={`Delete ${user?.display_name ?? "this user"}?`}
              description={
                otherLinks.length > 0
                  ? `They're also a user of ${otherLinks.length === 1 ? "another system" : `${otherLinks.length} other systems`}: deleting removes them everywhere. Use “Remove from this system” to keep them there.`
                  : "Their contacts go with them. Past notifications stay in the history."
              }
              isPending={deleteMutation.isPending}
              onConfirm={() => deleteMutation.mutate()}
            />
          </>
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
            <div className="w-full sm:w-72">
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
            <div className="flex items-center gap-2 text-xs text-muted-foreground sm:ml-auto">
              <IdChip id={user.id} />
            </div>
          </form>
        </Card>
      )}

      <Card
        title="Contacts"
        actions={<LinkButton variant="secondary" href={`${userPath}/contacts/new`}>Add contact</LinkButton>}
      >
        <DataTable
          columns={contactColumns(userPath)}
          data={contactsQuery.data?.data}
          rowKey={(row) => row.id}
          rowHref={(row) => `${userPath}/contacts/${row.channel}`}
          isLoading={contactsQuery.isLoading}
          error={contactsQuery.error}
          emptyMessage="No contacts yet."
        />
      </Card>

      <Card title="Notification preferences">
        <p className="mb-3 text-sm text-muted-foreground">
          Turn a channel off and its deliveries are skipped for this user, even when a template exists.
        </p>
        <ul className="divide-y rounded-lg border">
          {CHANNEL_TYPES.map((channel) => {
            const preference = preferenceByChannel.get(channel) as UserPreferenceRecord | undefined;
            const enabled    = preference?.enabled ?? true;
            const contact    = (contactsQuery.data?.data.items ?? []).find((item) => item.channel === channel);
            return (
              <li key={channel} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <ChannelBadge channel={channel} />
                  <span className="truncate text-sm text-muted-foreground">
                    {contact?.address ?? "no contact"}
                  </span>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={enabled}
                    disabled={setPreferenceMutation.isPending}
                    onCheckedChange={(next) => setPreferenceMutation.mutate({ channel, enabled: next === true })}
                    aria-label={`Receive ${channel} notifications`}
                  />
                  {enabled ? "On" : "Off"}
                </label>
              </li>
            );
          })}
        </ul>
      </Card>

      {otherLinks.length > 0 && (
        <Card title="Also a user of">
          <DataTable
            columns={[
              {
                header: "External system",
                cell: (row) => <SystemLink id={row.external_system_id} name={row.system_name} />,
              },
              { header: "Known there as", cell: (row) => <span className="font-mono text-xs">{row.external_user_id}</span> },
            ]}
            data={{ items: otherLinks, total: otherLinks.length, skip: 0, limit: Math.max(otherLinks.length, 1) }}
            rowKey={(row) => row.id}
            rowHref={(row) => `/external-systems/${row.external_system_id}/users/${userId}`}
          />
        </Card>
      )}

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
            { header: "Outcome", cell: (row) => <OutcomeSummary row={row} /> },
            {
              header: "When",
              className: "whitespace-nowrap text-muted-foreground",
              cell: (row) => <span title={new Date(row.created_at).toLocaleString()}>{timeAgo(row.created_at)}</span>,
            },
          ]}
          data={notificationsQuery.data?.data}
          rowKey={(row) => row.id}
          rowHref={(row) => `/notifications/${row.id}`}
          isLoading={notificationsQuery.isLoading}
          error={notificationsQuery.error}
          emptyMessage="Nothing sent to this user yet."
        />
      </Card>
    </div>
  );
}
