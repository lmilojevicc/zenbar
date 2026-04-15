import { DEFAULT_SETTINGS, SETTINGS_KEY } from "./constants.js";
import type { RawZenbarSettings, ZenbarSettings } from "./types.js";

export function cloneDefaultSettings(): ZenbarSettings {
  return structuredClone(DEFAULT_SETTINGS);
}

export function mergeSettings(rawSettings: RawZenbarSettings = {}): ZenbarSettings {
  const defaults = cloneDefaultSettings();

  return {
    ...defaults,
    sources: {
      ...defaults.sources,
      ...rawSettings.sources
    },
    suggestionProvider: rawSettings.suggestionProvider === "duckduckgo" ? "duckduckgo" : "off",
    adaptiveHistoryEnabled: rawSettings.adaptiveHistoryEnabled === true
  };
}

export async function ensureSettings(): Promise<ZenbarSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const rawSettings = stored[SETTINGS_KEY] as RawZenbarSettings | null | undefined;
  const merged = mergeSettings(rawSettings ?? {});

  if (JSON.stringify(rawSettings) !== JSON.stringify(merged)) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: merged });
  }

  return merged;
}

export async function getSettings(): Promise<ZenbarSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return mergeSettings(stored[SETTINGS_KEY] as RawZenbarSettings | undefined);
}

export async function saveSettings(nextSettings: RawZenbarSettings): Promise<ZenbarSettings> {
  const merged = mergeSettings(nextSettings);
  await chrome.storage.local.set({ [SETTINGS_KEY]: merged });
  return merged;
}

export async function patchSettings(patch: RawZenbarSettings): Promise<ZenbarSettings> {
  const current = await getSettings();

  return saveSettings({
    ...current,
    ...patch,
    sources: {
      ...current.sources,
      ...patch.sources
    }
  });
}
