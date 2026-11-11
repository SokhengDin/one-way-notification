"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Button, LinkButton } from "@/components/button";
import { Card } from "@/components/card";
import { TextField } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { UserPicker } from "@/components/pickers";
import { Segmented } from "@/components/segmented";
import { useSystem } from "@/components/system-header";
import { addExternalUserLink, addSystemUser } from "@/lib/api/external-systems";
import { errorIssues, errorMessage } from "@/lib/errors";

type Mode = "new" | "existing";

export default function NewSystemUserPage() {
  const systemId    = useParams<{ id: string }>().id;
  const router      = useRouter();
  const queryClient = useQueryClient();
  const systemName  = useSystem(systemId).data?.data.name;
  const usersPath   = `/external-systems/${systemId}/users`;

  const [mode, setMode] = useState<Mode>("new");

  // new user
  const [externalUserId, setExternalUserId] = useState("");
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [phone, setPhone]       = useState("");
  const [telegram, setTelegram] = useState("");

  // someone already under another system
  const [existingUserId, setExistingUserId] = useState("");

  const done = (userId: string) => {
    void queryClient.invalidateQueries({ queryKey: ["system-users", systemId] });
    void queryClient.invalidateQueries({ queryKey: ["external-system", systemId] });
    router.push(`${usersPath}/${userId}`);
  };

  const create = useMutation({
    mutationFn: () =>
      addSystemUser(systemId, {
        external_user_id: externalUserId,
        name:             name || null,
        email:            email || null,
        phone:            phone || null,
        telegram_chat_id: telegram || null,
      }),
    meta:      { success: "User added", inline: true },
    onSuccess: (response) => done(response.data.id),
  });

  const link = useMutation({
    mutationFn: () => addExternalUserLink(systemId, { user_id: existingUserId, external_user_id: externalUserId.trim() }),
    meta:       { success: "User added to this system", inline: true },
    onSuccess:  () => done(existingUserId),
  });

  const mutation = mode === "new" ? create : link;
  const issues   = mutation.isError ? errorIssues(mutation.error) : [];
  const canSave  = externalUserId.trim() !== "" && (mode === "new" || existingUserId !== "");

  return (
    <div>
      <PageHeader
        back={{ href: usersPath, label: systemName ? `${systemName} users` : "Users" }}
        title="Add a user"
        description={systemName ? <>A person <b className="font-medium text-foreground">{systemName}</b> sends notifications to.</> : undefined}
      />
      <Card>
        <form
          className="flex max-w-xl flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSave) mutation.mutate();
          }}
        >
          <Segmented<Mode>
            label="Who"
            value={mode}
            onChange={(next) => { setMode(next); create.reset(); link.reset(); }}
            options={[
              { value: "new",      label: "New person" },
              { value: "existing", label: "Already under another system" },
            ]}
          />

          {mutation.isError && (
            <div className="text-sm text-destructive" role="alert">
              <p>{errorMessage(mutation.error, "Could not add the user.")}</p>
              {issues.length > 1 && <ul className="mt-1 list-disc pl-5">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
            </div>
          )}

          {mode === "existing" && (
            <UserPicker
              value={existingUserId}
              onChange={(id) => setExistingUserId(id)}
              hint="The same person keeps one set of contacts across your systems."
            />
          )}

          <TextField
            label="Their id in this system"
            value={externalUserId}
            onChange={(event) => setExternalUserId(event.target.value)}
            placeholder="cust_1042"
            hint="The user id your system already uses for them. Unique within this system."
            required
            autoFocus
          />

          {mode === "new" && (
            <>
              <TextField
                label="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Dara Sok"
                hint="Optional. Without one the dashboard shows their email or id."
              />
              <fieldset className="flex flex-col gap-4 rounded-lg border p-4">
                <legend className="px-1 text-sm font-medium">Contacts <span className="font-normal text-muted-foreground">(optional, add more later)</span></legend>
                <TextField label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="dara@example.com" />
                <TextField label="Phone (SMS)" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+33612345678" hint="International format." />
                <TextField label="Telegram chat id" inputMode="numeric" value={telegram} onChange={(event) => setTelegram(event.target.value)} placeholder="123456789" hint="The chat id your bot gets when they start it." />
              </fieldset>
            </>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={mutation.isPending || !canSave}>
              {mutation.isPending ? "Adding…" : "Add user"}
            </Button>
            <LinkButton href={usersPath} variant="outline">Cancel</LinkButton>
          </div>
        </form>
      </Card>
    </div>
  );
}
