import type { Metadata } from "next";

export const metadata: Metadata = { title: "New external system" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
