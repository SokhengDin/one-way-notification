// Variables every template can use without them being in the payload
// (filled in by the server's render step — see notifications.render.ts).

export interface TemplateVariable {
  readonly name:   string;
  readonly detail: string;
}

export const SYSTEM_VARIABLES: ReadonlyArray<TemplateVariable> = [
  { name: "system.name",             detail: "External system name" },
  { name: "system.logo_url",         detail: "Logo URL (brand asset)" },
  { name: "system.logo_dark_url",    detail: "Dark logo URL (brand asset)" },
  { name: "system.icon_url",         detail: "Icon URL (brand asset)" },
  { name: "system.email_header_url", detail: "Email header URL (brand asset)" },
];

/** Variable paths a template already references, so completion can offer them. */
export function variablesIn(template: string): ReadonlyArray<string> {
  const names = new Set<string>();
  for (const match of template.matchAll(/\{\{\{?\s*([A-Za-z0-9_.-]+)/g)) {
    names.add(match[1]!);
  }
  return [...names];
}

/**
 * Leaf key paths of a sample payload: {"order":{"id":1,"tags":["a"]}} →
 * ["order.id", "order.tags"]. Objects aren't offered themselves — inserting
 * one would render its JSON.
 */
export function payloadPaths(value: unknown, prefix = ""): ReadonlyArray<string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return prefix ? [prefix] : [];
  const entries = Object.entries(value);
  if (entries.length === 0) return prefix ? [prefix] : [];
  return entries.flatMap(([key, child]) => payloadPaths(child, prefix ? `${prefix}.${key}` : key));
}

/** Parse "template: Unclosed "{{" (at position 9)" issues into positions. */
export function issuePositions(
  issues: ReadonlyArray<string>,
  field: "template" | "subject",
): ReadonlyArray<{ readonly message: string; readonly position: number }> {
  return issues.flatMap((issue) => {
    const match = new RegExp(`^${field}: (.+) \\(at position (\\d+)\\)$`).exec(issue);
    return match ? [{ message: match[1]!, position: Number(match[2]) }] : [];
  });
}
