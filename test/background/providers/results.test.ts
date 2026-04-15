import { describe, expect, it } from "bun:test";

import { createAdaptiveHistoryStore } from "../../../src/background/adaptive-history-store.js";
import { createQueryContext } from "../../../src/background/query-context.js";
import { createBookmarksResultsProvider } from "../../../src/background/providers/results/bookmarks.js";
import { createHistoryResultsProvider } from "../../../src/background/providers/results/history.js";
import { createInputHistoryResultsProvider } from "../../../src/background/providers/results/input-history.js";
import { createSuggestionsResultsProvider } from "../../../src/background/providers/results/suggestions.js";
import { createTabsResultsProvider } from "../../../src/background/providers/results/tabs.js";
import { MODES } from "../../../src/shared/constants.js";
import type { PermissionState, ZenbarSettings } from "../../../src/shared/types.js";

const settings: ZenbarSettings = {
  sources: {
    tabs: true,
    bookmarks: true,
    history: true
  },
  commandPosition: "center",
  suggestionProvider: "duckduckgo",
  adaptiveHistoryEnabled: true
};

const permissions: PermissionState = {
  bookmarks: true,
  history: true,
  duckduckgo: true
};

function createContext(rawInput: string) {
  return createQueryContext({
    requestId: `results:${rawInput}`,
    mode: MODES.NEW_TAB,
    rawInput,
    currentTab: {
      id: 1,
      windowId: 10,
      url: "https://current.example",
      title: "Current",
      active: true
    } as chrome.tabs.Tab,
    settings,
    permissions
  });
}

describe("results providers", () => {
  it("builds tab candidates from matching open tabs", async () => {
    const provider = createTabsResultsProvider({
      queryTabsForWindow: async () => [
        {
          id: 2,
          windowId: 10,
          url: "https://cats.example",
          title: "Cats",
          favIconUrl: ""
        } as chrome.tabs.Tab
      ]
    });

    const [result] = await provider.start(createContext("cats"));

    expect(result).toMatchObject({
      type: "tab",
      source: "tabs",
      url: "https://cats.example",
      providerId: "tabs-results",
      group: "tabs"
    });
  });

  it("builds bookmark candidates and links open tabs by normalized URL", async () => {
    const provider = createBookmarksResultsProvider({
      searchBookmarks: async () => [
        {
          id: "bookmark-1",
          title: "Cats Bookmark",
          url: "https://cats.example/"
        } as chrome.bookmarks.BookmarkTreeNode
      ],
      queryTabsForWindow: async () => [
        {
          id: 2,
          windowId: 10,
          url: "https://cats.example",
          title: "Cats Tab",
          favIconUrl: ""
        } as chrome.tabs.Tab
      ]
    });

    const [result] = await provider.start(createContext("cats"));

    expect(result).toMatchObject({
      type: "bookmark",
      source: "bookmarks",
      openTabId: 2,
      providerId: "bookmarks-results",
      group: "bookmarks"
    });
  });

  it("builds history candidates when history permission is enabled", async () => {
    const provider = createHistoryResultsProvider({
      searchHistory: async () => [
        {
          id: "history-1",
          title: "Cats History",
          url: "https://cats.example/"
        } as chrome.history.HistoryItem
      ],
      queryTabsForWindow: async () => []
    });

    const [result] = await provider.start(createContext("cats"));

    expect(result).toMatchObject({
      type: "history",
      source: "history",
      providerId: "history-results",
      group: "history"
    });
  });

  it("suppresses search suggestions for URL-like input", async () => {
    const provider = createSuggestionsResultsProvider({
      fetchSuggestions: async () => ["example.com docs"]
    });

    expect(await provider.start(createContext("example.com"))).toEqual([]);
  });

  it("reads adaptive matches only when enabled", async () => {
    const bucket = new Map<string, unknown>();
    const store = createAdaptiveHistoryStore({
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
    });

    await store.recordSelection("cats", {
      id: "search:cats",
      type: "search-action",
      source: "searchAction",
      title: 'Search "cats"',
      queryText: "cats"
    }, settings);

    const provider = createInputHistoryResultsProvider(store);
    const [result] = await provider.start(createContext("cats"));

    expect(result).toMatchObject({
      queryText: "cats",
      providerId: "input-history-results",
      group: "input-history"
    });
  });
});
