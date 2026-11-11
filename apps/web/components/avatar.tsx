import { cn } from "@/lib/utils";

const SIZES = {
  sm: "size-8 text-xs",
  md: "size-9 text-sm",
  lg: "size-11 text-base",
} as const;

export function initials(name: string | null | undefined): string {
  if (!name) return "";
  return name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

/** Initials on a flat blue disc (file-vault style). */
export function Avatar({ name, size = "md", className }: { name?: string | null; size?: keyof typeof SIZES; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-blue-700 font-semibold text-white",
        SIZES[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
