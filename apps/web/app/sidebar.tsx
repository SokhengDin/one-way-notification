"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  Building2,
  FileStack,
  Inbox,
  LayoutDashboard,
  LogOut,
  Radio,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { getMe, signOut } from "../lib/api/auth";
import { getDeliveryQueue } from "../lib/api/deliveries";
import { useMounted } from "../lib/use-mounted";

interface NavItem {
  readonly label: string;
  readonly href: string;
  readonly icon?: ComponentType<{ className?: string }>;
  readonly badge?: "queue";
}

interface NavSection {
  readonly label: string;
  readonly href?: string;
  readonly icon?: ComponentType<{ className?: string }>;
  readonly items?: ReadonlyArray<NavItem>;
}

const SECTIONS: ReadonlyArray<NavSection> = [
  {
    label: "Monitor",
    icon: LayoutDashboard,
    items: [
      { label: "Overview", href: "/", icon: LayoutDashboard },
      { label: "Deliveries", href: "/deliveries", icon: Inbox, badge: "queue" },
      { label: "Notifications", href: "/notifications", icon: Bell },
    ],
  },
  {
    label: "Configure",
    icon: FileStack,
    items: [
      { label: "Templates", href: "/notifications/templates", icon: FileStack },
      { label: "Providers", href: "/providers", icon: Radio },
      { label: "External systems", href: "/external-systems", icon: Building2 },
      { label: "Users", href: "/users", icon: Users },
    ],
  },
];

/** Failed deliveries in the last hour, or what's waiting to go out. */
function QueueBadge() {
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
      <span className="ml-auto rounded-full bg-destructive px-1.5 text-[11px] font-semibold text-white tabular-nums" title="Failed in the last hour">
        {queue.failed_last_hour}
      </span>
    );
  }
  const waiting = queue.pending + queue.retrying;
  if (waiting === 0) return null;
  return (
    <span className="ml-auto rounded-full bg-sidebar-accent px-1.5 text-[11px] text-sidebar-foreground/80 tabular-nums" title="Queued or retrying">
      {waiting}
    </span>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  // /notifications/templates is its own item, not part of "Notifications"
  if (href === "/notifications" && pathname.startsWith("/notifications/templates")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ label, href, icon: Icon, badge }: NavItem) {
  const pathname = usePathname();
  const active = isActive(pathname, href);

  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-sidebar-primary/15 font-medium text-sidebar-primary"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      }`}
    >
      {Icon && <Icon className="size-4 shrink-0" />}
      {label}
      {badge === "queue" && <QueueBadge />}
    </Link>
  );
}

function Account() {
  const query = useQuery({ queryKey: ["me"], queryFn: getMe, staleTime: 5 * 60_000 });
  const mounted = useMounted();
  const admin   = mounted ? query.data?.data : undefined;
  return (
    <div className="mt-auto flex items-center gap-2.5 border-t border-sidebar-border px-3 pt-4">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-foreground">
        {admin ? admin.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase() : ""}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-medium text-sidebar-foreground">{admin?.name ?? " "}</div>
        <div className="truncate text-xs text-sidebar-foreground/50">{admin?.email ?? " "}</div>
      </div>
      <button
        type="button"
        onClick={() => void signOut()}
        title="Sign out"
        aria-label="Sign out"
        className="rounded-md p-1.5 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}

export function Sidebar() {
  return (
    <nav className="sticky top-0 flex h-screen w-60 shrink-0 flex-col gap-6 overflow-y-auto bg-sidebar px-3 py-6 text-sidebar-foreground">
      <div className="flex items-center gap-2 px-3">
        <div className="flex size-7 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
          <Bell className="size-4" />
        </div>
        <span className="text-sm font-semibold tracking-tight">one-way-notification</span>
      </div>
      <div className="flex flex-col gap-4">
        {SECTIONS.map((section) => (
          <div key={section.label} className="flex flex-col gap-1">
            {section.href ? (
              <NavLink label={section.label} href={section.href} icon={section.icon} />
            ) : (
              <>
                <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                  {section.label}
                </div>
                {section.items?.map((item) => (
                  <NavLink key={item.href} {...item} />
                ))}
              </>
            )}
          </div>
        ))}
      </div>
      <Account />
    </nav>
  );
}
