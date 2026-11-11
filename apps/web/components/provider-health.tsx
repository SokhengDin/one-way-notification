"use client";

import type { ChannelProviderRecord, ProviderTestResult } from "@repo/schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Send, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { resetChannelProviderHealth, testChannelProvider } from "@/lib/api/providers";
import { errorMessage } from "@/lib/errors";
import { formatDateTime, formatMs, timeAgo } from "@/lib/format";
import { Button, LinkButton } from "./button";
import { Card } from "./card";
import { TextField } from "./form-field";

type Health = "healthy" | "cooling" | "failing" | "unused" | "inactive";

export function providerHealth(provider: ChannelProviderRecord, now = Date.now()): Health {
  if (provider.is_active === false) return "inactive";
  if (provider.cooldown_until && new Date(provider.cooldown_until).getTime() > now) return "cooling";
  if (provider.consecutive_failures > 0) return "failing";
  if (!provider.last_success_at) return "unused";
  return "healthy";
}

const HEALTH: Record<Health, { label: string; className: string }> = {
  healthy:  { label: "Healthy",      className: "bg-success/15 text-success" },
  cooling:  { label: "Cooling down", className: "bg-destructive/10 text-destructive" },
  failing:  { label: "Failing",      className: "bg-warning/20 text-warning-foreground" },
  unused:   { label: "No sends yet", className: "bg-muted text-muted-foreground" },
  inactive: { label: "Inactive",     className: "bg-muted text-muted-foreground" },
};

export function HealthBadge({ provider }: { provider: ChannelProviderRecord }) {
  const health = providerHealth(provider);
  const title =
    health === "cooling" ? `${provider.consecutive_failures} failures in a row; tried after healthy providers until ${formatDateTime(provider.cooldown_until)}`
    : health === "failing" ? `${provider.consecutive_failures} failure${provider.consecutive_failures === 1 ? "" : "s"} in a row: ${provider.last_error ?? ""}`
    : health === "healthy" ? `Last success ${timeAgo(provider.last_success_at)}`
    : undefined;
  return (
    <Badge variant="outline" className={cn("gap-1.5 border-transparent", HEALTH[health].className)} title={title}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {HEALTH[health].label}
      {(health === "failing" || health === "cooling") && <span className="tabular-nums">· {provider.consecutive_failures}</span>}
    </Badge>
  );
}

const RECIPIENT_HINT = {
  email:    { label: "Send a test email to",    placeholder: "you@yourdomain.com" },
  sms:      { label: "Send a test SMS to",      placeholder: "+33612345678" },
  telegram: { label: "Send a test message to",  placeholder: "Chat id, e.g. 123456789" },
} as const;

/** Health at a glance, the circuit-breaker reset, and a real test send. */
export function ProviderHealthCard({ provider }: { provider: ChannelProviderRecord }) {
  const queryClient = useQueryClient();
  const [to, setTo]         = useState("");
  const [result, setResult] = useState<ProviderTestResult | null>(null);
  const health = providerHealth(provider);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["channel-provider", provider.id] });
    void queryClient.invalidateQueries({ queryKey: ["channel-providers"] });
  };

  const reset = useMutation({
    mutationFn: () => resetChannelProviderHealth(provider.id),
    onSuccess:  () => {
      toast.success("Health reset. It's tried in priority order again.");
      refresh();
    },
    onError: (error) => toast.error("Could not reset", { description: errorMessage(error, "Please try again.") }),
  });

  const test = useMutation({
    mutationFn: () => testChannelProvider(provider.id, { to: to.trim() }),
    onSuccess:  (response) => setResult(response.data),
    onError:    (error) => {
      setResult(null);
      toast.error("Could not send the test", { description: errorMessage(error, "Please try again.") });
    },
  });

  const hint = RECIPIENT_HINT[provider.channel];

  return (
    <Card
      title="Health and testing"
      actions={<LinkButton variant="outline" href={`/deliveries?provider=${provider.id}`}>View deliveries</LinkButton>}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <HealthBadge provider={provider} />
            {(health === "cooling" || health === "failing") && (
              <Button type="button" variant="ghost" size="sm" disabled={reset.isPending} onClick={() => reset.mutate()}>
                {reset.isPending ? "Resetting…" : "Reset health"}
              </Button>
            )}
          </div>
          <dl className="grid grid-cols-[9rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">Last success</dt>
            <dd title={formatDateTime(provider.last_success_at)}>{provider.last_success_at ? timeAgo(provider.last_success_at) : "never"}</dd>
            <dt className="text-muted-foreground">Last failure</dt>
            <dd title={formatDateTime(provider.last_failure_at)}>{provider.last_failure_at ? timeAgo(provider.last_failure_at) : "never"}</dd>
            <dt className="text-muted-foreground">Failures in a row</dt>
            <dd className="tabular-nums">{provider.consecutive_failures}</dd>
            {health === "cooling" && (
              <>
                <dt className="text-muted-foreground">Cooling down until</dt>
                <dd>{formatDateTime(provider.cooldown_until)}</dd>
              </>
            )}
          </dl>
          {provider.last_error && provider.consecutive_failures > 0 && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 font-mono text-xs break-words text-destructive">
              {provider.last_error}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            After 3 transient failures in a row (timeouts, 5xx, rate limits, rejected credentials) a provider cools down:
            it is tried only after the healthy providers of this channel, for 30 s doubling up to 15 min. One success clears it.
          </p>
        </div>

        <form
          className="flex flex-col gap-3 lg:border-l lg:pl-6"
          onSubmit={(event) => {
            event.preventDefault();
            test.mutate();
          }}
        >
          <TextField
            label={hint.label}
            value={to}
            onChange={(event) => setTo(event.target.value)}
            placeholder={hint.placeholder}
            hint="Sends a real message through this provider with the saved settings. It doesn't go through the queue."
          />
          <div>
            <Button type="submit" variant="secondary" disabled={!to.trim() || test.isPending}>
              <Send className="size-3.5" />
              {test.isPending ? "Sending…" : "Send test"}
            </Button>
          </div>
          {result && (
            <div
              role="status"
              className={cn(
                "flex gap-2 rounded-lg border p-3 text-sm",
                result.ok ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5",
              )}
            >
              {result.ok ? <CheckCircle2 className="size-4 shrink-0 text-success" /> : <XCircle className="size-4 shrink-0 text-destructive" />}
              <div className="flex min-w-0 flex-col gap-1">
                <span className="font-medium">
                  {result.ok ? `Accepted for ${result.recipient}` : `Failed${result.retryable ? " (temporary)" : ""}`}
                </span>
                {result.error && <span className="font-mono text-xs break-words text-destructive">{result.error}</span>}
                <span className="text-xs text-muted-foreground">
                  {[
                    result.status_code !== null ? `status ${result.status_code}` : null,
                    formatMs(result.duration_ms),
                    result.provider_ref_id ? `ref ${result.provider_ref_id}` : null,
                  ].filter(Boolean).join(" · ")}
                </span>
              </div>
            </div>
          )}
        </form>
      </div>
    </Card>
  );
}
