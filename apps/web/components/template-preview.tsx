"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CircleAlert, Variable } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ChannelType } from "@repo/schema";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { previewNotificationTemplate } from "../lib/api/notifications";
import { errorIssues, errorMessage } from "../lib/errors";
import { Card } from "./card";
import { TextAreaField } from "./form-field";

interface TemplatePreviewProps {
  readonly externalSystemId: string;
  readonly channel:          ChannelType;
  readonly template:         string;
  readonly subject:          string | null;
  /** Sample payload to start from, as JSON text. */
  readonly initialPayload?:  string;
}

type View = "rendered" | "text" | "source";

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function parsePayload(text: string): { value: Record<string, unknown> } | { error: string } {
  if (text.trim() === "") return { value: {} };
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return { error: "Sample payload must be a JSON object" };
    }
    return { value: value as Record<string, unknown> };
  } catch (error) {
    return { error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** {"order":{"id":"<order.id>"}} from ["order.id"], skipping system.* built-ins. */
function skeletonFor(variables: ReadonlyArray<string>): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const path of variables) {
    const segments = path.split(".");
    if (segments[0] === "system") continue;
    let node = root;
    segments.forEach((segment, index) => {
      if (index === segments.length - 1) {
        node[segment] ??= `<${path}>`;
      } else {
        const next = node[segment];
        node = (typeof next === "object" && next !== null ? next : (node[segment] = {})) as Record<string, unknown>;
      }
    });
  }
  return root;
}

export function TemplatePreview({
  externalSystemId,
  channel,
  template,
  subject,
  initialPayload = "{}",
}: TemplatePreviewProps) {
  const [payloadText, setPayloadText] = useState(initialPayload);
  const [selectedView, setView]       = useState<View>("rendered");

  const parsed = useMemo(() => parsePayload(payloadText), [payloadText]);
  const input  = useDebounced(
    { externalSystemId, channel, template, subject, payload: "value" in parsed ? parsed.value : null },
    350,
  );

  const previewQuery = useQuery({
    queryKey: ["template-preview", input],
    queryFn: () =>
      previewNotificationTemplate({
        external_system_id: input.externalSystemId,
        channel:            input.channel,
        template:           input.template,
        subject:            input.subject,
        payload:            input.payload ?? {},
      }),
    enabled:          !!input.externalSystemId && input.payload !== null && input.template.trim() !== "",
    placeholderData:  keepPreviousData,
    retry:            false,
  });

  const result = previewQuery.data?.data;
  const issues = previewQuery.isError ? errorIssues(previewQuery.error) : [];

  const fillSample = () => {
    if (!result) return;
    const current = "value" in parsed ? parsed.value : {};
    setPayloadText(JSON.stringify({ ...skeletonFor(result.missing), ...current }, null, 2));
  };

  // On first load, seed the sample from the template's own variables so the
  // preview shows where each value lands instead of blank gaps. Only once,
  // and only while the user hasn't typed anything.
  const [autoFilled, setAutoFilled] = useState(false);
  if (!autoFilled && result && result.missing.length > 0 && payloadText === initialPayload) {
    setAutoFilled(true);
    setPayloadText(JSON.stringify(skeletonFor(result.missing), null, 2));
  }

  const views: ReadonlyArray<[View, string]> =
    channel === "email"
      ? [["rendered", "Email"], ["text", "Plain text"], ["source", "HTML source"]]
      : [["rendered", "Message"]];
  // switching channel can leave an email-only tab selected
  const view: View = views.some(([value]) => value === selectedView) ? selectedView : "rendered";

  return (
    <Card
      title="Preview"
      actions={
        <div className="flex gap-1" role="tablist" aria-label="Preview view">
          {views.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={view === value}
              onClick={() => setView(value)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium",
                view === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      <div className="flex flex-col gap-4" data-testid="template-preview">
        <TextAreaField
          label="Sample payload (JSON)"
          value={payloadText}
          onChange={(event) => setPayloadText(event.target.value)}
          error={"error" in parsed ? parsed.error : undefined}
          hint="The data your system sends with the notification. system.name and system.*_url are filled in for you."
          className="min-h-24 text-xs"
          spellCheck={false}
        />

        {!externalSystemId && (
          <p className="text-sm text-muted-foreground">Select an external system to see a preview.</p>
        )}

        {previewQuery.isError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
            <p className="flex items-center gap-1.5 font-medium">
              <CircleAlert className="size-4" />
              {issues.length > 0 ? "Fix these to see the preview" : errorMessage(previewQuery.error, "Preview failed")}
            </p>
            {issues.length > 0 && (
              <ul className="mt-1.5 list-disc pl-6" data-testid="preview-issues">
                {issues.map((issue) => <li key={issue}>{issue}</li>)}
              </ul>
            )}
          </div>
        )}

        {result && !previewQuery.isError && (
          <div className={cn("flex flex-col gap-3", previewQuery.isFetching && "opacity-70 transition-opacity")}>
            {result.missing.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs" data-testid="preview-missing">
                <Variable className="size-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Not in sample payload:</span>
                {result.missing.map((name) => (
                  <Badge key={name} variant="outline" className="font-mono">{name}</Badge>
                ))}
                <button type="button" onClick={fillSample} className="ml-1 text-primary hover:underline">
                  Add to sample
                </button>
              </div>
            )}

            {result.warnings.map((warning) => (
              <p key={warning} className="flex items-start gap-1.5 rounded-md bg-warning/15 p-2 text-xs text-warning-foreground" data-testid="preview-warning">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {warning}
              </p>
            ))}

            {result.subject !== null && (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Subject: </span>
                <span className="font-medium" data-testid="preview-subject">{result.subject}</span>
              </div>
            )}

            {view === "rendered" && result.channel === "email" && (
              // sandbox="" — no scripts, no forms, no top navigation; images still load
              <iframe
                title="Email preview"
                sandbox=""
                srcDoc={result.body}
                className="h-[560px] w-full rounded-md border bg-white"
                data-testid="preview-frame"
              />
            )}

            {view === "rendered" && result.channel !== "email" && (
              <div className="flex">
                <div
                  className="max-w-sm whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm bg-muted px-4 py-2.5 text-sm"
                  data-testid="preview-message"
                >
                  {result.body}
                </div>
              </div>
            )}

            {view === "text" && (
              <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs" data-testid="preview-text">
                {result.text}
              </pre>
            )}

            {view === "source" && (
              <pre className="max-h-[560px] overflow-auto rounded-md border bg-muted/30 p-3 text-xs">{result.body}</pre>
            )}

            {result.channel !== "email" && (
              <p className="text-xs text-muted-foreground">{result.body.length} characters</p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
