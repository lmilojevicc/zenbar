import { describe, expect, it } from "bun:test";

import { createQueryContext } from "../../../src/background/query-context.js";
import { runQueryEngine } from "../../../src/background/query-engine.js";
import { createAutofillHeuristicProvider } from "../../../src/background/providers/heuristic/autofill.js";
import { createFallbackHeuristicProvider } from "../../../src/background/providers/heuristic/fallback.js";
import { createHistoryUrlHeuristicProvider } from "../../../src/background/providers/heuristic/history-url.js";
import { MODES } from "../../../src/shared/constants.js";
import type { PermissionState, ResultItem, ZenbarSettings } from "../../../src/shared/types.js";

const baseSettings: ZenbarSettings = {
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
  adaptiveHistoryEnabled: false
};

const permissions: PermissionState = {
  bookmarks: true,
  history: true,
  duckduckgo: false
};

function createContext(rawInput: string, settings: ZenbarSettings = baseSettings) {
  return createQueryContext({
    requestId: `heuristic:${rawInput}`,
    mode: MODES.NEW_TAB,
    rawInput,
    currentTab: null,
    settings,
    permissions
  });
}

describe("heuristic providers", () => {
  it("uses fallback search heuristic for plain search queries", async () => {
    const provider = createFallbackHeuristicProvider();
    const [result] = await provider.start(createContext("cats"));

    expect(result).toMatchObject({
      type: "search-action",
      source: "searchAction",
      queryText: "cats",
      heuristic: true,
      providerId: "fallback-heuristic"
    });
  });

  it("uses fallback URL heuristic for URL-like queries", async () => {
    const provider = createFallbackHeuristicProvider();
    const [result] = await provider.start(createContext("example.com"));

    expect(result).toMatchObject({
      type: "url",
      source: "url",
      url: "https://example.com/",
      heuristic: true,
      providerId: "fallback-heuristic"
    });
  });

  it("prefers autofill heuristic over history-url and fallback", async () => {
    const autofillResult: ResultItem = {
      id: "autofill:example.com",
      type: "url",
      source: "url",
      url: "https://example.com/",
      title: "Example",
      providerId: "autofill-heuristic",
      heuristic: true,
      group: "heuristic",
      dedupeKey: "https://example.com/"
    };

    const context = createContext("example.com");
    const response = await runQueryEngine(context, [
      createFallbackHeuristicProvider(),
      createHistoryUrlHeuristicProvider({
        resolveResult: async () => ({
          id: "history:1",
          type: "history",
          source: "history",
          url: "https://example.com/",
          title: "Example History"
        })
      }),
      createAutofillHeuristicProvider({
        resolveResult: async () => autofillResult
      })
    ]);

    expect(response.defaultResult?.providerId).toBe("autofill-heuristic");
  });

  it("prefers history-url heuristic when autofill is absent", async () => {
    const context = createContext("example.com");
    const response = await runQueryEngine(context, [
      createFallbackHeuristicProvider(),
      createHistoryUrlHeuristicProvider({
        resolveResult: async () => ({
          id: "history:1",
          type: "history",
          source: "history",
          url: "https://example.com/",
          title: "Example History"
        })
      }),
      createAutofillHeuristicProvider({
        resolveResult: async () => null
      })
    ]);

    expect(response.defaultResult?.providerId).toBe("history-url-heuristic");
  });

  it("falls back when neither autofill nor history-url produce a result", async () => {
    const context = createContext("example.com/foo");
    const response = await runQueryEngine(context, [
      createFallbackHeuristicProvider(),
      createHistoryUrlHeuristicProvider({ resolveResult: async () => null }),
      createAutofillHeuristicProvider({ resolveResult: async () => null })
    ]);

    expect(response.defaultResult?.providerId).toBe("fallback-heuristic");
    expect(response.defaultResult?.type).toBe("url");
  });

  it("does not activate the history-url heuristic when history source is disabled", async () => {
    const context = createContext("example.com", {
      ...baseSettings,
      sources: {
        ...baseSettings.sources,
        history: false
      }
    });
    const provider = createHistoryUrlHeuristicProvider({
      resolveResult: async () => ({
        id: "history:1",
        type: "history",
        source: "history",
        url: "https://example.com/",
        title: "Example History"
      })
    });

    expect(await provider.isActive(context)).toBe(false);
  });

  it("does not activate autofill when all local sources are disabled", async () => {
    const context = createContext("example.com", {
      ...baseSettings,
      sources: {
        tabs: false,
        bookmarks: false,
        history: false
      }
    });
    const provider = createAutofillHeuristicProvider({
      resolveResult: async () => ({
        id: "autofill:example.com",
        type: "url",
        source: "url",
        url: "https://example.com/"
      })
    });

    expect(await provider.isActive(context)).toBe(false);
  });
});
