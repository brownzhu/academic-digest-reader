/** Only this allowlist is migrated to Chrome Sync. Email content never belongs here. */
export const FLAGS_PREFIX = "reader.flags.v1.";
const MIGRATED = "reader.syncMigration.v1";

export function isReadingFlags(value: unknown): value is { saved: boolean; read: boolean } {
  return Boolean(value && typeof value === "object" &&
    typeof (value as { saved?: unknown }).saved === "boolean" &&
    typeof (value as { read?: unknown }).read === "boolean");
}

export function isTheme(value: unknown): value is "system" | "light" | "dark" {
  return value === "system" || value === "light" || value === "dark";
}

export function hasChromeSync(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.sync);
}

export function readingStorageNotice(): string {
  return hasChromeSync()
    ? "Chrome Sync: saved/read marks and theme. Enable extension sync on the same Chrome account and use the same extension ID on each device. Email text is not uploaded."
    : "Local preview: saved/read marks and theme stay on this device. Chrome account sync is available in the installed extension.";
}

function allowed(entries: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entries)) {
    if (key === "displayMode" && isTheme(value)) result[key] = value;
    // Reconstruct the object: never carry extra local fields into Sync.
    if (key.startsWith(FLAGS_PREFIX) && isReadingFlags(value)) result[key] = { saved: value.saved, read: value.read };
  }
  return result;
}

export async function readReadingData(): Promise<Record<string, unknown>> {
  if (hasChromeSync()) {
    const [remote, local] = await Promise.all([chrome.storage.sync.get(null), chrome.storage.local.get(null)]);
    if (local[MIGRATED] !== true) {
      const missing = Object.fromEntries(Object.entries(allowed(local)).filter(([key]) => !Object.hasOwn(remote, key)));
      if (Object.keys(missing).length) await chrome.storage.sync.set(missing);
      // Do not erase old local records. A failed migration remains retryable,
      // while a completed migration cannot resurrect subsequently removed marks.
      await chrome.storage.local.set({ [MIGRATED]: true });
      return allowed({ ...missing, ...remote });
    }
    return allowed(remote);
  }
  if (typeof chrome !== "undefined" && chrome.storage?.local) return allowed(await chrome.storage.local.get(null));
  const entries: Record<string, unknown> = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)!;
    const raw = localStorage.getItem(key)!;
    if (key === "displayMode") entries[key] = raw;
    else if (key.startsWith(FLAGS_PREFIX)) {
      try { entries[key] = JSON.parse(raw); } catch { /* Invalid records are ignored. */ }
    }
  }
  return allowed(entries);
}

export async function writeReadingData(key: string, value: unknown): Promise<void> {
  const payload = allowed({ [key]: value });
  if (!Object.hasOwn(payload, key)) throw new Error("Invalid reading preference.");
  if (hasChromeSync()) {
    // Offline delivery and retries belong to Chrome. Resolving this write is
    // not proof that another device has received it. Never silently fall back.
    await chrome.storage.sync.set(payload);
  } else if (typeof chrome !== "undefined" && chrome.storage?.local) {
    await chrome.storage.local.set(payload);
  } else localStorage.setItem(key, key === "displayMode" ? String(value) : JSON.stringify(payload[key]));
}

export function observeReadingData(callback: (changes: Record<string, chrome.storage.StorageChange>) => void): () => void {
  if (typeof chrome === "undefined" || !chrome.storage?.onChanged) return () => {};
  const area = hasChromeSync() ? "sync" : "local";
  const listener = (changes: Record<string, chrome.storage.StorageChange>, namespace: string) => {
    if (namespace === area) callback(changes);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
