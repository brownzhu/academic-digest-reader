import type { DisplayMode } from "./state";

const DISPLAY_MODE_KEY = "displayMode";

function isDisplayMode(value: unknown): value is DisplayMode {
  return value === "system" || value === "light" || value === "dark";
}

export async function loadDisplayMode(): Promise<DisplayMode> {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    const stored = await chrome.storage.local.get(DISPLAY_MODE_KEY);
    return isDisplayMode(stored[DISPLAY_MODE_KEY]) ? stored[DISPLAY_MODE_KEY] : "system";
  }
  const stored = globalThis.localStorage?.getItem(DISPLAY_MODE_KEY);
  return isDisplayMode(stored) ? stored : "system";
}

export async function saveDisplayMode(mode: DisplayMode): Promise<void> {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    await chrome.storage.local.set({ [DISPLAY_MODE_KEY]: mode });
    return;
  }
  globalThis.localStorage?.setItem(DISPLAY_MODE_KEY, mode);
}

export function applyDisplayMode(mode: DisplayMode): void {
  document.documentElement.dataset.theme = mode;
}
