"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { shortId } from "@/lib/format";

/**
 * A UUID, out of the way: the first 8 characters, the full value on hover,
 * one click to copy. For the rare moment someone actually needs the id.
 */
export function IdChip({ id, className, label }: { id: string; className?: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={`${label ? `${label}: ` : ""}${id} — click to copy`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void navigator.clipboard?.writeText(id).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-transparent px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      {label && <span className="font-sans">{label}</span>}
      {shortId(id)}
      {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3 opacity-60" />}
    </button>
  );
}
