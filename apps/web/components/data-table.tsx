"use client";

import { AlertCircle, Inbox } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "./button";
import { Skeleton } from "@/components/ui/skeleton";
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
}

// clicks on these inside a row do their own thing instead of opening the row
const INTERACTIVE = "a, button, input, select, textarea, label, [role=button], [role=checkbox], [role=combobox], [data-row-ignore]";

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
}: DataTableProps<T>) {
  const router = useRouter();

  const open = (href: string, newTab: boolean) => {
    if (newTab) window.open(href, "_blank", "noopener");
    else router.push(href);
  };
  if (isLoading) {
    return (
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.header}>{column.header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, rowIndex) => (
              <TableRow key={rowIndex}>
                {columns.map((column) => (
                  <TableCell key={column.header}>
                    <Skeleton className="h-4 w-24" />
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
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
        <AlertCircle className="size-6 text-destructive" />
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load data."}
        </p>
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
        <Inbox className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        {emptyAction && <div className="mt-2">{emptyAction}</div>}
      </div>
    );
  }

  const { items, total, skip, limit } = data;
  const from = skip + 1;
  const to = Math.min(skip + limit, total);
  const canPrev = skip > 0;
  const canNext = skip + limit < total;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.header}>{column.header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((row) => {
              const href = rowHref?.(row);
              return (
              <TableRow
                key={rowKey(row)}
                className={href ? "cursor-pointer focus-visible:bg-muted/60 focus-visible:outline-none" : undefined}
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
                {columns.map((column) => (
                  <TableCell key={column.header} className={column.className}>
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
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing {from}–{to} of {total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!canPrev}
              onClick={() => onPageChange(Math.max(skip - limit, 0), limit)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={!canNext}
              onClick={() => onPageChange(skip + limit, limit)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
