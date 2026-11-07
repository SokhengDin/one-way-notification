// Pure, dependency-free template engine for notification templates.
//
// Syntax
//   {{ path }}                  value, HTML-escaped when `escapeHtml` is on
//   {{{ path }}}                raw value, never escaped (trusted HTML)
//   {{ path | default: "x" }}   fallback when the value is missing, null or ""
//   \{{                         a literal "{{"
//
// `path` is a dotted lookup into the render context: `name`, `order.id`,
// `items.0.title`. Segments are identifiers (letters, digits, `_`, `-`) or
// array indexes.
//
// Parsing is separate from rendering so a template can be validated when it
// is saved (`parseTemplate`) and rendered many times later (`renderTemplate`).

export type TemplateNode =
  | { readonly kind: "text"; readonly value: string }
  | {
      readonly kind:     "var";
      readonly path:     ReadonlyArray<string>;
      readonly raw:      boolean;
      readonly fallback: string | undefined;
      readonly source:   string;
    };

export interface TemplateIssue {
  readonly message: string;
  readonly offset:  number;
}

export type ParseResult =
  | { readonly ok: true;  readonly nodes:  ReadonlyArray<TemplateNode> }
  | { readonly ok: false; readonly issues: ReadonlyArray<TemplateIssue> };

export interface RenderOptions {
  readonly escapeHtml: boolean;
}

export interface RenderResult {
  readonly output:  string;
  readonly missing: ReadonlyArray<string>;
}

const SEGMENT        = /^(?:[A-Za-z_][A-Za-z0-9_-]*|\d+)$/;
const DEFAULT_FILTER = /^default\s*:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')$/;

const HTML_ESCAPES: Record<string, string> = {
  "&":  "&amp;",
  "<":  "&lt;",
  ">":  "&gt;",
  '"':  "&quot;",
  "'":  "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]!);
}

function unescapeQuoted(value: string): string {
  return value.replace(/\\(.)/g, "$1");
}

function parseExpression(
  body:   string,
  offset: number,
  raw:    boolean,
  source: string,
): TemplateNode | TemplateIssue {
  const [pathPart, ...filterParts] = body.split("|");
  const pathText = (pathPart ?? "").trim();

  if (pathText.length === 0) {
    return { message: "Empty expression", offset };
  }

  const path = pathText.split(".");
  if (!path.every((segment) => SEGMENT.test(segment))) {
    return { message: `Invalid variable name "${pathText}"`, offset };
  }

  let fallback: string | undefined;

  if (filterParts.length > 1) {
    return { message: `Only one filter is supported in "${source}"`, offset };
  }

  if (filterParts.length === 1) {
    const filterText = filterParts[0]!.trim();
    const match      = DEFAULT_FILTER.exec(filterText);
    if (!match) {
      return {
        message: `Unknown filter "${filterText}" — only default: "value" is supported`,
        offset,
      };
    }
    fallback = unescapeQuoted(match[1] ?? match[2] ?? "");
  }

  return { kind: "var", path, raw, fallback, source };
}

export function parseTemplate(template: string): ParseResult {
  const nodes:  Array<TemplateNode>  = [];
  const issues: Array<TemplateIssue> = [];

  let text   = "";
  let cursor = 0;

  const flushText = () => {
    if (text.length > 0) {
      nodes.push({ kind: "text", value: text });
      text = "";
    }
  };

  while (cursor < template.length) {
    // escaped opener
    if (template.startsWith("\\{{", cursor)) {
      text   += "{{";
      cursor += 3;
      continue;
    }

    // A bare "}}" is deliberately not an error: nested CSS in email HTML
    // (`@media (...) { a { color: red }}`) produces it legitimately.
    if (!template.startsWith("{{", cursor)) {
      text   += template[cursor];
      cursor += 1;
      continue;
    }

    const raw    = template.startsWith("{{{", cursor);
    const open   = raw ? "{{{" : "{{";
    const close  = raw ? "}}}" : "}}";
    const start  = cursor + open.length;
    const end    = template.indexOf(close, start);
    const nextOp = template.indexOf("{{", start);

    if (end === -1 || (nextOp !== -1 && nextOp < end)) {
      issues.push({ message: `Unclosed "${open}"`, offset: cursor });
      // skip past the opener so we keep scanning for further problems
      cursor = start;
      continue;
    }

    const source = template.slice(cursor, end + close.length);
    const parsed = parseExpression(template.slice(start, end), cursor, raw, source);

    if ("kind" in parsed) {
      flushText();
      nodes.push(parsed);
    } else {
      issues.push(parsed);
    }

    cursor = end + close.length;
  }

  flushText();

  return issues.length > 0 ? { ok: false, issues } : { ok: true, nodes };
}

function lookup(context: unknown, path: ReadonlyArray<string>): unknown {
  let current: unknown = context;
  for (const segment of path) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    // own properties only — never walk into the prototype chain
    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

export function renderNodes(
  nodes:   ReadonlyArray<TemplateNode>,
  context: Record<string, unknown>,
  options: RenderOptions,
): RenderResult {
  const missing = new Set<string>();
  let output    = "";

  for (const node of nodes) {
    if (node.kind === "text") {
      output += node.value;
      continue;
    }

    const value   = lookup(context, node.path);
    const isEmpty = value === undefined || value === null || value === "";

    let rendered: string;
    if (isEmpty) {
      if (node.fallback === undefined) {
        missing.add(node.path.join("."));
      }
      rendered = node.fallback ?? "";
    } else {
      rendered = stringify(value);
    }

    output += options.escapeHtml && !node.raw ? escapeHtml(rendered) : rendered;
  }

  return { output, missing: [...missing] };
}

export function renderTemplate(
  template: string,
  context:  Record<string, unknown>,
  options:  RenderOptions,
): RenderResult | { readonly issues: ReadonlyArray<TemplateIssue> } {
  const parsed = parseTemplate(template);
  if (!parsed.ok) {
    return { issues: parsed.issues };
  }
  return renderNodes(parsed.nodes, context, options);
}

/** Every variable path a template references, in order of first use. */
export function templateVariables(nodes: ReadonlyArray<TemplateNode>): ReadonlyArray<string> {
  const seen = new Set<string>();
  for (const node of nodes) {
    if (node.kind === "var") seen.add(node.path.join("."));
  }
  return [...seen];
}

/** Best-effort HTML → plain text, used for the text/plain part of an email. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|table)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
      const text = label.replace(/<[^>]+>/g, "").trim();
      return text && text !== href ? `${text} (${href})` : href;
    })
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
