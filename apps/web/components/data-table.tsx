"use client";

import { AlertCircle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Inbox } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "./button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface DataTableColumn<T> {
  readonly header: string;
  readonly cell: (row: T) => React.ReactNode;
  readonly className?: string;
}

export interface PaginatedData<T> {
  readonly items: ReadonlyArray<T>;
  readonly total: number;
  readonly skip: number;
  readonly limit: number;
}

interface DataTableProps<T> {
  readonly columns: ReadonlyArray<DataTableColumn<T>>;
  readonly data?: PaginatedData<T>;
  readonly rowKey: (row: T) => string;
  readonly isLoading?: boolean;
  readonly error?: unknown;
  readonly emptyMessage?: string;
  /** shown under the empty message, e.g. a "Create …" button */
  readonly emptyAction?: React.ReactNode;
  readonly onPageChange?: (skip: number, limit: number) => void;
  /** makes the whole row open this page (click, Enter; ⌘/Ctrl-click opens a new tab) */
  readonly rowHref?: (row: T) => string;
  /** a "#" column with the row's position across pages (default: on for paginated lists) */
  readonly showIndex?: boolean;
}

const PAGE_SIZES = [10, 20, 50, 100] as const;

// clicks on these inside a row do their own thing instead of opening the row
const INTERACTIVE = "a, button, input, select, textarea, label, [role=button], [role=checkbox], [role=combobox], [data-row-ignore]";

const indexHead = <TableHead className="w-12 pr-0 text-right text-muted-foreground tabular-nums">#</TableHead>;

export function DataTable<T>({
  columns,
  data,
  rowKey,
  isLoading,
  error,
  emptyMessage = "No records found.",
  emptyAction,
  onPageChange,
  rowHref,
  showIndex: showIndexProp,
}: DataTableProps<T>) {
  const showIndex = showIndexProp ?? onPageChange !== undefined;
  const router = useRouter();

  const open = (href: string, newTab: boolean) => {
    if (newTab) window.open(href, "_blank", "noopener");
    else router.push(href);
  };

  if (isLoading) {
    return (
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              {showIndex && indexHead}
              {columns.map((column, index) => (
                <TableHead key={index}>{column.header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, rowIndex) => (
              <TableRow key={rowIndex}>
                {showIndex && <TableCell><Skeleton className="ml-auto h-4 w-4" /></TableCell>}
                {columns.map((_column, index) => (
                  <TableCell key={index}>
                    <Skeleton className={cn("h-3.5", ["w-40", "w-24", "w-32", "w-16", "w-28"][(rowIndex + index) % 5])} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fade-up flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-12 text-center" role="alert">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-red-50 text-red-600 ring-8 ring-red-50/40 dark:bg-red-950 dark:text-red-400 dark:ring-red-950/30">
          <AlertCircle className="size-5" aria-hidden />
        </span>
        <p className="mt-2 text-sm font-semibold">Couldn&apos;t load this list</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Failed to load data."}
        </p>
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="fade-up flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-12 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500 ring-8 ring-zinc-50 dark:bg-zinc-800 dark:ring-zinc-900">
          <Inbox className="size-5" aria-hidden />
        </span>
        <p className="mt-2 text-sm font-medium text-muted-foreground">{emptyMessage}</p>
        {emptyAction && <div className="mt-2">{emptyAction}</div>}
      </div>
    );
  }

  const { items, total, skip, limit } = data;
  const from     = skip + 1;
  const to       = Math.min(skip + items.length, total);
  const page     = Math.floor(skip / limit) + 1;
  const pages    = Math.max(1, Math.ceil(total / limit));
  const canPrev  = skip > 0;
  const canNext  = skip + limit < total;
  const lastSkip = (pages - 1) * limit;

  return (
    <div className="flex flex-col gap-3">
      {/* long pages scroll inside the table, header stays put */}
      <div className="max-h-[70vh] overflow-auto rounded-xl border bg-card">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted shadow-[0_1px_0_var(--border)]">
            <TableRow className="hover:bg-transparent">
              {showIndex && indexHead}
              {columns.map((column, index) => (
                <TableHead key={index} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((row, rowIndex) => {
              const href = rowHref?.(row);
              return (
                <TableRow
                  key={rowKey(row)}
                  className={cn(
                    "fade-up transition-colors even:bg-zinc-50/60 hover:bg-blue-50/60 dark:even:bg-zinc-900/40 dark:hover:bg-blue-950/30",
                    href && "group cursor-pointer focus-visible:bg-primary/10 focus-visible:outline-none",
                  )}
                  style={{ animationDelay: `${Math.min(rowIndex, 12) * 15}ms` }}
                  tabIndex={href ? 0 : undefined}
                  onClick={href ? (event) => {
                    if ((event.target as HTMLElement).closest(INTERACTIVE)) return;
                    if (window.getSelection()?.toString()) return; // selecting text, not opening
                    open(href, event.metaKey || event.ctrlKey);
                  } : undefined}
                  onAuxClick={href ? (event) => {
                    if (event.button === 1 && !(event.target as HTMLElement).closest(INTERACTIVE)) open(href, true);
                  } : undefined}
                  onKeyDown={href ? (event) => {
                    if (event.key === "Enter" && event.target === event.currentTarget) open(href, event.metaKey || event.ctrlKey);
                  } : undefined}
                >
                  {showIndex && (
                    <TableCell className="w-12 pr-0 text-right font-mono text-xs text-muted-foreground/70 tabular-nums">
                      {skip + rowIndex + 1}
                    </TableCell>
                  )}
                  {columns.map((column, index) => (
                    <TableCell key={index} className={column.className}>
                      {column.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {onPageChange && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="text-sm tabular-nums">
            Showing <b className="font-medium text-foreground">{from.toLocaleString()}</b> to{" "}
            <b className="font-medium text-foreground">{to.toLocaleString()}</b> of{" "}
            <b className="font-medium text-foreground">{total.toLocaleString()}</b>
          </span>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2">
              Rows per page
              <Select
                items={PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) }))}
                value={String(limit)}
                onValueChange={(next) => onPageChange(0, Number(next))}
              >
                <SelectTrigger size="sm" className="w-18" aria-label="Rows per page">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((size) => (
                    <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <span className="tabular-nums">Page {page} of {pages}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="icon-sm" aria-label="First page" disabled={!canPrev} onClick={() => onPageChange(0, limit)}>
                <ChevronsLeft />
              </Button>
              <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={!canPrev} onClick={() => onPageChange(Math.max(skip - limit, 0), limit)}>
                <ChevronLeft />
              </Button>
              <Button variant="outline" size="icon-sm" aria-label="Next page" disabled={!canNext} onClick={() => onPageChange(skip + limit, limit)}>
                <ChevronRight />
              </Button>
              <Button variant="outline" size="icon-sm" aria-label="Last page" disabled={!canNext} onClick={() => onPageChange(lastSkip, limit)}>
                <ChevronsRight />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
