import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "./query-provider";
import { Shell } from "./shell";
import "./globals.css";

const APP_NAME = "one-way-notification";

export const metadata: Metadata = {
  // NEXT_PUBLIC_SITE_URL makes icon and manifest URLs absolute when deployed
  metadataBase:    process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : undefined,
  title:           { default: `${APP_NAME} admin`, template: `%s · ${APP_NAME}` },
  description:     "Admin console for one-way-notification: templates, providers, external systems and the delivery of every email, SMS and Telegram message.",
  applicationName: APP_NAME,
  // A private admin console: keep it out of search engines entirely
  // (robots.txt says the same; this covers pages linked from elsewhere).
  robots: {
    index: false, follow: false, nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
  referrer:        "no-referrer",
  formatDetection: { telephone: false, email: false, address: false },
  appleWebApp:     { capable: true, title: APP_NAME, statusBarStyle: "black-translucent" },
  openGraph:       { type: "website", siteName: APP_NAME, title: `${APP_NAME} admin`, description: "Admin console for one-way-notification." },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#172554" },
    { media: "(prefers-color-scheme: dark)",  color: "#0b1530" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="antialiased">
      <body className="min-h-screen">
        <QueryProvider>
          <Shell>{children}</Shell>
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}
