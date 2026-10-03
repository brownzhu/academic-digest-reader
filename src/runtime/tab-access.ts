export type ActiveTabKind = "gmail" | "other" | "unknown";

/**
 * With activeTab, Chrome may omit Tab.url even though executeScript is
 * authorized. Treat an absent URL as unknown and let script injection decide;
 * only reject a URL that is positively known to be outside Gmail.
 */
export function classifyActiveTabUrl(value: string | undefined): ActiveTabKind {
  if (!value) return "unknown";
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "mail.google.com" ? "gmail" : "other";
  } catch {
    return "other";
  }
}

export function isInjectionPermissionError(message: string): boolean {
  return /cannot access contents|missing host permission|cannot be scripted|permission/i.test(message);
}
