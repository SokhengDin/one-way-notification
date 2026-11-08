"use client";

import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly count?: number;
}

/** A row of mutually exclusive filters, styled like the overview's range picker. */
export function Segmented<T extends string>({
  options, value, onChange, label,
}: {
  options:  ReadonlyArray<SegmentOption<T>>;
  value:    T;
  onChange: (value: T) => void;
  label:    string;
}) {
  return (
    <div className="flex flex-wrap rounded-lg border bg-card p-0.5" role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
              active ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:bg-muted/60",
            )}
          >
            {option.label}
            {option.count !== undefined && option.count > 0 && (
              <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", active ? "bg-background" : "bg-muted")}>
                {option.count.toLocaleString()}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
