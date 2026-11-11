"use client";

import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { MobileNav, Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

/** Sidebar + top bar for every page except sign-in. Below `lg` the sidebar becomes a drawer. */
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const openNav  = useCallback(() => setNavOpen(true), []);
  const closeNav = useCallback(() => setNavOpen(false), []);

  if (pathname === "/login") return <>{children}</>;
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <MobileNav open={navOpen} onClose={closeNav} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={openNav} />
        <main className="mx-auto w-full max-w-[1600px] min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
