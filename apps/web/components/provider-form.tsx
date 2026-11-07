"use client";

import { KeyRound, ShieldCheck } from "lucide-react";
import { useState } from "react";
import {
  CHANNEL_TYPES,
  providerKindSpec,
  providerKindsFor,
  senderDomain,
  validateProviderConfig,
  type ChannelProviderRecord,
  type ChannelType,
  type ProviderConfigValue,
  type ProviderField,
  type ProviderKindSpec,
} from "@repo/schema";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Card } from "./card";
import { CheckboxField, SelectField, TextField } from "./form-field";

const CHANNEL_LABEL: Record<ChannelType, string> = { email: "Email", sms: "SMS", telegram: "Telegram" };

// ---------- form state ----------

export interface ProviderFormValues {
  readonly channel:  ChannelType;
  readonly kind:     string;
  readonly name:     string;
  readonly priority: string;
  readonly isActive: boolean;
  /** every non-secret field, as typed */
  readonly config:   Readonly<Record<string, string>>;
  /** newly typed secret values; blank = keep the stored one */
  readonly secrets:  Readonly<Record<string, string>>;
  /** stored secrets the user chose to remove */
  readonly cleared:  ReadonlyArray<string>;
}

export interface ProviderFormSubmit {
  readonly name:     string;
  readonly priority: number;
  readonly isActive: boolean;
  readonly channel:  ChannelType;
  readonly kind:     string;
  readonly config:   Record<string, ProviderConfigValue>;
  /** string sets, null clears; absent keys are left alone */
  readonly secrets:  Record<string, string | null>;
}

function defaultsFor(spec: ProviderKindSpec | undefined): Record<string, string> {
  const config: Record<string, string> = {};
  for (const field of spec?.fields ?? []) {
    if (!field.secret) config[field.key] = field.default === undefined ? "" : String(field.default);
  }
  return config;
}

export function emptyProviderForm(channel: ChannelType = "email"): ProviderFormValues {
  const kind = providerKindsFor(channel)[0]!.kind;
  return {
    channel,
    kind,
    name:     "",
    priority: "100",
    isActive: true,
    config:   defaultsFor(providerKindSpec(kind)),
    secrets:  {},
    cleared:  [],
  };
}

export function providerFormFrom(provider: ChannelProviderRecord): ProviderFormValues {
  const spec   = provider.kind ? providerKindSpec(provider.kind) : undefined;
  const config = defaultsFor(spec);
  for (const [key, value] of Object.entries(provider.config)) config[key] = String(value);
  return {
    channel:  provider.channel,
    kind:     provider.kind ?? "",
    name:     provider.name,
    priority: String(provider.priority),
    isActive: provider.is_active ?? true,
    config,
    secrets:  {},
    cleared:  [],
  };
}

/** Typed config + secret changes from the form, ready for the API. */
function toSubmit(spec: ProviderKindSpec, values: ProviderFormValues): ProviderFormSubmit {
  const config: Record<string, ProviderConfigValue> = {};
  for (const field of spec.fields) {
    if (field.secret) continue;
    const raw = (values.config[field.key] ?? "").trim();
    if (raw === "") continue;
    config[field.key] = field.type === "number" && /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
  }
  const secrets: Record<string, string | null> = {};
  for (const key of values.cleared) secrets[key] = null;
  for (const [key, value] of Object.entries(values.secrets)) {
    if (value.trim() !== "") secrets[key] = value;
  }
  return {
    name:     values.name.trim(),
    priority: Number(values.priority),
    isActive: values.isActive,
    channel:  values.channel,
    kind:     spec.kind,
    config,
    secrets,
  };
}

// ---------- component ----------

interface ProviderFormProps {
  /** null when creating */
  readonly existing:    ChannelProviderRecord | null;
  readonly initial:     ProviderFormValues;
  readonly isPending:   boolean;
  readonly serverError: { readonly message: string; readonly issues: ReadonlyArray<string> } | null;
  readonly submitLabel: string;
  readonly onSubmit:    (values: ProviderFormSubmit) => void;
}

export function ProviderForm({ existing, initial, isPending, serverError, submitLabel, onSubmit }: ProviderFormProps) {
  const [values, setValues]       = useState(initial);
  const [clientIssues, setIssues] = useState<ReadonlyArray<string>>([]);

  const spec       = providerKindSpec(values.kind);
  const storedKeys = existing?.secret_keys ?? [];
  const isNew      = existing === null;

  const set = (patch: Partial<ProviderFormValues>) => setValues((current) => ({ ...current, ...patch }));

  const chooseChannel = (channel: ChannelType) => {
    const kind = providerKindsFor(channel)[0]!.kind;
    set({ channel, kind, config: defaultsFor(providerKindSpec(kind)), secrets: {}, cleared: [] });
  };

  const chooseKind = (kind: string) =>
    set({ kind, config: defaultsFor(providerKindSpec(kind)), secrets: {}, cleared: [] });

  // secrets set after save = stored − cleared + newly typed
  const secretKeysAfter = (submit: ProviderFormSubmit) => {
    const keys = new Set(storedKeys);
    for (const [key, value] of Object.entries(submit.secrets)) {
      if (value === null) keys.delete(key);
      else keys.add(key);
    }
    return [...keys];
  };

  const issues = [...clientIssues, ...(serverError?.issues ?? [])];
  const issueFor = (key: string) => issues.find((issue) => issue.startsWith(`${key}: `))?.slice(key.length + 2);

  // "from_email: must be…" → "From email: must be…" for the summary
  const labelled = (issue: string) => {
    const colon = issue.indexOf(": ");
    if (colon === -1) return issue;
    const key   = issue.slice(0, colon);
    const label = key === "name" ? "Name" : key === "priority" ? "Priority" : spec?.fields.find((field) => field.key === key)?.label;
    return label ? `${label}: ${issue.slice(colon + 2)}` : issue;
  };

  if (!spec) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">
          This provider was created before provider configuration existed, so it has no settings to edit.
          Create a new provider to configure one.
        </p>
      </Card>
    );
  }

  const domain = spec.channel === "email" ? senderDomain(values.config) : null;

  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const submit   = toSubmit(spec, values);
        const problems = [
          ...(submit.name === "" ? ["name: must not be empty"] : []),
          ...(Number.isInteger(submit.priority) && submit.priority >= 0 && submit.priority <= 1000
            ? []
            : ["priority: must be a whole number between 0 and 1000"]),
          ...validateProviderConfig(spec, submit.config, secretKeysAfter(submit)),
        ];
        setIssues(problems);
        if (problems.length === 0) onSubmit(submit);
      }}
    >
      {isNew && (
        <Card title="Provider">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <Label>Channel</Label>
              <div className="flex gap-1" role="radiogroup" aria-label="Channel">
                {CHANNEL_TYPES.map((channel) => (
                  <button
                    key={channel}
                    type="button"
                    role="radio"
                    aria-checked={values.channel === channel}
                    onClick={() => chooseChannel(channel)}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-sm",
                      values.channel === channel
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-background hover:bg-muted",
                    )}
                  >
                    {CHANNEL_LABEL[channel]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Service</Label>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="Service">
                {providerKindsFor(values.channel).map((kind) => (
                  <button
                    key={kind.kind}
                    type="button"
                    role="radio"
                    aria-checked={values.kind === kind.kind}
                    onClick={() => chooseKind(kind.kind)}
                    className={cn(
                      "flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left",
                      values.kind === kind.kind ? "border-primary ring-2 ring-primary/30" : "hover:bg-muted",
                    )}
                  >
                    <span className="text-sm font-medium">{kind.label}</span>
                    <span className="text-xs text-muted-foreground">{kind.description}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card title={`${spec.label} settings`}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <TextField
              label="Name"
              value={values.name}
              onChange={(event) => set({ name: event.target.value })}
              placeholder={`e.g. ${spec.label} — production`}
              error={issueFor("name")}
              hint="Shown in the dashboard and statistics."
            />
          </div>

          {spec.fields.map((field) =>
            field.secret ? (
              <SecretInput
                key={field.key}
                field={field}
                stored={storedKeys.includes(field.key) && !values.cleared.includes(field.key)}
                value={values.secrets[field.key] ?? ""}
                error={issueFor(field.key)}
                onChange={(value) => set({ secrets: { ...values.secrets, [field.key]: value } })}
                onClear={() => set({ cleared: [...values.cleared, field.key], secrets: { ...values.secrets, [field.key]: "" } })}
                onUndoClear={() => set({ cleared: values.cleared.filter((key) => key !== field.key) })}
                wasStored={storedKeys.includes(field.key)}
              />
            ) : field.type === "select" ? (
              <SelectField
                key={field.key}
                label={field.label}
                value={values.config[field.key] ?? ""}
                onValueChange={(value) => set({ config: { ...values.config, [field.key]: value } })}
                options={(field.options ?? []).map((option) => ({ value: option, label: option }))}
                hint={field.hint}
                error={issueFor(field.key)}
              />
            ) : (
              <TextField
                key={field.key}
                label={`${field.label}${field.required ? "" : " (optional)"}`}
                id={`provider-${field.key}`}
                type={field.type === "number" ? "number" : field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"}
                inputMode={field.type === "number" ? "numeric" : undefined}
                min={field.min}
                max={field.max}
                value={values.config[field.key] ?? ""}
                onChange={(event) => set({ config: { ...values.config, [field.key]: event.target.value } })}
                placeholder={field.placeholder}
                hint={field.hint}
                error={issueFor(field.key)}
                autoComplete="off"
              />
            ),
          )}

          <TextField
            label="Priority"
            type="number"
            min={0}
            max={1000}
            value={values.priority}
            onChange={(event) => set({ priority: event.target.value })}
            hint="Lower is tried first when a channel has several active providers."
            error={issueFor("priority")}
          />
          <div className="flex items-end pb-2">
            <CheckboxField label="Active" checked={values.isActive} onCheckedChange={(isActive) => set({ isActive })} />
          </div>
        </div>
      </Card>

      {domain && <DnsGuidance domain={domain} kind={spec} />}

      {(serverError || clientIssues.length > 0) && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert" data-testid="provider-error">
          <p className="font-medium">
            {issues.length === 1
              ? labelled(issues[0]!)
              : issues.length > 1
                ? `Fix the ${issues.length} highlighted settings.`
                : serverError?.message}
          </p>
          {issues.length > 1 && (
            <ul className="mt-1 list-disc pl-5">
              {issues.map((issue) => <li key={issue}>{labelled(issue)}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : submitLabel}
        </Button>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" />
          Credentials are encrypted on the server and never shown again.
        </span>
      </div>
    </form>
  );
}

function SecretInput({
  field,
  stored,
  wasStored,
  value,
  error,
  onChange,
  onClear,
  onUndoClear,
}: {
  readonly field:       ProviderField;
  readonly stored:      boolean;
  readonly wasStored:   boolean;
  readonly value:       string;
  readonly error?:      string;
  readonly onChange:    (value: string) => void;
  readonly onClear:     () => void;
  readonly onUndoClear: () => void;
}) {
  const id = `provider-${field.key}`;
  const removed = wasStored && !stored;

  return (
    <div className="flex flex-col gap-1.5" data-testid={`secret-${field.key}`}>
      <div className="flex items-center gap-2">
        <Label htmlFor={id}>
          {field.label}
          {field.required ? "" : " (optional)"}
        </Label>
        {stored && (
          <Badge variant="outline" className="gap-1 border-transparent bg-success/15 text-success">
            <KeyRound className="size-3" /> Saved
          </Badge>
        )}
        {removed && (
          <Badge variant="outline" className="border-transparent bg-destructive/10 text-destructive">
            Will be removed
          </Badge>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          id={id}
          type="password"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={stored ? "Leave blank to keep the saved value" : field.placeholder}
          autoComplete="new-password"
          aria-invalid={!!error}
          disabled={removed}
        />
        {stored && !field.required && (
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>Remove</Button>
        )}
        {removed && (
          <Button type="button" variant="ghost" size="sm" onClick={onUndoClear}>Undo</Button>
        )}
      </div>
      {field.hint && !error && <p className="text-xs text-muted-foreground">{field.hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function DnsGuidance({ domain, kind }: { readonly domain: string; readonly kind: ProviderKindSpec }) {
  const rows = [
    {
      type:    "SPF",
      host:    domain,
      record:  "TXT",
      value:   kind.kind === "smtp" ? "v=spf1 include:<your mail server> ~all" : `v=spf1 include:<${kind.label} SPF> ~all`,
      purpose: "Authorises the sending servers. Merge into your existing SPF record — a domain may have only one.",
    },
    {
      type:    "DKIM",
      host:    `<selector>._domainkey.${domain}`,
      record:  "TXT / CNAME",
      value:   kind.kind === "smtp" ? "Public key from your mail server" : `Records shown in ${kind.label}'s domain verification`,
      purpose: "Signs messages so receivers can verify they weren't altered.",
    },
    {
      type:    "DMARC",
      host:    `_dmarc.${domain}`,
      record:  "TXT",
      value:   `v=DMARC1; p=none; rua=mailto:dmarc@${domain}`,
      purpose: "Start with p=none to monitor, then move to quarantine or reject.",
    },
  ];

  return (
    <Card title={`DNS for ${domain}`}>
      <p className="mb-3 text-sm text-muted-foreground">
        To land in inboxes rather than spam, {domain} needs these records. Exact SPF and DKIM values come from{" "}
        {kind.kind === "smtp" ? "your mail server or hosting provider" : `${kind.label}`}.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1.5 pr-4 font-medium">Record</th>
              <th className="py-1.5 pr-4 font-medium">Host</th>
              <th className="py-1.5 pr-4 font-medium">Type</th>
              <th className="py-1.5 pr-4 font-medium">Value</th>
              <th className="py-1.5 font-medium">Why</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.type} className="border-t align-top">
                <td className="py-2 pr-4 font-medium">{row.type}</td>
                <td className="py-2 pr-4 font-mono text-xs">{row.host}</td>
                <td className="py-2 pr-4 text-xs">{row.record}</td>
                <td className="py-2 pr-4 font-mono text-xs">{row.value}</td>
                <td className="py-2 text-xs text-muted-foreground">{row.purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
