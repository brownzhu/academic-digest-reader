import type { DisplayMode } from "./state";

import { isTheme, readReadingData, writeReadingData } from "./reading-storage";

export async function loadDisplayMode(): Promise<DisplayMode> {
  const stored = await readReadingData();
  return isTheme(stored.displayMode) ? stored.displayMode : "system";
}

export async function saveDisplayMode(mode: DisplayMode): Promise<void> {
  await writeReadingData("displayMode", mode);
}

export function applyDisplayMode(mode: DisplayMode): void {
  document.documentElement.dataset.theme = mode;
}
