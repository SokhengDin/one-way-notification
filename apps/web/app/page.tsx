"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { providerKindSpec, type ChannelType, type StatsOverview } from "@repo/schema";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Card } from "../components/card";
import {
  BarList,
  DAILY_SERIES,
  DailyVolumeChart,
  formatCost,
  formatCount,
  formatPercent,
  SeriesLegend,
  StackedBar,
  StatTile,
} from "../components/dashboard/charts";
import { Attention } from "../components/attention";
import { PageHeader } from "../components/page-header";
import { ChannelBadge } from "../components/status-badge";
import { getStatsOverview } from "../lib/api/stats";
import { errorMessage } from "../lib/errors";

const RANGES = [
  { days: 7,  label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
] as const;

const CHANNEL_LABEL: Record<ChannelType, string> = { email: "Email", sms: "SMS", telegram: "Telegram" };

const browserTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

const rate = (sent: number, failed: number) => (sent + failed === 0 ? null : sent / (sent + failed));

export default function OverviewPage() {
  const [days, setDays] = useState<number>(30);
  const [timezone]      = useState(browserTimezone);

  const statsQuery = useQuery({
    queryKey:        ["stats-overview", { days, timezone }],
    queryFn:         () => getStatsOverview({ days, timezone }),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

  const stats = statsQuery.data?.data;

  return (
    <div>
      <PageHeader title="Overview" description="Delivery activity across every channel, system and provider." />
      <Attention />

      {/* filters: one row, above everything they scope */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border bg-card p-0.5" role="radiogroup" aria-label="Date range">
          {RANGES.map((range) => (
            <button
              key={range.days}
              type="button"
              role="radio"
              aria-checked={days === range.days}
              onClick={() => setDays(range.days)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm",
                days === range.days ? "bg-muted font-semibold" : "text-muted-foreground hover:bg-muted/60",
              )}
            >
              {days === range.days && <Check className="size-4" strokeWidth={3} aria-hidden="true" />}
              {range.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">Days counted in {timezone}</span>
        {statsQuery.isFetching && stats && <span className="text-xs text-muted-foreground">Updating…</span>}
      </div>

      {statsQuery.isError && !stats && (
        <Card>
          <p className="text-sm text-destructive" role="alert">{errorMessage(statsQuery.error, "Could not load statistics.")}</p>
        </Card>
      )}

      {!stats && statsQuery.isLoading && <p className="text-sm text-muted-foreground">Loading statistics…</p>}

      {stats && (
        // refetch keeps the frame: previous numbers stay, slightly faded
        <div className={cn("flex flex-col gap-6 transition-opacity", statsQuery.isPlaceholderData && "opacity-60")}>
          <Totals stats={stats} />
          <DailyCard stats={stats} />
          <div className="grid gap-6 xl:grid-cols-2">
            <ChannelsCard stats={stats} />
            <InventoryCard stats={stats} />
          </div>
          <ProvidersCard stats={stats} />
          <div className="grid gap-6 xl:grid-cols-2">
            <Card title="Top event types">
              <BarList
                testId="event-types"
                rows={stats.event_types.map((row) => ({
                  key:   row.event_type,
                  label: row.event_type,
                  value: row.notifications,
                  note:  row.failed > 0 ? `${formatCount(row.failed)} failed` : undefined,
                }))}
              />
            </Card>
            <Card title="Top external systems">
              <BarList
                testId="systems"
                rows={stats.systems.map((row) => ({
                  key:   row.id,
                  label: row.name,
                  value: row.notifications,
                  note:  row.failed > 0 ? `${formatCount(row.failed)} failed` : undefined,
                }))}
              />
            </Card>
          </div>
          <FailuresCard stats={stats} />
        </div>
      )}
    </div>
  );
}

function Totals({ stats }: { readonly stats: StatsOverview }) {
  const { totals, previous } = stats;
  const inProgress = totals.pending + totals.retrying;
  const prevRate   = rate(previous.sent, previous.failed);

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6" data-testid="totals">
      <StatTile
        testId="tile-notifications"
        label="Notifications"
        value={formatCount(totals.notifications)}
        delta={{ current: totals.notifications, previous: previous.notifications, upIsGood: true }}
      />
      <StatTile
        testId="tile-deliveries"
        label="Deliveries"
        value={formatCount(totals.deliveries)}
        delta={{ current: totals.deliveries, previous: previous.deliveries, upIsGood: true }}
        sub={`${formatCount(inProgress)} in progress · ${formatCount(totals.skipped)} skipped`}
      />
      <StatTile
        testId="tile-sent"
        label="Sent"
        swatch="var(--viz-sent)"
        value={formatCount(totals.sent)}
        delta={{ current: totals.sent, previous: previous.sent, upIsGood: true }}
      />
      <StatTile
        testId="tile-failed"
        label="Failed"
        swatch="var(--viz-failed)"
        value={formatCount(totals.failed)}
        delta={{ current: totals.failed, previous: previous.failed, upIsGood: false }}
      />
      <StatTile
        testId="tile-success-rate"
        label="Success rate"
        value={formatPercent(totals.success_rate)}
        sub={
          prevRate === null || totals.success_rate === null
            ? "Sent ÷ (sent + failed)"
            : `${formatPercent(prevRate)} previous period`
        }
      />
      <StatTile
        testId="tile-cost"
        label="Provider cost"
        value={formatCost(totals.cost)}
        sub={totals.avg_attempts === null ? "As reported by providers" : `${totals.avg_attempts.toFixed(2)} attempts per delivery`}
      />
    </div>
  );
}

function DailyCard({ stats }: { readonly stats: StatsOverview }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <Card
      title="Deliveries per day"
      actions={
        <button
          type="button"
          onClick={() => setShowTable((value) => !value)}
          className="text-xs font-medium text-primary hover:underline"
          aria-expanded={showTable}
        >
          {showTable ? "Show chart" : "Show table"}
        </button>
      }
    >
      <div className="mb-3">
        <SeriesLegend series={DAILY_SERIES} />
      </div>
      {showTable ? (
        <div className="max-h-80 overflow-auto" data-testid="daily-table">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
              <tr>
                <th className="py-1.5 text-left font-medium">Date</th>
                <th className="py-1.5 text-right font-medium">Notifications</th>
                {DAILY_SERIES.map((series) => (
                  <th key={series.key} className="py-1.5 text-right font-medium">{series.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {[...stats.daily].reverse().map((day) => (
                <tr key={day.date} className="border-t">
                  <td className="py-1.5">{day.date}</td>
                  <td className="py-1.5 text-right">{formatCount(day.notifications)}</td>
                  {DAILY_SERIES.map((series) => (
                    <td key={series.key} className="py-1.5 text-right">{formatCount(day[series.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <DailyVolumeChart days={stats.daily} />
      )}
    </Card>
  );
}

function ChannelsCard({ stats }: { readonly stats: StatsOverview }) {
  const max = Math.max(0, ...stats.channels.map((channel) => channel.deliveries));
  return (
    <Card title="By channel">
      <div className="mb-3">
        <SeriesLegend series={DAILY_SERIES} />
      </div>
      <table className="w-full text-sm" data-testid="channels">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="py-1.5 text-left font-medium">Channel</th>
            <th className="w-1/2 py-1.5 font-medium" />
            <th className="py-1.5 text-right font-medium">Deliveries</th>
            <th className="py-1.5 text-right font-medium">Success</th>
          </tr>
        </thead>
        <tbody>
          {stats.channels.map((channel) => (
            <tr key={channel.channel} className="border-t" data-testid={`channel-${channel.channel}`}>
              <td className="py-2.5 pr-3">
                <span className="flex items-center gap-2">
                  <span className="size-2.5 rounded-sm" style={{ backgroundColor: `var(--viz-${channel.channel})` }} aria-hidden="true" />
                  {CHANNEL_LABEL[channel.channel]}
                </span>
              </td>
              <td className="py-2.5 pr-3">
                <StackedBar
                  label={`${CHANNEL_LABEL[channel.channel]} deliveries by status`}
                  total={channel.deliveries}
                  max={max}
                  segments={DAILY_SERIES.map((series) => ({ ...series, value: channel[series.key] }))}
                />
              </td>
              <td className="py-2.5 text-right tabular-nums">{formatCount(channel.deliveries)}</td>
              <td className="py-2.5 text-right tabular-nums">{formatPercent(rate(channel.sent, channel.failed))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function InventoryCard({ stats }: { readonly stats: StatsOverview }) {
  const { inventory } = stats;
  const items = [
    { label: "Users",            value: formatCount(inventory.users),            href: "/users" },
    { label: "External systems", value: formatCount(inventory.external_systems), href: "/external-systems" },
    { label: "Templates",        value: formatCount(inventory.templates),        href: "/notifications/templates" },
    { label: "Active providers", value: `${formatCount(inventory.providers_active)} of ${formatCount(inventory.providers_total)}`, href: "/providers" },
  ];
  return (
    <Card title="Setup">
      <dl className="grid grid-cols-2 gap-4" data-testid="inventory">
        {items.map((item) => (
          <Link key={item.label} href={item.href} className="rounded-lg border p-3 hover:bg-muted/50">
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className="mt-1 text-xl font-semibold">{item.value}</dd>
          </Link>
        ))}
      </dl>
      {inventory.providers_active === 0 && (
        <p className="mt-4 flex items-center gap-1.5 text-sm" style={{ color: "var(--viz-failed)" }}>
          <AlertTriangle className="size-4" aria-hidden="true" />
          No active provider — nothing can be sent.{" "}
          <Link href="/providers/new" className="font-medium underline">Add one</Link>
        </p>
      )}
    </Card>
  );
}

function ProvidersCard({ stats }: { readonly stats: StatsOverview }) {
  return (
    <Card title="Providers">
      {stats.providers.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No providers configured. <Link href="/providers/new" className="text-primary hover:underline">Add one</Link>
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="providers-table">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="py-1.5 text-left font-medium">Provider</th>
                <th className="py-1.5 text-left font-medium">Channel</th>
                <th className="py-1.5 text-right font-medium">Deliveries</th>
                <th className="py-1.5 text-right font-medium">Sent</th>
                <th className="py-1.5 text-right font-medium">Failed</th>
                <th className="py-1.5 text-right font-medium">Success</th>
                <th className="py-1.5 text-right font-medium">API attempts</th>
                <th className="py-1.5 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {stats.providers.map((provider) => (
                <tr key={provider.id} className="border-t">
                  <td className="py-2 pr-3">
                    <Link href={`/providers/${provider.id}`} className="font-medium hover:underline">{provider.name}</Link>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {provider.kind ? providerKindSpec(provider.kind)?.label ?? provider.kind : "not configured"}
                    </span>
                    {!provider.is_active && <Badge variant="outline" className="ml-2">Inactive</Badge>}
                  </td>
                  <td className="py-2 pr-3"><ChannelBadge channel={provider.channel} /></td>
                  <td className="py-2 text-right">{formatCount(provider.deliveries)}</td>
                  <td className="py-2 text-right">{formatCount(provider.sent)}</td>
                  <td className="py-2 text-right">{formatCount(provider.failed)}</td>
                  <td className="py-2 text-right">{formatPercent(rate(provider.sent, provider.failed))}</td>
                  <td className="py-2 text-right">{formatCount(provider.attempts)}</td>
                  <td className="py-2 text-right">{formatCost(provider.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function FailuresCard({ stats }: { readonly stats: StatsOverview }) {
  return (
    <Card
      title="Recent failures"
      actions={<Link href="/deliveries?status=failed" className="text-sm text-primary hover:underline">All failed deliveries</Link>}
    >
      {stats.recent_failures.length === 0 ? (
        <p className="flex items-center justify-center gap-1.5 py-6 text-sm text-muted-foreground">
          <Check className="size-4" style={{ color: "var(--viz-sent)" }} aria-hidden="true" />
          No failed deliveries in this period.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="failures-table">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="py-1.5 text-left font-medium">When</th>
                <th className="py-1.5 text-left font-medium">Event</th>
                <th className="py-1.5 text-left font-medium">Channel</th>
                <th className="py-1.5 text-left font-medium">Provider</th>
                <th className="py-1.5 text-left font-medium">Error</th>
                <th className="py-1.5 text-right font-medium">Attempts</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent_failures.map((failure) => (
                <tr key={failure.delivery_id} className="border-t align-top">
                  <td className="whitespace-nowrap py-2 pr-3 text-xs">{new Date(failure.failed_at).toLocaleString()}</td>
                  <td className="py-2 pr-3">
                    <Link href={`/deliveries/${failure.delivery_id}`} className="font-medium hover:underline">
                      {failure.event_type}
                    </Link>
                    <div className="text-xs text-muted-foreground">{failure.system_name}</div>
                  </td>
                  <td className="py-2 pr-3"><ChannelBadge channel={failure.channel} /></td>
                  <td className="py-2 pr-3 text-xs">{failure.provider_name ?? "—"}</td>
                  <td className="py-2 pr-3 font-mono text-xs" style={{ color: "var(--viz-failed)" }}>{failure.last_error ?? "—"}</td>
                  <td className="py-2 text-right tabular-nums">{failure.attempt_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
