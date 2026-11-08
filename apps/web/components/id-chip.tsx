"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * "Copy ID": for the rare moment someone needs the id (an API call, a
 * support ticket). The id itself is never shown as text.
 */
export function IdChip({ id, className, label = "Copy ID" }: { id: string; className?: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Copy the id to the clipboard"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void navigator.clipboard?.writeText(id).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}
