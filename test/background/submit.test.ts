import { describe, expect, it } from "bun:test";

import { MODES } from "../../src/shared/constants.js";
import { createSubmitHandlers, inferImplicitSelection, maybeRecordAdaptiveSelection } from "../../src/background/submit.js";

describe("inferImplicitSelection", () => {
  it("returns a URL result for URL-like input", () => {
    expect(inferImplicitSelection("example.com")).toEqual({
      id: "url:https://example.com/",
      type: "url",
      source: "url",
      url: "https://example.com/"
    });
  });

  it("returns a search action for plain search input", () => {
    expect(inferImplicitSelection("cats")).toEqual({
      id: "search:cats",
      type: "search-action",
      source: "searchAction",
      title: 'Search "cats"',
      queryText: "cats"
    });
  });
});

describe("createSubmitHandlers", () => {
  it("activates a known matching tab before opening a new tab", async () => {
    const events: string[] = [];
    const handlers = createSubmitHandlers({
      activateTab: async (tabId) => {
        events.push(`activate:${tabId}`);
      },
      createTab: async ({ url }) => {
        events.push(`create:${url}`);
      },
      findMatchingTab: async () => null,
      getActiveTab: async () => null,
      searchQuery: async () => {},
      updateTab: async () => {},
      getTab: async () => ({ id: 42, windowId: 7, pinned: false }),
      updateWindow: async () => ({})
    });

    const result = await handlers.openUrl("https://example.com/", {
      mode: MODES.NEW_TAB,
      contextTabId: null,
      contextWindowId: null,
      submitterTabId: null,
      reuseSubmitterTab: false,
      knownTabId: 42,
      knownWindowId: 7
    });

    expect(result).toEqual({ reusedSubmitterTab: false });
    expect(events).toEqual(["activate:42"]);
  });

  it("reuses the submitter tab for new-tab searches when requested", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const handlers = createSubmitHandlers({
      activateTab: async () => {},
      createTab: async () => {},
      findMatchingTab: async () => null,
      getActiveTab: async () => null,
      searchQuery: async (query) => {
        calls.push(query as Record<string, unknown>);
      },
      updateTab: async () => {},
      getTab: async () => ({ id: 1, windowId: 1, pinned: false }),
      updateWindow: async () => ({})
    });

    const result = await handlers.executeSearch("cats", {
      mode: MODES.NEW_TAB,
      contextTabId: null,
      submitterTabId: 99,
      reuseSubmitterTab: true
    });

    expect(result).toEqual({ reusedSubmitterTab: true });
    expect(calls).toEqual([
      {
        text: "cats",
        tabId: 99
      }
    ]);
  });

  it("records adaptive history selections only for non-tab-search queries", async () => {
    const calls: Array<{ query: string; resultId: string }> = [];

    await maybeRecordAdaptiveSelection({
      mode: MODES.NEW_TAB,
      rawQuery: "cats",
      selection: {
        id: "search:cats",
        type: "search-action",
        source: "searchAction",
        title: 'Search "cats"',
        queryText: "cats"
      },
      settings: {
        sources: { tabs: true, bookmarks: true, history: true },
        suggestionProvider: "off",
        adaptiveHistoryEnabled: true
      },
      recordSelection: async (query, result) => {
        calls.push({ query, resultId: result.id });
      }
    });

    await maybeRecordAdaptiveSelection({
      mode: MODES.TAB_SEARCH,
      rawQuery: "cats",
      selection: {
        id: "tab:1",
        type: "tab",
        source: "tabs",
        tabId: 1
      },
      settings: {
        sources: { tabs: true, bookmarks: true, history: true },
        suggestionProvider: "off",
        adaptiveHistoryEnabled: true
      },
      recordSelection: async (query, result) => {
        calls.push({ query, resultId: result.id });
      }
    });

    expect(calls).toEqual([{ query: "cats", resultId: "search:cats" }]);
  });
});
