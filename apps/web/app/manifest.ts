import type { MetadataRoute } from "next";

// Installable as an app (desktop/mobile "Install"), with the brand icons.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name:             "one-way-notification admin",
    short_name:       "Notifications",
    description:      "Admin console for one-way-notification.",
    start_url:        "/",
    scope:            "/",
    display:          "standalone",
    background_color: "#F8FAFC",
    theme_color:      "#2563EB",
    icons: [
      { src: "/icons/icon-192.png",     sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png",     sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
