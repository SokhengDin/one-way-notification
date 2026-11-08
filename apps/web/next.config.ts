import type { NextConfig } from "next";
import path from "node:path";

// Headers on every response, static files included. Page responses also get
// a Content-Security-Policy from proxy.ts.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options",       value: "nosniff" },
  { key: "X-Frame-Options",              value: "DENY" },
  { key: "Referrer-Policy",              value: "no-referrer" },
  { key: "Permissions-Policy",           value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy",   value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-Robots-Tag",                 value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  // don't advertise the framework
  poweredByHeader: false,
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
