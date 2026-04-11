import { DEFAULT_SETTINGS, SETTINGS_KEY } from "./constants.js";

export function cloneDefaultSettings() {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

export function mergeSettings(rawSettings = {}) {
  const defaults = cloneDefaultSettings();

  return {
    ...defaults,
    ...rawSettings,
    sources: {
      ...defaults.sources,
      ...rawSettings.sources
    },
    weights: {
      ...defaults.weights,
      ...rawSettings.weights
    },
    suggestionProvider: rawSettings.suggestionProvider === "duckduckgo" ? "duckduckgo" : "off"
  };
}

export async function ensureSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const rawSettings = stored[SETTINGS_KEY] ?? null;
  const merged = mergeSettings(rawSettings ?? {});

  if (JSON.stringify(rawSettings) !== JSON.stringify(merged)) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: merged });
  }

  return merged;
}

export async function getSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return mergeSettings(stored[SETTINGS_KEY]);
}

export async function saveSettings(nextSettings) {
  const merged = mergeSettings(nextSettings);
  await chrome.storage.local.set({ [SETTINGS_KEY]: merged });
  return merged;
}

export async function patchSettings(patch) {
  const current = await getSettings();

  return saveSettings({
    ...current,
    ...patch,
    sources: {
      ...current.sources,
      ...patch?.sources
    },
    weights: {
      ...current.weights,
      ...patch?.weights
    }
  });
}
