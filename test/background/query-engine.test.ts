import { describe, expect, it } from "bun:test";

import { createQueryContext } from "../../src/background/query-context.js";
import { runQueryEngine } from "../../src/background/query-engine.js";
import { MODES } from "../../src/shared/constants.js";
import type { PermissionState, QueryProvider, ZenbarSettings } from "../../src/shared/types.js";

const settings: ZenbarSettings = {
  sources: {
    tabs: true,
    bookmarks: true,
    history: true
  },
  suggestionProvider: "off",
  adaptiveHistoryEnabled: false
};

const permissions: PermissionState = {
  bookmarks: false,
  history: false,
  duckduckgo: false
};

describe("runQueryEngine", () => {
  it("runs heuristic providers before normal providers and picks the first heuristic as default", async () => {
    const events: string[] = [];
    const heuristicProvider: QueryProvider = {
      id: "fallback-heuristic",
      kind: "heuristic",
      group: "heuristic",
      isActive: () => true,
      start: async () => {
        events.push("heuristic");
        return [{
          id: "heuristic-result",
          type: "search-action",
          source: "searchAction",
          title: 'Search "cats"',
          queryText: "cats",
          heuristic: true,
          group: "heuristic",
          providerId: "fallback-heuristic",
          dedupeKey: "search:cats"
        }];
      }
    };

    const normalProvider: QueryProvider = {
      id: "history-results",
      kind: "normal",
      group: "history",
      isActive: () => true,
      start: async () => {
        events.push("normal");
        return [{
          id: "history-result",
          type: "history",
          source: "history",
          title: "Cats Blog",
          url: "https://cats.example",
          heuristic: false,
          group: "history",
          providerId: "history-results",
          dedupeKey: "https://cats.example/"
        }];
      }
    };

    const context = createQueryContext({
      requestId: "engine-1",
      mode: MODES.NEW_TAB,
      rawInput: "cats",
      currentTab: null,
      settings,
      permissions
    });

    const response = await runQueryEngine(context, [normalProvider, heuristicProvider]);

    expect(events).toEqual(["heuristic", "normal"]);
    expect(response.defaultResult?.id).toBe("heuristic-result");
    expect(response.allowEmptySelection).toBe(false);
    expect(response.results.map((result) => result.id)).toEqual(["heuristic-result", "history-result"]);
  });

  it("keeps only the winning heuristic in the visible result list", async () => {
    const firstHeuristic: QueryProvider = {
      id: "autofill-heuristic",
      kind: "heuristic",
      group: "heuristic",
      priority: 30,
      isActive: () => true,
      start: async () => [{
        id: "autofill-result",
        type: "url",
        source: "url",
        url: "https://example.com/"
      }]
    };

    const secondHeuristic: QueryProvider = {
      id: "history-url-heuristic",
      kind: "heuristic",
      group: "heuristic",
      priority: 20,
      isActive: () => true,
      start: async () => [{
        id: "history-result",
        type: "history",
        source: "history",
        url: "https://example.com/"
      }]
    };

    const context = createQueryContext({
      requestId: "engine-2",
      mode: MODES.NEW_TAB,
      rawInput: "example.com",
      currentTab: null,
      settings,
      permissions
    });

    const response = await runQueryEngine(context, [secondHeuristic, firstHeuristic]);

    expect(response.defaultResult?.id).toBe("autofill-result");
    expect(response.results.map((result) => result.id)).toEqual(["autofill-result"]);
    expect(response.context.heuristicCandidates.map((result) => result.id)).toEqual([
      "autofill-result",
      "history-result"
    ]);
  });

  it("isolates provider failures and still returns healthy provider results", async () => {
    const originalWarn = console.warn;
    console.warn = () => {};

    try {
      const healthyHeuristic: QueryProvider = {
        id: "fallback-heuristic",
        kind: "heuristic",
        group: "heuristic",
        priority: 10,
        isActive: () => true,
        start: async () => [{
          id: "fallback-result",
          type: "search-action",
          source: "searchAction",
          queryText: "cats"
        }]
      };

      const failingNormal: QueryProvider = {
        id: "suggestions-results",
        kind: "normal",
        group: "suggestions",
        isActive: () => true,
        start: async () => {
          throw new Error("suggestions offline");
        }
      };

      const healthyNormal: QueryProvider = {
        id: "history-results",
        kind: "normal",
        group: "history",
        isActive: () => true,
        start: async () => [{
          id: "history-result",
          type: "history",
          source: "history",
          url: "https://cats.example"
        }]
      };

      const context = createQueryContext({
        requestId: "engine-3",
        mode: MODES.NEW_TAB,
        rawInput: "cats",
        currentTab: null,
        settings,
        permissions
      });

      const response = await runQueryEngine(context, [healthyHeuristic, failingNormal, healthyNormal]);

      expect(response.defaultResult?.id).toBe("fallback-result");
      expect(response.results.map((result) => result.id)).toEqual(["fallback-result", "history-result"]);
    } finally {
      console.warn = originalWarn;
    }
  });
});
