"use client";

// "What needs me right now?" — shown on the overview only when something does.

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, PauseCircle, Radio } from "lucide-react";
import Link from "next/link";
import { getDeliveryQueue } from "@/lib/api/deliveries";
import { formatSeconds } from "@/lib/format";
import { useProviders } from "@/lib/lookups";
import { useMounted } from "@/lib/use-mounted";
import { providerHealth } from "./provider-health";

interface Item {
  readonly key:   string;
  readonly icon:  React.ComponentType<{ className?: string }>;
  readonly tone:  "bad" | "warn";
  readonly text:  string;
  readonly href:  string;
  readonly cta:   string;
}

export function Attention() {
  const mounted   = useMounted();
  const queue     = useQuery({ queryKey: ["delivery-queue"], queryFn: getDeliveryQueue, refetchInterval: 15_000 }).data?.data;
  const providers = useProviders();
  if (!mounted || !queue) return null;

  const items: Array<Item> = [];
  if (queue.failed_last_hour > 0) {
    items.push({
      key: "failed", icon: AlertTriangle, tone: "bad",
      text: `${queue.failed_last_hour} ${queue.failed_last_hour === 1 ? "delivery" : "deliveries"} failed in the last hour`,
      href: "/deliveries?status=failed", cta: "Review",
    });
  }
  for (const provider of providers) {
    if (providerHealth(provider) === "cooling") {
      items.push({
        key: `cooling-${provider.id}`, icon: Radio, tone: "warn",
        text: `${provider.name} is cooling down after ${provider.consecutive_failures} failures in a row`,
        href: `/providers/${provider.id}`, cta: "Check provider",
      });
    }
  }
  if (!queue.worker_enabled && queue.due > 0) {
    items.push({
      key: "paused", icon: PauseCircle, tone: "warn",
      text: `The worker is paused and ${queue.due} ${queue.due === 1 ? "delivery is" : "deliveries are"} waiting`,
      href: "/deliveries?status=pending", cta: "Process",
    });
  } else if (queue.oldest_due_age_s !== null && queue.oldest_due_age_s > 300) {
    items.push({
      key: "backlog", icon: PauseCircle, tone: "warn",
      text: `The oldest waiting delivery has been due for ${formatSeconds(queue.oldest_due_age_s)}`,
      href: "/deliveries?status=pending", cta: "Open queue",
    });
  }
  if (items.length === 0) return null;

  return (
    <section aria-label="Needs attention" className="mb-6 overflow-hidden rounded-xl border border-warning/40 bg-warning/5">
      <h2 className="border-b border-warning/30 px-4 py-2 text-xs font-semibold tracking-wide text-warning-foreground uppercase">
        Needs attention
      </h2>
      <ul className="divide-y divide-warning/20">
        {items.map(({ key, icon: Icon, tone, text, href, cta }) => (
          <li key={key}>
            <Link href={href} className="group flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-warning/10">
              <Icon className={tone === "bad" ? "size-4 text-destructive" : "size-4 text-warning"} />
              <span className="flex-1">{text}</span>
              <span className="flex items-center gap-0.5 text-xs font-medium text-primary">
                {cta}
                <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
