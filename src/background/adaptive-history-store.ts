import { normalizeText } from "../shared/utils.js";

import type { ResultItem, ZenbarSettings } from "../shared/types.js";

export const ADAPTIVE_HISTORY_STORAGE_KEY = "zenbar.adaptiveHistory.v1";

export interface AdaptiveHistoryMatch {
  query: string;
  result: ResultItem;
  count: number;
  updatedAt: number;
  dedupeKey: string;
}

interface AdaptiveHistoryStorage {
  get: (key: string) => Promise<Record<string, unknown>>;
  set: (values: Record<string, unknown>) => Promise<void>;
  remove: (key: string) => Promise<void>;
}

type AdaptiveHistoryMap = Record<string, AdaptiveHistoryMatch[]>;

export function createAdaptiveHistoryStore(storage: AdaptiveHistoryStorage = chrome.storage.local) {
  return {
    recordSelection,
    getAdaptiveMatches,
    clearAdaptiveHistory
  };

  async function recordSelection(query: string, result: ResultItem, settings: ZenbarSettings): Promise<void> {
    if (!settings.adaptiveHistoryEnabled) {
      return;
    }

    const normalizedQuery = normalizeText(query);

    if (!normalizedQuery) {
      return;
    }

    const history = await readHistory();
    const currentEntries = history[normalizedQuery] ?? [];
    const dedupeKey = result.dedupeKey ?? result.url ?? result.queryText ?? result.id;
    const existingEntry = currentEntries.find((entry) => entry.dedupeKey === dedupeKey);
    const nextEntry: AdaptiveHistoryMatch = existingEntry
      ? {
          ...existingEntry,
          result: {
            ...existingEntry.result,
            ...result,
            dedupeKey
          },
          count: existingEntry.count + 1,
          updatedAt: Date.now()
        }
      : {
          query: normalizedQuery,
          result: {
            ...result,
            dedupeKey
          },
          count: 1,
          updatedAt: Date.now(),
          dedupeKey
        };

    history[normalizedQuery] = [
      nextEntry,
      ...currentEntries.filter((entry) => entry.dedupeKey !== dedupeKey)
    ].sort((left, right) => right.count - left.count || right.updatedAt - left.updatedAt);

    await storage.set({
      [ADAPTIVE_HISTORY_STORAGE_KEY]: history
    });
  }

  async function getAdaptiveMatches(query: string, settings: ZenbarSettings): Promise<AdaptiveHistoryMatch[]> {
    if (!settings.adaptiveHistoryEnabled) {
      return [];
    }

    const normalizedQuery = normalizeText(query);

    if (!normalizedQuery) {
      return [];
    }

    const history = await readHistory();
    return history[normalizedQuery] ?? [];
  }

  async function clearAdaptiveHistory(): Promise<void> {
    await storage.remove(ADAPTIVE_HISTORY_STORAGE_KEY);
  }

  async function readHistory(): Promise<AdaptiveHistoryMap> {
    const stored = await storage.get(ADAPTIVE_HISTORY_STORAGE_KEY);
    const history = stored[ADAPTIVE_HISTORY_STORAGE_KEY];

    if (!history || typeof history !== "object") {
      return {};
    }

    return history as AdaptiveHistoryMap;
  }
}
