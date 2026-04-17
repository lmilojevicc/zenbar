import { DEFAULT_RESULT_SOURCE_ORDER, DEFAULT_SETTINGS, SETTINGS_KEY } from "./constants.js";
import type { RawZenbarSettings, ResultSourceOrderItem, ZenbarSettings } from "./types.js";

let pendingSettingsWrite: Promise<ZenbarSettings> = Promise.resolve(cloneDefaultSettings());

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
    commandPosition: rawSettings.commandPosition === "top" ? "top" : "center",
    suggestionProvider: rawSettings.suggestionProvider === "duckduckgo" ? "duckduckgo" : "off",
    adaptiveHistoryEnabled: rawSettings.adaptiveHistoryEnabled === true,
    resultSourceOrder: normalizeResultSourceOrder(rawSettings.resultSourceOrder)
  };
}

function normalizeResultSourceOrder(rawOrder: RawZenbarSettings["resultSourceOrder"]): ResultSourceOrderItem[] {
  const requestedOrder = Array.isArray(rawOrder) ? rawOrder : [];
  const normalizedOrder: ResultSourceOrderItem[] = [];
  const seen = new Set<ResultSourceOrderItem>();

  for (const item of requestedOrder) {
    if (!isResultSourceOrderItem(item) || seen.has(item)) {
      continue;
    }

    normalizedOrder.push(item);
    seen.add(item);
  }

  for (const item of DEFAULT_RESULT_SOURCE_ORDER) {
    if (seen.has(item)) {
      continue;
    }

    normalizedOrder.push(item);
  }

  return normalizedOrder;
}

function isResultSourceOrderItem(value: string): value is ResultSourceOrderItem {
  return DEFAULT_RESULT_SOURCE_ORDER.includes(value as ResultSourceOrderItem);
}

export async function ensureSettings(): Promise<ZenbarSettings> {
  return mergeSettings((await getStoredRawSettings()) ?? {});
}

export async function getSettings(): Promise<ZenbarSettings> {
  const rawSettings = await getStoredRawSettings();
  return mergeSettings(rawSettings);
}

export async function saveSettings(nextSettings: RawZenbarSettings): Promise<ZenbarSettings> {
  return enqueueSettingsWrite(async () => await persistSettings(nextSettings));
}

export async function patchSettings(patch: RawZenbarSettings): Promise<ZenbarSettings> {
  return enqueueSettingsWrite(async () => {
    const current = mergeSettings(await getStoredRawSettings());

    return await persistSettings({
      ...current,
      ...patch,
      sources: {
        ...current.sources,
        ...patch.sources
      }
    });
  });
}

async function getStoredRawSettings(): Promise<RawZenbarSettings | undefined> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return stored[SETTINGS_KEY] as RawZenbarSettings | undefined;
}

async function persistSettings(nextSettings: RawZenbarSettings): Promise<ZenbarSettings> {
  const merged = mergeSettings(nextSettings);
  await chrome.storage.local.set({ [SETTINGS_KEY]: merged });
  return merged;
}

function enqueueSettingsWrite(operation: () => Promise<ZenbarSettings>): Promise<ZenbarSettings> {
  const nextWrite = pendingSettingsWrite
    .catch(() => cloneDefaultSettings())
    .then(operation);

  pendingSettingsWrite = nextWrite;
  return nextWrite;
}
