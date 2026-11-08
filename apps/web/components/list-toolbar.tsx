"use client";

import { Search, X } from "lucide-react";
import { useRef } from "react";
import { useSlashFocus } from "@/lib/use-slash-focus";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** The row above every list: search box, filters, and "Clear" when anything is set. */
export function ListToolbar({
  search,
  onSearchChange,
  placeholder,
  searchLabel,
  children,
  active,
  onClear,
  className,
  count,
}: {
  /** total rows matching, shown as a pill on the right */
  count?:          number;
  search?:         string;
  onSearchChange?: (value: string) => void;
  placeholder?:    string;
  /** accessible name of the search box; defaults to the placeholder */
  searchLabel?:    string;
  children?:       React.ReactNode;
  /** any filter or search is set */
  active?:         boolean;
  onClear?:        () => void;
  className?:      string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useSlashFocus(inputRef);
  return (
    <div className={cn("mb-4 flex flex-wrap items-end gap-3", className)}>
      {onSearchChange && (
        <div className="relative min-w-60 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={search ?? ""}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={placeholder ?? "Search…"}
            aria-label={searchLabel ?? placeholder ?? "Search"}
            className="pr-8 pl-8"
          />
          {search ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          ) : <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground" title="Press / to search">
            /
          </kbd>}
        </div>
      )}
      {children}
      {count !== undefined && (
        <span className="ml-auto self-center rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground tabular-nums">
          {count.toLocaleString()} {count === 1 ? "row" : "rows"}
        </span>
      )}
      {active && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="flex h-9 items-center gap-1 px-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" /> Clear
        </button>
      )}
    </div>
  );
}

/** A compact labelled filter slot that lines up with the search box. */
export function FilterSlot({ children, width = "w-44" }: { children: React.ReactNode; width?: string }) {
  return <div className={width}>{children}</div>;
}
