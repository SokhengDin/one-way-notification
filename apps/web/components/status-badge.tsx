import type { ChannelType, DeliveryStatus } from "@repo/schema";
import { Mail, MessageCircle, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_CLASSES: Record<DeliveryStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  sent: "bg-success/15 text-success dark:bg-success/20",
  failed: "bg-destructive/15 text-destructive dark:bg-destructive/20",
  retrying: "bg-warning/20 text-warning-foreground dark:bg-warning/25",
  skipped: "bg-secondary text-secondary-foreground",
};

export function StatusBadge({ status }: { status: DeliveryStatus }) {
  return (
    <Badge variant="outline" className={cn("border-transparent capitalize", STATUS_CLASSES[status])}>
      {status}
    </Badge>
  );
}

const CHANNEL_ICONS: Record<ChannelType, React.ComponentType<{ className?: string }>> = {
  email: Mail,
  sms: MessageCircle,
  telegram: Send,
};

const CHANNEL_LABELS: Record<ChannelType, string> = { email: "Email", sms: "SMS", telegram: "Telegram" };

const CHANNEL_CLASSES: Record<ChannelType, string> = {
  email: "bg-chart-1/15 text-chart-1",
  sms: "bg-chart-4/15 text-chart-4",
  telegram: "bg-chart-2/15 text-chart-2",
};

export function ChannelBadge({ channel }: { channel: ChannelType }) {
  const Icon = CHANNEL_ICONS[channel];
  return (
    <Badge variant="outline" className={cn("gap-1 border-transparent", CHANNEL_CLASSES[channel])}>
      <Icon className="size-3" />
      {CHANNEL_LABELS[channel]}
    </Badge>
  );
}

export function BooleanBadge({ value, trueLabel = "Yes", falseLabel = "No" }: { value: boolean; trueLabel?: string; falseLabel?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent",
        value ? "bg-success/15 text-success dark:bg-success/20" : "bg-muted text-muted-foreground",
      )}
    >
      {value ? trueLabel : falseLabel}
    </Badge>
  );
}
