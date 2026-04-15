import { describe, expect, it } from "bun:test";

import { MODES } from "../src/shared/constants.js";
import { getCommandSurfaceStatusState, prioritizeTypedQueryResult } from "../src/ui/command-app.js";

describe("prioritizeTypedQueryResult", () => {
  it("moves the exact typed query search action to the top for new-tab mode", () => {
    const historyResult = {
      type: "history",
      title: "OpenCode",
      url: "https://opencode.ai"
    };
    const searchAction = {
      type: "search-action",
      title: 'Search "opencode"',
      queryText: "opencode"
    };

    expect(prioritizeTypedQueryResult([historyResult, searchAction], "opencode", MODES.NEW_TAB)).toEqual([
      searchAction,
      historyResult
    ]);
  });

  it("moves the exact typed query search action to the top for current-tab mode", () => {
    const tabResult = {
      type: "tab",
      title: "OpenCode Docs",
      url: "https://opencode.ai/docs"
    };
    const searchAction = {
      type: "search-action",
      title: 'Search "opencode docs"',
      queryText: "opencode docs"
    };

    expect(prioritizeTypedQueryResult([tabResult, searchAction], "opencode docs", MODES.CURRENT_TAB)).toEqual([
      searchAction,
      tabResult
    ]);
  });

  it("keeps tab-search results unchanged", () => {
    const tabResult = {
      type: "tab",
      title: "OpenCode Docs",
      url: "https://opencode.ai/docs"
    };
    const searchAction = {
      type: "search-action",
      title: 'Search "opencode docs"',
      queryText: "opencode docs"
    };

    expect(prioritizeTypedQueryResult([tabResult, searchAction], "opencode docs", MODES.TAB_SEARCH)).toEqual([
      tabResult,
      searchAction
    ]);
  });

  it("keeps results unchanged when there is no exact typed query search action", () => {
    const historyResult = {
      type: "history",
      title: "OpenCode",
      url: "https://opencode.ai"
    };
    const suggestion = {
      type: "suggestion",
      title: "opencode app",
      queryText: "opencode app"
    };

    expect(prioritizeTypedQueryResult([historyResult, suggestion], "opencode", MODES.NEW_TAB)).toEqual([
      historyResult,
      suggestion
    ]);
  });
});

describe("getCommandSurfaceStatusState", () => {
  it("shows a spinner and submit message for new-tab submits", () => {
    expect(getCommandSurfaceStatusState({
      mode: MODES.NEW_TAB,
      loading: false,
      submitting: true,
      statusMessage: ""
    })).toEqual({
      helperText: "Opening in new tab...",
      inputIcon: "spinner",
      isBusy: true
    });
  });

  it("shows a spinner and submit message for current-tab submits", () => {
    expect(getCommandSurfaceStatusState({
      mode: MODES.CURRENT_TAB,
      loading: false,
      submitting: true,
      statusMessage: ""
    })).toEqual({
      helperText: "Opening in current tab...",
      inputIcon: "spinner",
      isBusy: true
    });
  });

  it("falls back to the search icon and status text when not submitting", () => {
    expect(getCommandSurfaceStatusState({
      mode: MODES.NEW_TAB,
      loading: false,
      submitting: false,
      statusMessage: "Unable to open the selected result."
    })).toEqual({
      helperText: "Unable to open the selected result.",
      inputIcon: "search",
      isBusy: false
    });
  });
});
