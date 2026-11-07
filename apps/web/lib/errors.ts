// Typed API errors arrive as Error subclasses carrying the server's fields.
// These helpers pull out what the UI shows without caring which domain the
// error came from.

export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** Per-field problems from a 422 (e.g. NotificationTemplateInvalid.issues). */
export function errorIssues(error: unknown): ReadonlyArray<string> {
  if (typeof error === "object" && error !== null && "issues" in error) {
    const issues = (error as { issues: unknown }).issues;
    if (Array.isArray(issues) && issues.every((issue) => typeof issue === "string")) {
      return issues;
    }
  }
  return [];
}

export function errorTag(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "_tag" in error) {
    const tag = (error as { _tag: unknown })._tag;
    return typeof tag === "string" ? tag : undefined;
  }
  return undefined;
}
