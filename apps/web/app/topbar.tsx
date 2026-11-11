"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, House, LogOut, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "../components/avatar";
import { Skeleton } from "../components/ui/skeleton";
import { getMe, signOut } from "../lib/api/auth";
import { getExternalSystemById } from "../lib/api/external-systems";
import { currentNav } from "../lib/nav";
import { useMounted } from "../lib/use-mounted";
import { cn } from "../lib/utils";

interface Crumb {
  readonly label: string;
  readonly href?: string;
}

const SYSTEM_PATH = /^\/external-systems\/([0-9a-f-]{36})(\/users(\/(new|[0-9a-f-]{36}))?)?/;

/** Below an external system: its name, then Users and the user (users live inside their system). */
function useSystemCrumbs(pathname: string): ReadonlyArray<Crumb> | null {
  const match    = SYSTEM_PATH.exec(pathname);
  const systemId = match?.[1];
  const system   = useQuery({
    queryKey: ["external-system", systemId],
    queryFn:  () => getExternalSystemById(systemId!),
    enabled:  systemId !== undefined,
  });
  if (!match || !systemId) return null;
  const base   = `/external-systems/${systemId}`;
  const crumbs: Array<Crumb> = [{ label: system.data?.data.name ?? "System", href: base }];
  if (match[2]) crumbs.push({ label: "Users", href: `${base}/users` });
  if (match[4]) crumbs.push({ label: match[4] === "new" ? "Add user" : "User" });
  return crumbs;
}

/** Sticky top bar: where you are (group, page) and who you are (profile menu). */
export function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname     = usePathname();
  const current      = currentNav(pathname);
  const systemCrumbs = useSystemCrumbs(pathname);
  const deeper       = current !== undefined && pathname !== current.href;
  const trail: ReadonlyArray<Crumb> = systemCrumbs ?? (deeper ? [{ label: "Details" }] : []);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-white/90 px-4 backdrop-blur sm:px-6 lg:px-8 dark:bg-zinc-950/90">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Open menu"
        className="-ml-1.5 rounded-md p-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 lg:hidden dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <Menu className="size-5" />
      </button>

      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
        <Link href="/" aria-label="Overview" className="hidden text-zinc-400 hover:text-zinc-700 sm:block dark:hover:text-zinc-200">
          <House className="size-4" />
        </Link>
        {current && (
          <>
            <Chevron className="hidden sm:block" />
            <span className="hidden text-zinc-500 sm:inline">{current.group}</span>
            <Chevron className="hidden sm:block" />
            {trail.length > 0
              ? <Link href={current.href} className="truncate text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">{current.label}</Link>
              : <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">{current.label}</span>}
            {trail.map((crumb, index) => {
              const last = index === trail.length - 1;
              return (
                <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
                  <Chevron />
                  {crumb.href && !last
                    ? <Link href={crumb.href} className="truncate text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">{crumb.label}</Link>
                    : <span className={cn("truncate", last ? "font-medium text-zinc-900 dark:text-zinc-100" : "text-zinc-500")}>{crumb.label}</span>}
                </span>
              );
            })}
          </>
        )}
      </nav>

      <div className="ml-auto"><ProfileMenu /></div>
    </header>
  );
}

function Chevron({ className }: { className?: string }) {
  return <ChevronRight className={cn("size-3.5 shrink-0 text-zinc-300 dark:text-zinc-600", className)} aria-hidden />;
}

function ProfileMenu() {
  const query   = useQuery({ queryKey: ["me"], queryFn: getMe, staleTime: 5 * 60_000 });
  const mounted = useMounted();
  const me      = mounted ? query.data?.data : undefined;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const onKey  = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!me) {
    return (
      <div className="flex items-center gap-2">
        <Skeleton className="size-8 rounded-full" />
        <Skeleton className="hidden h-3.5 w-24 sm:block" />
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <Avatar name={me.name} size="sm" />
        <span className="hidden max-w-40 truncate text-sm font-medium sm:block">{me.name}</span>
        <ChevronDown className={cn("size-4 text-zinc-400 transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div role="menu" className="pop-in absolute right-0 z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          <div className="flex items-center gap-3 border-b border-border p-4">
            <Avatar name={me.name} size="lg" />
            <div className="min-w-0">
              <div className="truncate font-semibold">{me.name}</div>
              <div className="truncate text-xs text-muted-foreground">{me.email}</div>
              <div className="mt-1 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                Administrator
              </div>
            </div>
          </div>
          <div className="p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => void signOut()}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
            >
              <LogOut className="size-4" aria-hidden />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
