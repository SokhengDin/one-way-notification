"use client";

import { Search, X } from "lucide-react";
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
}: {
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
  return (
    <div className={cn("mb-4 flex flex-wrap items-end gap-3", className)}>
      {onSearchChange && (
        <div className="relative min-w-60 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search ?? ""}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={placeholder ?? "Search…"}
            aria-label={searchLabel ?? placeholder ?? "Search"}
            className="pl-8"
          />
        </div>
      )}
      {children}
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
