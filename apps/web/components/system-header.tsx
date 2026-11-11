"use client";

import { useQuery } from "@tanstack/react-query";
import { Settings2, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getExternalSystemById } from "@/lib/api/external-systems";
import { cn } from "@/lib/utils";
import { PageHeader } from "./page-header";

/** The external system everything on the page belongs to. Shared query with the settings page. */
export function useSystem(systemId: string) {
  return useQuery({
    queryKey: ["external-system", systemId],
    queryFn:  () => getExternalSystemById(systemId),
  });
}

/**
 * Header for every page of one external system: its name, and tabs for what
 * lives under it (its settings and keys, its users).
 */
export function SystemHeader({ systemId, actions, description }: {
  systemId:     string;
  actions?:     React.ReactNode;
  description?: React.ReactNode;
}) {
  const pathname = usePathname();
  const system   = useSystem(systemId).data?.data;
  const base     = `/external-systems/${systemId}`;

  const tabs = [
    { href: base,            label: "Settings", icon: Settings2, active: pathname === base },
    { href: `${base}/users`, label: "Users",    icon: Users,     active: pathname.startsWith(`${base}/users`), count: system?.user_count },
  ];

  return (
    <>
      <PageHeader
        back={{ href: "/external-systems", label: "External systems" }}
        title={system?.name ?? "External system"}
        description={description}
        actions={actions}
        className="mb-0 border-b-0 pb-4"
      />
      <nav aria-label="External system" className="mb-6 flex gap-1 overflow-x-auto border-b">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.active ? "page" : undefined}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors",
              tab.active
                ? "border-blue-700 font-medium text-foreground dark:border-blue-500"
                : "border-transparent text-muted-foreground hover:border-zinc-300 hover:text-foreground dark:hover:border-zinc-700",
            )}
          >
            <tab.icon className="size-4" aria-hidden />
            {tab.label}
            {tab.count !== undefined && (
              <span className={cn(
                "rounded-full px-1.5 text-[11px] tabular-nums",
                tab.active ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" : "bg-muted text-muted-foreground",
              )}>
                {tab.count.toLocaleString()}
              </span>
            )}
          </Link>
        ))}
      </nav>
    </>
  );
}
