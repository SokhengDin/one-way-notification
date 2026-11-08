"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { Button } from "../components/button";

// A page crashed. Show a calm message, never the stack trace.
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center" role="alert">
      <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
        <TriangleAlert className="size-6 text-destructive" aria-hidden />
      </span>
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        This page hit an unexpected error. Trying again usually helps; if it keeps happening, the API may be down.
      </p>
      {error.digest && <p className="text-xs text-muted-foreground">Reference: {error.digest}</p>}
      <Button className="mt-2" onClick={reset}>Try again</Button>
    </div>
  );
}
