import { describe, expect, it } from "bun:test";

import {
  ADAPTIVE_HISTORY_STORAGE_KEY,
  createAdaptiveHistoryStore
} from "../../src/background/adaptive-history-store.js";
import type { ResultItem, ZenbarSettings } from "../../src/shared/types.js";

const enabledSettings: ZenbarSettings = {
  sources: {
    tabs: true,
    bookmarks: true,
    history: true
  },
  weights: {
    searchAction: 1.18,
    tabs: 1.04,
    bookmarks: 0.96,
    history: 0.88,
    suggestions: 0.84,
    currentWindowTabs: 0.35
  },
  suggestionProvider: "off",
  adaptiveHistoryEnabled: true
};

const disabledSettings: ZenbarSettings = {
  ...enabledSettings,
  adaptiveHistoryEnabled: false
};

function createStorage() {
  const bucket = new Map<string, unknown>();

  return {
    bucket,
    storage: {
      async get(key: string) {
        return { [key]: bucket.get(key) };
      },
      async set(values: Record<string, unknown>) {
        for (const [key, value] of Object.entries(values)) {
          bucket.set(key, value);
        }
      },
      async remove(key: string) {
        bucket.delete(key);
      }
    }
  };
}

const pickedResult: ResultItem = {
  id: "search:cats",
  type: "search-action",
  source: "searchAction",
  title: 'Search "cats"',
  queryText: "cats"
};

describe("createAdaptiveHistoryStore", () => {
  it("does not write when adaptive history is disabled", async () => {
    const { bucket, storage } = createStorage();
    const store = createAdaptiveHistoryStore(storage);

    await store.recordSelection("cats", pickedResult, disabledSettings);

    expect(bucket.has(ADAPTIVE_HISTORY_STORAGE_KEY)).toBe(false);
  });

  it("returns no adaptive matches when disabled", async () => {
    const { storage } = createStorage();
    const store = createAdaptiveHistoryStore(storage);

    expect(await store.getAdaptiveMatches("cats", disabledSettings)).toEqual([]);
  });

  it("reads and writes learned entries when enabled", async () => {
    const { storage } = createStorage();
    const store = createAdaptiveHistoryStore(storage);

    await store.recordSelection("cats", pickedResult, enabledSettings);

    expect(await store.getAdaptiveMatches("cats", enabledSettings)).toEqual([
      expect.objectContaining({
        query: "cats",
        result: expect.objectContaining({
          id: "search:cats"
        }),
        count: 1
      })
    ]);
  });

  it("clears learned entries", async () => {
    const { bucket, storage } = createStorage();
    const store = createAdaptiveHistoryStore(storage);

    await store.recordSelection("cats", pickedResult, enabledSettings);
    await store.clearAdaptiveHistory();

    expect(bucket.has(ADAPTIVE_HISTORY_STORAGE_KEY)).toBe(false);
    expect(await store.getAdaptiveMatches("cats", enabledSettings)).toEqual([]);
  });

  it("collapses semantic duplicates by dedupe key instead of result id", async () => {
    const { storage } = createStorage();
    const store = createAdaptiveHistoryStore(storage);

    await store.recordSelection("example", {
      id: "history:1",
      type: "history",
      source: "history",
      url: "https://example.com/",
      dedupeKey: "https://example.com/"
    }, enabledSettings);

    await store.recordSelection("example", {
      id: "bookmark:1",
      type: "bookmark",
      source: "bookmarks",
      url: "https://example.com/",
      dedupeKey: "https://example.com/"
    }, enabledSettings);

    expect(await store.getAdaptiveMatches("example", enabledSettings)).toEqual([
      expect.objectContaining({
        count: 2,
        result: expect.objectContaining({
          dedupeKey: "https://example.com/"
        })
      })
    ]);
  });
});
