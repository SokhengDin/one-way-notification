"use client";

import { useQuery } from "@tanstack/react-query";
import { Bell, LogOut, Server, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Avatar } from "../components/avatar";
import { getMe, signOut } from "../lib/api/auth";
import { getDeliveryQueue } from "../lib/api/deliveries";
import { isActive, NAV, type NavItem } from "../lib/nav";
import { useMounted } from "../lib/use-mounted";
import { cn } from "../lib/utils";

/** Failed deliveries in the last hour, or what's waiting to go out. */
function QueueBadge({ active }: { active: boolean }) {
  const query = useQuery({
    queryKey:        ["delivery-queue"],
    queryFn:         getDeliveryQueue,
    refetchInterval: 15_000,
  });
  const mounted = useMounted();
  const queue   = mounted ? query.data?.data : undefined;
  if (!queue) return null;
  if (queue.failed_last_hour > 0) {
    return (
      <span className="ml-auto rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white tabular-nums" title="Failed in the last hour">
        {queue.failed_last_hour}
      </span>
    );
  }
  const waiting = queue.pending + queue.retrying;
  if (waiting === 0) return null;
  return (
    <span
      className={cn(
        "ml-auto rounded-full px-1.5 text-[11px] tabular-nums",
        active ? "bg-white/20 text-white" : "bg-sidebar-accent text-sidebar-foreground",
      )}
      title="Queued or retrying"
    >
      {waiting}
    </span>
  );
}

function NavLink({ label, href, icon: Icon, badge }: NavItem) {
  const pathname = usePathname();
  const active   = isActive(pathname, href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
        active
          ? "bg-sidebar-primary font-medium text-sidebar-primary-foreground"
          : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon className={cn("size-4 shrink-0", active ? "text-white" : "text-sidebar-muted")} aria-hidden />
      <span className="truncate">{label}</span>
      {badge === "queue" && <QueueBadge active={active} />}
    </Link>
  );
}

function Account() {
  const query   = useQuery({ queryKey: ["me"], queryFn: getMe, staleTime: 5 * 60_000 });
  const mounted = useMounted();
  const admin   = mounted ? query.data?.data : undefined;
  return (
    <div className="space-y-1 border-t border-sidebar-border p-3">
      <div className="flex items-center gap-2.5 rounded-md px-2 py-2">
        <Avatar name={admin?.name} size="sm" className="ring-2 ring-sidebar-accent" />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-sm font-medium text-white">{admin?.name ?? " "}</span>
          <span className="block truncate text-[11px] text-sidebar-muted">{admin?.email ?? " "}</span>
        </span>
      </div>
      <button
        type="button"
        onClick={() => void signOut()}
        className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-white"
      >
        <LogOut className="size-4" aria-hidden />
        Sign out
      </button>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-white shadow-sm">
        <Bell className="size-4.5" aria-hidden />
      </span>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-white">one-way-notification</div>
        <div className="flex items-center gap-1 truncate text-[11px] text-sidebar-muted">
          <Server className="size-3 shrink-0" aria-hidden />
          <span className="truncate">admin console</span>
        </div>
      </div>
    </div>
  );
}

function SidebarBody({ onClose }: { onClose?: () => void }) {
  return (
    <>
      <div className="flex items-center gap-2 px-4 py-5">
        <Brand />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="ml-auto rounded-md p-1.5 text-sidebar-muted hover:bg-sidebar-accent hover:text-white"
          >
            <X className="size-5" />
          </button>
        )}
      </div>
      <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV.map(({ group, items }) => (
          <div key={group}>
            <div className="px-2 pb-1.5 text-[11px] font-semibold tracking-wider text-sidebar-label uppercase">{group}</div>
            <div className="space-y-0.5">
              {items.map((item) => <NavLink key={item.href} {...item} />)}
            </div>
          </div>
        ))}
      </nav>
      <Account />
    </>
  );
}

/** Dark navy sidebar, as in file-vault. Always shown from `lg` up. */
export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:flex">
      <SidebarBody />
    </aside>
  );
}

/** The same navigation as a drawer below `lg`, opened from the top bar. */
export function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();

  // close after navigating
  useEffect(() => { onClose(); }, [pathname, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
      <div className="backdrop-in absolute inset-0 bg-zinc-950/50" onClick={onClose} aria-hidden />
      <aside className="drawer-in absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-sidebar text-sidebar-foreground shadow-xl">
        <SidebarBody onClose={onClose} />
      </aside>
    </div>
  );
}
