import { describe, expect, it } from "bun:test";

import { MODES } from "../../src/shared/constants.js";
import { createSubmitHandlers, inferImplicitSelection } from "../../src/background/submit.js";

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
});
