"use client";

import {
  API_KEY_DEFAULT_DAYS,
  API_KEY_MAX_ACTIVE,
  API_KEY_MAX_DAYS,
  type ApiKeyRecord,
  type IssuedApiKey,
} from "@repo/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound, Plus, RefreshCw, ShieldAlert, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { issueApiKey, listApiKeys, revokeApiKey, rollApiKey } from "@/lib/api/api-keys";
import { errorMessage } from "@/lib/errors";
import { formatDateTime, timeAgo } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Card } from "./card";
import { ConfirmButton } from "./confirm-button";
import { DataTable } from "./data-table";
import { SelectField, TextField } from "./form-field";

const DAY_MS        = 86_400_000;
const WARN_DAYS     = 14;
const CUSTOM        = "custom";

const EXPIRY_OPTIONS = [
  { value: "30",   label: "30 days" },
  { value: "90",   label: "90 days (recommended)" },
  { value: "180",  label: "6 months" },
  { value: "365",  label: "1 year" },
  { value: "730",  label: "2 years (maximum)" },
  { value: CUSTOM, label: "Pick a date…" },
] as const;

const GRACE_OPTIONS = [
  { value: "0",   label: "Stop immediately" },
  { value: "1",   label: "Keep working 1 hour" },
  { value: "24",  label: "Keep working 24 hours (recommended)" },
  { value: "168", label: "Keep working 7 days" },
] as const;

const toDateInput = (date: Date) => date.toISOString().slice(0, 10);

/** Expiry picker: presets or a date, always within 1 day … 2 years. */
function useExpiry() {
  const now = useNow(60_000);
  const [choice, setChoice] = useState<string>(String(API_KEY_DEFAULT_DAYS));
  const [date, setDate]     = useState(() => toDateInput(new Date(Date.now() + API_KEY_DEFAULT_DAYS * DAY_MS)));
  const days = choice === CUSTOM
    ? Math.ceil((new Date(`${date}T23:59:59`).getTime() - now) / DAY_MS)
    : Number(choice);
  const valid = Number.isInteger(days) && days >= 1 && days <= API_KEY_MAX_DAYS;
  const field = (
    <div className="flex flex-col gap-3">
      <SelectField label="Expires after" options={EXPIRY_OPTIONS} value={choice} onValueChange={setChoice} />
      {choice === CUSTOM && (
        <TextField
          label="Expiry date"
          type="date"
          value={date}
          min={toDateInput(new Date(now + DAY_MS))}
          max={toDateInput(new Date(now + API_KEY_MAX_DAYS * DAY_MS))}
          onChange={(event) => setDate(event.target.value)}
          error={valid ? undefined : `Pick a date between tomorrow and ${API_KEY_MAX_DAYS / 365} years from now.`}
        />
      )}
      {valid && (
        <p className="text-xs text-muted-foreground">
          Stops working on <span className="font-medium text-foreground">{new Date(now + days * DAY_MS).toLocaleDateString()}</span>.
          Roll it before then: the dashboard warns {WARN_DAYS} days ahead.
        </p>
      )}
    </div>
  );
  return { days, valid, field };
}

// ------------------------------------------------------------------ status

function KeyStatus({ apiKey, now }: { apiKey: ApiKeyRecord; now: number }) {
  if (apiKey.status === "revoked") {
    return <Badge variant="outline" className="border-transparent bg-zinc-100 text-zinc-500 line-through decoration-1 dark:bg-zinc-800">Revoked</Badge>;
  }
  if (apiKey.status === "expired") {
    return <Badge variant="outline" className="border-transparent bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300">Expired</Badge>;
  }
  if (apiKey.legacy) {
    return (
      <Badge variant="outline" className="gap-1 border-transparent bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300" title="Moved from the old plaintext key: it never expires. Roll it to a new key.">
        <TriangleAlert className="size-3" /> No expiry · roll it
      </Badge>
    );
  }
  const left = apiKey.expires_at ? Math.ceil((new Date(apiKey.expires_at).getTime() - now) / DAY_MS) : null;
  if (left !== null && left <= WARN_DAYS) {
    return (
      <Badge variant="outline" className="gap-1 border-transparent bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300" title={formatDateTime(apiKey.expires_at)}>
        <TriangleAlert className="size-3" /> {left <= 1 ? "Expires within a day" : `Expires in ${left} days`}
      </Badge>
    );
  }
  return <Badge variant="outline" className="border-transparent bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Active</Badge>;
}

// ------------------------------------------------------------------ the one-time reveal

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      onClick={() => void navigator.clipboard?.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })}
    >
      {copied ? <Check className="text-emerald-600" /> : <Copy />}
      {copied ? "Copied" : label}
    </Button>
  );
}

/** Shows the secret exactly once. It can't be dismissed until the admin says it's stored. */
function RevealKey({ issued, onDone }: { issued: IssuedApiKey | null; onDone: () => void }) {
  const [stored, setStored] = useState(false);
  const close = () => { setStored(false); onDone(); };
  const curl = issued
    ? `curl -X POST "$NOTIFY_API_URL/api/notification" \\
  -H "X-Api-Key: ${issued.secret}" \\
  -H "Content-Type: application/json" \\
  -d '{"external_system_id":"${issued.key.external_system_id}","user_id":"…","event_type":"…","payload":{}}'`
    : "";

  return (
    <Dialog open={issued !== null} onOpenChange={(open) => { if (!open && stored) close(); }}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-blue-700" /> Copy your new API key
          </DialogTitle>
          <DialogDescription>
            This is the only time it is shown. Only a hash is stored, so it can&apos;t be recovered later:
            if you lose it, roll the key.
          </DialogDescription>
        </DialogHeader>
        {issued && (
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
              <code
                className="min-w-0 flex-1 rounded-lg border bg-zinc-50 px-3 py-2 font-mono text-xs break-all select-all dark:bg-zinc-950"
                data-testid="issued-api-key"
              >
                {issued.secret}
              </code>
              <CopyButton text={issued.secret} />
            </div>
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200 ring-inset dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-900">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              Keep it in your system&apos;s secret store (environment variable, vault), never in code or a repository.
              Expires {issued.key.expires_at ? formatDateTime(issued.key.expires_at) : "never"}.
            </p>
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none hover:text-foreground">How to send with it</summary>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-100">{curl}</pre>
            </details>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={stored} onCheckedChange={(value) => setStored(value === true)} />
              I&apos;ve stored this key somewhere safe
            </label>
          </div>
        )}
        <DialogFooter>
          <Button type="button" disabled={!stored} onClick={close}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ issue and roll

function IssueDialog({ systemId, open, onOpenChange, onIssued }: {
  systemId: string; open: boolean; onOpenChange: (open: boolean) => void; onIssued: (issued: IssuedApiKey) => void;
}) {
  const [name, setName] = useState("Production");
  const expiry = useExpiry();
  const mutation = useMutation({
    mutationFn: () => issueApiKey(systemId, { name: name.trim(), expires_in_days: expiry.days }),
    meta:       { inline: true },
    onSuccess:  (response) => { onOpenChange(false); onIssued(response.data); },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!mutation.isPending) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Issue an API key</DialogTitle>
          <DialogDescription>A new random key for this system to send with. You&apos;ll see it once.</DialogDescription>
        </DialogHeader>
        <form
          id="issue-api-key"
          className="flex flex-col gap-4"
          onSubmit={(event) => { event.preventDefault(); if (expiry.valid && name.trim()) mutation.mutate(); }}
        >
          {mutation.isError && <p className="text-sm text-destructive" role="alert">{errorMessage(mutation.error, "Could not issue the key.")}</p>}
          <TextField
            label="Name"
            value={name}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            hint="Where it's used, e.g. Production, Staging, Billing worker."
            required
            autoFocus
          />
          {expiry.field}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancel</Button>
          <Button type="submit" form="issue-api-key" disabled={mutation.isPending || !expiry.valid || !name.trim()}>
            {mutation.isPending ? "Issuing…" : "Issue key"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RollButton({ apiKey, onIssued }: { apiKey: ApiKeyRecord; onIssued: (issued: IssuedApiKey) => void }) {
  const [open, setOpen]   = useState(false);
  const [grace, setGrace] = useState("24");
  const expiry = useExpiry();
  const mutation = useMutation({
    mutationFn: () => rollApiKey(apiKey.id, { grace_hours: Number(grace), expires_in_days: expiry.days }),
    meta:       { inline: true },
    onSuccess:  (response) => { setOpen(false); onIssued(response.data); },
  });

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)} title="Replace with a new key">
        <RefreshCw /> Roll
      </Button>
      <Dialog open={open} onOpenChange={(next) => { if (!mutation.isPending) setOpen(next); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Roll “{apiKey.name}”</DialogTitle>
            <DialogDescription>
              Issues a replacement with the same name. Give the old key a grace period so you can deploy the new one first.
            </DialogDescription>
          </DialogHeader>
          <form
            id={`roll-${apiKey.id}`}
            className="flex flex-col gap-4"
            onSubmit={(event) => { event.preventDefault(); if (expiry.valid) mutation.mutate(); }}
          >
            {mutation.isError && <p className="text-sm text-destructive" role="alert">{errorMessage(mutation.error, "Could not roll the key.")}</p>}
            <SelectField label="The old key" options={GRACE_OPTIONS} value={grace} onValueChange={setGrace} />
            {expiry.field}
          </form>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>Cancel</Button>
            <Button type="submit" form={`roll-${apiKey.id}`} disabled={mutation.isPending || !expiry.valid}>
              {mutation.isPending ? "Rolling…" : "Roll key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ------------------------------------------------------------------ the card

export function ApiKeysCard({ systemId, issueOnOpen = false }: { systemId: string; issueOnOpen?: boolean }) {
  const queryClient = useQueryClient();
  const now = useNow(60_000);
  const [showInactive, setShowInactive] = useState(false);
  const [issueOpen, setIssueOpen]       = useState(issueOnOpen);
  // a fresh form every time the dialog opens
  const [issueRound, setIssueRound]     = useState(0);
  const openIssue = () => { setIssueRound((round) => round + 1); setIssueOpen(true); };
  const [issued, setIssued]             = useState<IssuedApiKey | null>(null);

  const query = useQuery({
    queryKey: ["api-keys", systemId, showInactive],
    queryFn:  () => listApiKeys(systemId, showInactive),
  });
  const keys   = query.data?.data ?? [];
  const active = keys.filter((key) => key.status === "active").length;
  const atLimit = active >= API_KEY_MAX_ACTIVE;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["api-keys", systemId] });
    void queryClient.invalidateQueries({ queryKey: ["external-system", systemId] });
    void queryClient.invalidateQueries({ queryKey: ["external-systems"] });
  };
  const onIssued = (next: IssuedApiKey) => { setIssued(next); refresh(); };

  const revoke = useMutation({
    mutationFn: (id: string) => revokeApiKey(id),
    meta:       { success: "API key revoked: it stops working now", error: "Could not revoke the key" },
    onSuccess:  refresh,
  });

  return (
    <Card
      title="API keys"
      actions={
        <Button type="button" onClick={openIssue} disabled={atLimit} title={atLimit ? `At most ${API_KEY_MAX_ACTIVE} working keys` : undefined}>
          <Plus /> Issue key
        </Button>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">
        This system sends with <code className="rounded bg-muted px-1 font-mono text-xs">X-Api-Key</code>.
        Keys are shown once, stored only as a hash, and always expire. Revoking takes effect immediately.
      </p>
      {keys.some((key) => key.legacy && key.status === "active") && (
        <p className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200 ring-inset dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-900" role="status">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            This system still uses a key from before keys were issued here. It never expires.
            <b className="font-medium"> Roll it</b>, deploy the new key, and the old one stops after the grace period.
          </span>
        </p>
      )}
      <DataTable
        columns={[
          { header: "Name", cell: (key) => <span className="font-medium">{key.name}</span> },
          {
            header: "Key",
            cell: (key) => (
              <span className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                {key.legacy ? "legacy" : key.prefix}_…{key.last_four}
              </span>
            ),
          },
          { header: "Status", cell: (key) => <KeyStatus apiKey={key} now={now} /> },
          {
            header: "Expires",
            className: "whitespace-nowrap text-muted-foreground",
            cell: (key) => (key.expires_at ? <span title={formatDateTime(key.expires_at)}>{new Date(key.expires_at).toLocaleDateString()}</span> : "Never"),
          },
          {
            header: "Last used",
            className: "whitespace-nowrap text-muted-foreground",
            cell: (key) => (
              key.last_used_at
                ? <span title={`${formatDateTime(key.last_used_at)}${key.last_used_ip ? ` from ${key.last_used_ip}` : ""}`}>{timeAgo(key.last_used_at, now)}</span>
                : "Never"
            ),
          },
          {
            header: "Created",
            className: "whitespace-nowrap text-muted-foreground",
            cell: (key) => (
              <span title={formatDateTime(key.created_at)}>
                {timeAgo(key.created_at, now)}{key.created_by_name ? ` by ${key.created_by_name}` : ""}
              </span>
            ),
          },
          {
            header: "",
            className: "text-right",
            cell: (key) =>
              key.status === "active" ? (
                <div className={cn("flex justify-end gap-1", revoke.isPending && revoke.variables === key.id && "opacity-60")}>
                  <RollButton apiKey={key} onIssued={onIssued} />
                  <ConfirmButton
                    label="Revoke"
                    variant="ghost"
                    size="sm"
                    title={`Revoke “${key.name}”?`}
                    description="It stops working immediately: requests sent with it are refused from now on. This can't be undone."
                    confirmLabel="Revoke key"
                    pendingLabel="Revoking…"
                    isPending={revoke.isPending && revoke.variables === key.id}
                    onConfirm={() => revoke.mutate(key.id)}
                  />
                </div>
              ) : key.revoked_at ? (
                <span className="text-xs whitespace-nowrap text-muted-foreground" title={formatDateTime(key.revoked_at)}>
                  {timeAgo(key.revoked_at, now)}{key.revoked_by_name ? ` by ${key.revoked_by_name}` : ""}
                </span>
              ) : null,
          },
        ]}
        data={{ items: keys, total: keys.length, skip: 0, limit: Math.max(keys.length, 1) }}
        rowKey={(key) => key.id}
        isLoading={query.isLoading}
        error={query.error}
        emptyMessage={showInactive ? "No keys yet." : "No working keys. Issue one so this system can send."}
        emptyAction={!showInactive ? <Button type="button" variant="secondary" onClick={openIssue}><Plus /> Issue key</Button> : undefined}
      />
      <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground">
        <Checkbox checked={showInactive} onCheckedChange={(value) => setShowInactive(value === true)} />
        Show revoked and expired keys
      </label>

      <IssueDialog key={issueRound} systemId={systemId} open={issueOpen} onOpenChange={setIssueOpen} onIssued={onIssued} />
      <RevealKey issued={issued} onDone={() => setIssued(null)} />
    </Card>
  );
}
