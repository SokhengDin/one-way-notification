"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useState } from "react";
import type { StatsDay } from "@repo/schema";
import { cn } from "@/lib/utils";
import { useElementWidth } from "../../lib/use-element-width";

// ---------- formatting ----------

const integer = new Intl.NumberFormat("en-US");
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

export const formatCount   = (value: number) => integer.format(value);
export const formatPercent = (value: number | null) => (value === null ? "—" : percent.format(value));

export function formatCost(value: string): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return number.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: number !== 0 && number < 1 ? 4 : 2 });
}

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// ---------- stat tile ----------

interface StatTileProps {
  readonly label:     string;
  readonly value:     string;
  readonly testId:    string;
  /** current vs previous period; omit for no delta line */
  readonly delta?:    { readonly current: number; readonly previous: number; readonly upIsGood: boolean };
  readonly sub?:      string;
  /** small colour key matching the chart series, beside the label */
  readonly swatch?:   string;
}

export function StatTile({ label, value, testId, delta, sub, swatch }: StatTileProps) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border bg-card p-4" data-testid={testId}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {swatch && <span className="size-2 rounded-sm" style={{ backgroundColor: swatch }} aria-hidden="true" />}
        {label}
      </p>
      <p className="text-2xl font-semibold" data-testid={`${testId}-value`}>{value}</p>
      {delta && <DeltaLine {...delta} />}
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function DeltaLine({ current, previous, upIsGood }: { current: number; previous: number; upIsGood: boolean }) {
  if (previous === 0) {
    return <p className="text-xs text-muted-foreground">{current === 0 ? "No activity either period" : "None in previous period"}</p>;
  }
  const change = (current - previous) / previous;
  const flat   = Math.abs(change) < 0.005;
  const good   = flat ? null : change > 0 === upIsGood;
  const Icon   = flat ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <p
      className="flex items-center gap-1 whitespace-nowrap text-xs"
      style={{ color: good === null ? "var(--muted-foreground)" : good ? "var(--viz-up-good)" : "var(--viz-failed)" }}
      title={`Previous period: ${formatCount(previous)}`}
      data-testid="delta"
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="font-medium">{flat ? "0%" : `${change > 0 ? "+" : ""}${percent.format(change)}`}</span>
      <span className="truncate text-muted-foreground">vs {formatCount(previous)} before</span>
    </p>
  );
}

// ---------- daily volume (stacked columns) ----------

export const DAILY_SERIES = [
  { key: "sent",        label: "Sent",        color: "var(--viz-sent)" },
  { key: "failed",      label: "Failed",      color: "var(--viz-failed)" },
  { key: "in_progress", label: "In progress", color: "var(--viz-progress)" },
  { key: "skipped",     label: "Skipped",     color: "var(--viz-skipped)" },
] as const;

type SeriesKey = (typeof DAILY_SERIES)[number]["key"];

function niceMax(value: number): number {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step      = [1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude * 4 >= value)! * magnitude;
  return step * 4;
}

export function DailyVolumeChart({ days }: { readonly days: ReadonlyArray<StatsDay> }) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover]     = useState<number | null>(null);

  const height  = 240;
  const margin  = { top: 12, right: 8, bottom: 26, left: 40 };
  const plotW   = Math.max(100, width - margin.left - margin.right);
  const plotH   = height - margin.top - margin.bottom;
  const totals  = days.map((day) => DAILY_SERIES.reduce((sum, series) => sum + day[series.key], 0));
  const yMax    = niceMax(Math.max(0, ...totals));
  const band    = plotW / Math.max(1, days.length);
  const barW    = Math.max(2, Math.min(24, band - 4));
  const y       = (value: number) => (value / yMax) * plotH;
  const ticks   = [0, 0.25, 0.5, 0.75, 1].map((fraction) => Math.round(yMax * fraction));
  const labelEvery = Math.max(1, Math.ceil(days.length / Math.max(1, Math.floor(plotW / 64))));
  const GAP     = 2; // surface gap between stacked segments

  const hovered = hover === null ? null : days[hover];

  return (
    <div ref={containerRef} className="relative" data-testid="daily-chart">
      <svg width={width} height={height} role="img" aria-label={`Daily deliveries for the last ${days.length} days`}>
        <g transform={`translate(${margin.left},${margin.top})`}>
          {ticks.map((tick) => (
            <g key={tick} transform={`translate(0,${plotH - y(tick)})`}>
              <line x1={0} x2={plotW} stroke={tick === 0 ? "var(--viz-axis)" : "var(--viz-grid)"} strokeWidth={1} />
              <text x={-8} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--viz-muted)" style={{ fontVariantNumeric: "tabular-nums" }}>
                {formatCount(tick)}
              </text>
            </g>
          ))}

          {days.map((day, index) => {
            const x = index * band + (band - barW) / 2;
            let top = plotH;
            const segments = DAILY_SERIES.filter((series) => day[series.key] > 0);
            return (
              <g
                key={day.date}
                tabIndex={0}
                role="button"
                aria-label={`${shortDate(day.date)}: ${DAILY_SERIES.map((s) => `${day[s.key]} ${s.label.toLowerCase()}`).join(", ")}`}
                onPointerEnter={() => setHover(index)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(index)}
                onBlur={() => setHover(null)}
                className="outline-none"
              >
                {/* hit target: the whole band, taller than the marks */}
                <rect x={index * band} y={0} width={band} height={plotH} fill="transparent" />
                {hover === index && <rect x={index * band} y={0} width={band} height={plotH} fill="var(--muted)" opacity={0.6} />}
                {segments.map((series, segmentIndex) => {
                  const h      = y(day[series.key]);
                  const isTop  = segmentIndex === segments.length - 1;
                  const drawH  = Math.max(0, h - (isTop ? 0 : GAP));
                  top -= h;
                  const r = isTop ? Math.min(4, drawH / 2, barW / 2) : 0;
                  return (
                    <path
                      key={series.key}
                      d={roundedTopRect(x, top + (isTop ? 0 : GAP), barW, drawH, r)}
                      fill={series.color}
                      data-series={series.key}
                    />
                  );
                })}
              </g>
            );
          })}

          {days.map((day, index) =>
            index % labelEvery === 0 || index === days.length - 1 ? (
              <text
                key={day.date}
                x={index * band + band / 2}
                y={plotH + 17}
                textAnchor="middle"
                fontSize={11}
                fill="var(--viz-muted)"
              >
                {shortDate(day.date)}
              </text>
            ) : null,
          )}
        </g>
      </svg>

      {hovered && hover !== null && (
        <div
          role="tooltip"
          data-testid="daily-tooltip"
          className="pointer-events-none absolute top-2 z-10 min-w-40 rounded-lg border bg-popover px-3 py-2 text-xs shadow-sm"
          style={{
            left: Math.min(Math.max(0, margin.left + hover * band + band / 2 - 80), Math.max(0, width - 168)),
          }}
        >
          <p className="mb-1 font-medium">{shortDate(hovered.date)}</p>
          {DAILY_SERIES.map((series) => (
            <p key={series.key} className="flex items-center gap-2">
              <span className="h-0.5 w-3 rounded" style={{ backgroundColor: series.color }} aria-hidden="true" />
              <span className="font-semibold tabular-nums">{formatCount(hovered[series.key])}</span>
              <span className="text-muted-foreground">{series.label}</span>
            </p>
          ))}
          <p className="mt-1 border-t pt-1 text-muted-foreground">
            <span className="font-semibold text-foreground tabular-nums">{formatCount(hovered.notifications)}</span> notifications
          </p>
        </div>
      )}
    </div>
  );
}

/** Rect with only the top corners rounded (square at the baseline). */
function roundedTopRect(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0) return "";
  if (r <= 0) return `M${x},${y}h${w}v${h}h${-w}z`;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}z`;
}

export function SeriesLegend({ series }: { readonly series: ReadonlyArray<{ key: string; label: string; color: string }> }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
      {series.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ backgroundColor: item.color }} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

// ---------- horizontal stacked bar (one row of a breakdown) ----------

export function StackedBar({
  segments,
  total,
  max,
  label,
}: {
  readonly segments: ReadonlyArray<{ readonly key: string; readonly label: string; readonly value: number; readonly color: string }>;
  readonly total:    number;
  /** the largest total among sibling rows, so bars share one scale */
  readonly max:      number;
  readonly label:    string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const visible = segments.filter((segment) => segment.value > 0);
  const widthPct = max === 0 ? 0 : (total / max) * 100;

  return (
    <div className="relative h-3 w-full" aria-label={label} role="img">
      <div className="flex h-3 gap-0.5" style={{ width: `${widthPct}%` }}>
        {visible.map((segment, index) => (
          <div
            key={segment.key}
            className={cn("h-full", index === visible.length - 1 && "rounded-r")}
            style={{ flexGrow: segment.value, flexBasis: 0, backgroundColor: segment.color, minWidth: 2 }}
            onPointerEnter={() => setHover(segment.key)}
            onPointerLeave={() => setHover(null)}
            data-series={segment.key}
          />
        ))}
      </div>
      {hover && (
        <div role="tooltip" className="pointer-events-none absolute -top-8 left-0 z-10 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs shadow-sm">
          <span className="font-semibold tabular-nums">{formatCount(segments.find((s) => s.key === hover)!.value)}</span>{" "}
          <span className="text-muted-foreground">{segments.find((s) => s.key === hover)!.label}</span>
        </div>
      )}
    </div>
  );
}

// ---------- single-series bar list ----------

export function BarList({
  rows,
  testId,
}: {
  readonly rows:   ReadonlyArray<{ readonly key: string; readonly label: string; readonly value: number; readonly note?: string }>;
  readonly testId: string;
}) {
  const max = Math.max(0, ...rows.map((row) => row.value));
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Nothing in this period.</p>;
  }
  return (
    <ul className="flex flex-col gap-2.5" data-testid={testId}>
      {rows.map((row) => (
        <li key={row.key} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate" title={row.label}>{row.label}</span>
          <div className="h-3">
            <div
              className="h-full rounded-r"
              style={{ width: `${max === 0 ? 0 : Math.max(1, (row.value / max) * 100)}%`, backgroundColor: "var(--viz-bar)" }}
            />
          </div>
          <span className="text-right text-xs tabular-nums">
            <span className="font-semibold">{formatCount(row.value)}</span>
            {row.note && <span className="ml-1.5 text-muted-foreground">{row.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export type { SeriesKey };
