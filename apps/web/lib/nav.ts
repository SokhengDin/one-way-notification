import {
  Bell,
  Building2,
  FileStack,
  Inbox,
  LayoutDashboard,
  Radio,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  readonly label: string;
  readonly href:  string;
  readonly icon:  LucideIcon;
  readonly badge?: "queue";
}

export interface NavGroup {
  readonly group: string;
  readonly items: ReadonlyArray<NavItem>;
}

export const NAV: ReadonlyArray<NavGroup> = [
  {
    group: "Monitor",
    items: [
      { label: "Overview",      href: "/",              icon: LayoutDashboard },
      { label: "Deliveries",    href: "/deliveries",    icon: Inbox, badge: "queue" },
      { label: "Notifications", href: "/notifications", icon: Bell },
    ],
  },
  {
    group: "Configure",
    items: [
      { label: "Templates",        href: "/notifications/templates", icon: FileStack },
      { label: "Providers",        href: "/providers",               icon: Radio },
      { label: "External systems", href: "/external-systems",        icon: Building2 },
      { label: "Users",            href: "/users",                   icon: Users },
    ],
  },
];

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  // /notifications/templates is its own item, not part of "Notifications"
  if (href === "/notifications" && pathname.startsWith("/notifications/templates")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The nav item a path belongs to, with its group, for the breadcrumb. */
export function currentNav(pathname: string): (NavItem & { group: string }) | undefined {
  for (const { group, items } of NAV) {
    const item = items.find((candidate) => isActive(pathname, candidate.href));
    if (item) return { ...item, group };
  }
  return undefined;
}
