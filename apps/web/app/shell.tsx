"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";

/** The sidebar layout for every page except sign-in. */
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login") return <>{children}</>;
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1 px-8 py-6">{children}</main>
    </div>
  );
}
