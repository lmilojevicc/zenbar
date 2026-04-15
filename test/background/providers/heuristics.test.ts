import { describe, expect, it } from "bun:test";

import { createQueryContext } from "../../../src/background/query-context.js";
import { runQueryEngine } from "../../../src/background/query-engine.js";
import { createFallbackHeuristicProvider } from "../../../src/background/providers/heuristic/fallback.js";
import { createHistoryUrlHeuristicProvider } from "../../../src/background/providers/heuristic/history-url.js";
import { MODES } from "../../../src/shared/constants.js";
import type { PermissionState, ZenbarSettings } from "../../../src/shared/types.js";

const baseSettings: ZenbarSettings = {
  sources: {
    tabs: true,
    bookmarks: true,
    history: true
  },
  commandPosition: "center",
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

  it("prefers history-url heuristic over fallback when available", async () => {
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
      })
    ]);

    expect(response.defaultResult?.providerId).toBe("history-url-heuristic");
  });

  it("falls back when history-url does not produce a result", async () => {
    const context = createContext("example.com/foo");
    const response = await runQueryEngine(context, [
      createFallbackHeuristicProvider(),
      createHistoryUrlHeuristicProvider({ resolveResult: async () => null })
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
});
