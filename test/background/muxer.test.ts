import { describe, expect, it } from "bun:test";

import { MAX_RESULTS } from "../../src/shared/constants.js";
import { createQueryContext } from "../../src/background/query-context.js";
import { muxQueryResults } from "../../src/background/muxer.js";
import { MODES } from "../../src/shared/constants.js";
import type { PermissionState, ResultItem, ZenbarSettings } from "../../src/shared/types.js";

const settings: ZenbarSettings = {
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
  bookmarks: false,
  history: false,
  duckduckgo: false
};

function createContext(rawInput = "cats") {
  return createQueryContext({
    requestId: `mux:${rawInput}`,
    mode: MODES.NEW_TAB,
    rawInput,
    currentTab: null,
    settings,
    permissions
  });
}

function makeResult(overrides: Partial<ResultItem> & Pick<ResultItem, "id" | "type" | "source">): ResultItem {
  return {
    ...overrides,
    heuristic: overrides.heuristic ?? false,
    group: overrides.group ?? "history",
    providerId: overrides.providerId ?? "unknown-provider",
    dedupeKey: overrides.dedupeKey ?? overrides.url ?? overrides.queryText ?? overrides.id
  } as ResultItem;
}

describe("muxQueryResults", () => {
  it("places the default heuristic first and keeps only one visible heuristic", () => {
    const context = createContext("example.com");
    const defaultResult = makeResult({
      id: "autofill",
      type: "url",
      source: "url",
      url: "https://example.com/",
      heuristic: true,
      group: "heuristic",
      providerId: "history-url-heuristic"
    });

    const competingHeuristic = makeResult({
      id: "history-heuristic",
      type: "history",
      source: "history",
      url: "https://example.com/",
      heuristic: true,
      group: "heuristic",
      providerId: "history-url-heuristic"
    });

    const results = muxQueryResults(context, [defaultResult, competingHeuristic], []);

    expect(results.map((result) => result.id)).toEqual(["autofill"]);
  });

  it("suppresses duplicate history rows when a tab result exists for the same URL", () => {
    const context = createContext();
    const defaultResult = makeResult({
      id: "search",
      type: "search-action",
      source: "searchAction",
      queryText: "cats",
      heuristic: true,
      group: "heuristic",
      providerId: "fallback-heuristic",
      dedupeKey: "search:cats"
    });

    const tabResult = makeResult({
      id: "tab",
      type: "tab",
      source: "tabs",
      url: "https://cats.example/",
      group: "tabs",
      providerId: "tabs-results",
      dedupeKey: "https://cats.example/"
    });

    const historyResult = makeResult({
      id: "history",
      type: "history",
      source: "history",
      url: "https://cats.example/",
      group: "history",
      providerId: "history-results",
      dedupeKey: "https://cats.example/"
    });

    const results = muxQueryResults(context, [defaultResult], [historyResult, tabResult]);

    expect(results.map((result) => result.id)).toEqual(["search", "tab"]);
  });

  it("keeps alternate search rows above tabs/history and below the default heuristic", () => {
    const context = createContext("example.com");
    const defaultResult = makeResult({
      id: "visit",
      type: "url",
      source: "url",
      url: "https://example.com/",
      heuristic: true,
      group: "heuristic",
      providerId: "fallback-heuristic"
    });

    const alternateSearch = makeResult({
      id: "alternate-search",
      type: "search-action",
      source: "searchAction",
      queryText: "example.com",
      group: "search",
      providerId: "fallback-heuristic",
      dedupeKey: "search:example.com"
    });

    const historyResult = makeResult({
      id: "history",
      type: "history",
      source: "history",
      url: "https://example.com/docs",
      group: "history",
      providerId: "history-results"
    });

    const results = muxQueryResults(context, [defaultResult], [historyResult, alternateSearch]);

    expect(results.map((result) => result.id)).toEqual(["visit", "alternate-search", "history"]);
  });

  it("caps visible results at MAX_RESULTS", () => {
    const context = createContext();
    const defaultResult = makeResult({
      id: "search",
      type: "search-action",
      source: "searchAction",
      queryText: "cats",
      heuristic: true,
      group: "heuristic",
      providerId: "fallback-heuristic"
    });

    const normalResults = Array.from({ length: MAX_RESULTS + 3 }, (_, index) => makeResult({
      id: `history-${index}`,
      type: "history",
      source: "history",
      url: `https://cats.example/${index}`,
      group: "history",
      providerId: "history-results"
    }));

    const results = muxQueryResults(context, [defaultResult], normalResults);

    expect(results).toHaveLength(MAX_RESULTS);
    expect(results[0]?.id).toBe("search");
  });
});
