import Link from "next/link";
import type { ComponentProps } from "react";
import { Button as ShadcnButton, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "outline";

const VARIANT_MAP: Record<Variant, ComponentProps<typeof ShadcnButton>["variant"]> = {
  primary: "default",
  secondary: "secondary",
  danger: "destructive",
  ghost: "ghost",
  outline: "outline",
};

interface ButtonProps extends Omit<ComponentProps<typeof ShadcnButton>, "variant"> {
  readonly variant?: Variant;
}

export function Button({ variant = "primary", ...props }: ButtonProps) {
  return <ShadcnButton variant={VARIANT_MAP[variant]} {...props} />;
}

interface LinkButtonProps {
  readonly href: string;
  readonly variant?: Variant;
  readonly className?: string;
  readonly children: React.ReactNode;
}

export function LinkButton({ href, variant = "primary", className, children }: LinkButtonProps) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant: VARIANT_MAP[variant] }), className)}>
      {children}
    </Link>
  );
}
