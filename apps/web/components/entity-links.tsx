import Link from "next/link";
import { Building2, Radio, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

// Links to the main entities, always by name. Ids stay in the URL.

/** Users live under an external system; without one, /users/:id finds it. */
export const userHref = (id: string, systemId?: string | null) =>
  systemId ? `/external-systems/${systemId}/users/${id}` : `/users/${id}`;

export function UserLink({
  id, systemId, name, detail, className,
}: { id: string; systemId?: string | null; name: string; detail?: string | null; className?: string }) {
  return (
    <Link href={userHref(id, systemId)} className={cn("group inline-flex min-w-0 items-center gap-2", className)}>
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
        {initials(name)}
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate font-medium group-hover:underline">{name}</span>
        {detail && detail !== name && <span className="truncate text-xs text-muted-foreground">{detail}</span>}
      </span>
    </Link>
  );
}

export function SystemLink({ id, name, className }: { id: string; name: string; className?: string }) {
  return (
    <Link href={`/external-systems/${id}`} className={cn("inline-flex items-center gap-1.5 hover:underline", className)}>
      <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{name}</span>
    </Link>
  );
}

export function ProviderLink({ id, name, className }: { id: string | null; name: string | null; className?: string }) {
  if (!id || !name) return <span className="text-muted-foreground">—</span>;
  return (
    <Link href={`/providers/${id}`} className={cn("inline-flex items-center gap-1.5 hover:underline", className)}>
      <Radio className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{name}</span>
    </Link>
  );
}

export function UserAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary", className)}>
      {name ? initials(name) : <UserRound className="size-4" />}
    </span>
  );
}

function initials(name: string): string {
  // emails and "User 1a2b3c4d" fall back to their first character
  if (name.includes("@") || name.startsWith("User ")) return name.charAt(0).toUpperCase();
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts.at(-1)![0] : "")).toUpperCase() || "?";
}
