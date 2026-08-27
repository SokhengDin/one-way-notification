import {
  Card as ShadcnCard,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface CardProps {
  readonly title?: string;
  readonly actions?: React.ReactNode;
  readonly className?: string;
  readonly children: React.ReactNode;
}

export function Card({ title, actions, className, children }: CardProps) {
  return (
    <ShadcnCard className={cn(className)}>
      {(title || actions) && (
        <CardHeader className="border-b pb-4">
          {title && <CardTitle>{title}</CardTitle>}
          {actions && <CardAction>{actions}</CardAction>}
        </CardHeader>
      )}
      <CardContent>{children}</CardContent>
    </ShadcnCard>
  );
}
