import { ChevronLeft } from "lucide-react";
import Link from "next/link";

interface PageHeaderProps {
  readonly title: React.ReactNode;
  readonly description?: React.ReactNode;
  readonly actions?: React.ReactNode;
  /** where "back" goes on a detail page, e.g. { href: "/users", label: "Users" } */
  readonly back?: { readonly href: string; readonly label: string };
}

export function PageHeader({ title, description, actions, back }: PageHeaderProps) {
  return (
    <div className="mb-6 border-b pb-5">
      {back && (
        <Link
          href={back.href}
          className="mb-2 inline-flex items-center gap-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 max-w-full">
          <h1 className="text-xl font-semibold tracking-tight break-words text-foreground sm:text-2xl">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
