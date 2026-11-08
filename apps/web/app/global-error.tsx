"use client";

// Last resort when the root layout itself fails: no app styles or providers
// are available here, so it's plain and self-contained.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "#F8FAFC", color: "#0F172A" }}>
        <div style={{ textAlign: "center", maxWidth: 360 }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>The dashboard couldn&apos;t load</h1>
          <p style={{ fontSize: 14, color: "#64748B" }}>Something went wrong before the page could start. Try again in a moment.</p>
          <button onClick={reset} style={{ marginTop: 16, padding: "8px 16px", borderRadius: 8, border: 0, background: "#2563EB", color: "#fff", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
