"use client";

import {
  Bell,
  FileStack,
  LayoutDashboard,
  Radio,
  Send,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

interface NavItem {
  readonly label: string;
  readonly href: string;
  readonly icon?: ComponentType<{ className?: string }>;
}

interface NavSection {
  readonly label: string;
  readonly href?: string;
  readonly icon?: ComponentType<{ className?: string }>;
  readonly items?: ReadonlyArray<NavItem>;
}

const SECTIONS: ReadonlyArray<NavSection> = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Users", href: "/users", icon: Users },
  {
    label: "Notifications",
    icon: Bell,
    items: [
      { label: "Templates", href: "/notifications/templates", icon: FileStack },
      { label: "Sent", href: "/notifications", icon: Send },
    ],
  },
  { label: "External Systems", href: "/external-systems", icon: Radio },
  { label: "Providers", href: "/providers", icon: Send },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ label, href, icon: Icon }: NavItem) {
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
    </Link>
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
                <div className="flex items-center gap-2.5 px-3 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/40">
                  {section.icon && <section.icon className="size-3.5" />}
                  {section.label}
                </div>
                {section.items?.map((item) => (
                  <div key={item.href} className="pl-4">
                    <NavLink label={item.label} href={item.href} icon={item.icon} />
                  </div>
                ))}
              </>
            )}
          </div>
        ))}
      </div>
    </nav>
  );
}
