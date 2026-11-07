// Channel-aware rendering: template engine + branding + email layout.
// Pure (no Effect, no IO) so every rule here is unit-testable directly.

import type { AssetKind, BrandAssetRecord, ChannelType } from "@repo/schema";
import { logoDisplaySize, wrapEmail } from "./email-layout";
import {
  htmlToText,
  parseTemplate,
  renderNodes,
  templateVariables,
  type TemplateIssue,
} from "./template-engine";

export const SMS_SEGMENT_LENGTH  = 160;
export const TELEGRAM_MAX_LENGTH = 4096;
export const SUBJECT_MAX_LENGTH  = 255;

export interface TemplateFields {
  readonly channel:  ChannelType;
  readonly template: string;
  readonly subject:  string | null;
}

export interface RenderInput extends TemplateFields {
  readonly payload:    Record<string, unknown>;
  readonly systemName: string;
  readonly assets:     ReadonlyArray<BrandAssetRecord>;
  /** Absolute base for asset URLs, e.g. https://notify.example.com */
  readonly publicUrl:  string;
}

export interface RenderOutput {
  readonly channel:   ChannelType;
  readonly subject:   string | null;
  readonly body:      string;
  readonly text:      string | null;
  readonly variables: ReadonlyArray<string>;
  readonly missing:   ReadonlyArray<string>;
  readonly warnings:  ReadonlyArray<string>;
}

const describe = (field: string, issues: ReadonlyArray<TemplateIssue>) =>
  issues.map((issue) => `${field}: ${issue.message} (at position ${issue.offset})`);

/**
 * Save-time rules. Returns human-readable problems; empty means valid.
 * A subject is required for email. Other channels may store one (it is
 * still syntax-checked) but it is ignored when rendering.
 */
export function validateTemplateFields(fields: TemplateFields): ReadonlyArray<string> {
  const problems: Array<string> = [];

  if (fields.template.trim().length === 0) {
    problems.push("template: must not be empty");
  } else {
    const parsed = parseTemplate(fields.template);
    if (!parsed.ok) problems.push(...describe("template", parsed.issues));
  }

  if (fields.channel === "email") {
    if (fields.subject === null || fields.subject.trim().length === 0) {
      problems.push("subject: is required for email templates");
    }
  }

  if (fields.subject !== null && fields.subject.trim().length > 0) {
    if (fields.subject.length > SUBJECT_MAX_LENGTH) {
      problems.push(`subject: must be at most ${SUBJECT_MAX_LENGTH} characters`);
    }
    if (/[\r\n]/.test(fields.subject)) {
      problems.push("subject: must be a single line");
    }
    const parsed = parseTemplate(fields.subject);
    if (!parsed.ok) problems.push(...describe("subject", parsed.issues));
  }

  return problems;
}

const RASTER_TYPES = new Set(["image/png", "image/jpeg", "image/gif"]);

function assetUrl(publicUrl: string, asset: BrandAssetRecord | undefined): string | null {
  return asset ? `${publicUrl.replace(/\/+$/, "")}${asset.url}` : null;
}

/** The variables every template can use without them being in the payload. */
export function systemContext(input: Pick<RenderInput, "systemName" | "assets" | "publicUrl">) {
  const byKind = (kind: AssetKind) => input.assets.find((asset) => asset.kind === kind);
  return {
    name:             input.systemName,
    logo_url:         assetUrl(input.publicUrl, byKind("logo")),
    logo_dark_url:    assetUrl(input.publicUrl, byKind("logo_dark")),
    icon_url:         assetUrl(input.publicUrl, byKind("icon")),
    email_header_url: assetUrl(input.publicUrl, byKind("email_header")),
  };
}

export function renderForChannel(input: RenderInput): RenderOutput | { readonly problems: ReadonlyArray<string> } {
  const problems = validateTemplateFields(input);
  if (problems.length > 0) {
    return { problems };
  }

  const warnings: Array<string> = [];

  if (Object.prototype.hasOwnProperty.call(input.payload, "system")) {
    warnings.push('payload key "system" is reserved for built-in variables (system.name, system.logo_url, …) and was ignored');
  }

  const context = { ...input.payload, system: systemContext(input) };

  const bodyParsed    = parseTemplate(input.template);
  const subjectParsed = input.subject !== null ? parseTemplate(input.subject) : null;
  // validated above, so both parse
  const bodyNodes    = bodyParsed.ok ? bodyParsed.nodes : [];
  const subjectNodes = subjectParsed?.ok ? subjectParsed.nodes : [];

  const isEmail = input.channel === "email";
  const body    = renderNodes(bodyNodes, context, { escapeHtml: isEmail });
  // subjects are plain text headers: never HTML-escaped
  const subject = subjectParsed ? renderNodes(subjectNodes, context, { escapeHtml: false }) : null;

  const variables = [...new Set([...templateVariables(subjectNodes), ...templateVariables(bodyNodes)])];
  const missing   = [...new Set([...(subject?.missing ?? []), ...body.missing])];

  if (!isEmail) {
    if (input.channel === "sms" && body.output.length > SMS_SEGMENT_LENGTH) {
      const segments = Math.ceil(body.output.length / 153);
      warnings.push(`SMS is ${body.output.length} characters and will be sent as ${segments} segments`);
    }
    if (input.channel === "telegram" && body.output.length > TELEGRAM_MAX_LENGTH) {
      warnings.push(`Telegram messages are limited to ${TELEGRAM_MAX_LENGTH} characters; this one is ${body.output.length}`);
    }
    return {
      channel: input.channel,
      subject: null,
      body:    body.output,
      text:    null,
      variables,
      missing,
      warnings,
    };
  }

  // Header image: dedicated email header, else the logo. Prefer formats
  // every mail client renders; SVG/WebP are used only as a last resort.
  const candidates = ["email_header", "logo"]
    .map((kind) => input.assets.find((asset) => asset.kind === kind))
    .filter((asset): asset is BrandAssetRecord => asset !== undefined);
  const headerAsset = candidates.find((asset) => RASTER_TYPES.has(asset.content_type)) ?? candidates[0];

  if (headerAsset && !RASTER_TYPES.has(headerAsset.content_type)) {
    const format = headerAsset.content_type === "image/svg+xml" ? "SVG" : headerAsset.content_type;
    warnings.push(`Header logo is ${format}, which Gmail and Outlook don't display — upload a PNG or JPEG ${headerAsset.kind}`);
  }

  const renderedSubject = subject!.output;
  const html = wrapEmail({
    subject:  renderedSubject,
    bodyHtml: body.output,
    branding: {
      systemName: input.systemName,
      logoUrl:    assetUrl(input.publicUrl, headerAsset),
      logoWidth:  headerAsset?.width ?? null,
      logoHeight: headerAsset?.height ?? null,
    },
  });

  if (headerAsset) {
    const shown = logoDisplaySize(headerAsset.width, headerAsset.height);
    if (headerAsset.width !== null && headerAsset.width < shown.width * 2) {
      warnings.push(`Header logo is ${headerAsset.width}px wide; use at least ${shown.width * 2}px so it stays sharp on high-DPI screens`);
    }
  }

  return {
    channel: "email",
    subject: renderedSubject,
    body:    html,
    text:    htmlToText(body.output),
    variables,
    missing,
    warnings,
  };
}
