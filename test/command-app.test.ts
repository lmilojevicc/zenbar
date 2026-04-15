import { describe, expect, it } from "bun:test";

import { MODES } from "../src/shared/constants.js";
import {
  getCommandInputState,
  getCommandSurfaceOpenState,
  getCommandSurfaceStatusState,
  getVisibleDefaultResult,
  prioritizeTypedQueryResult
} from "../src/ui/command-app.js";
import { applyQueryResultState, createSelectionModel, setExplicitSelection } from "../src/ui/selection-model.js";
import type { ResultItem } from "../src/shared/types.js";

const defaultAutofillResult = Object.assign({
  id: "bookmark:york",
  type: "bookmark",
  source: "bookmarks",
  title: "York Emporium",
  url: "https://yorkemporium.co.uk/"
}, {
  autofill: {
    value: "yorkemporium.co.uk/",
    selectionStart: 3,
    selectionEnd: 19
  }
}) as ResultItem;

const secondAutofillResult = Object.assign({
  id: "history:docs",
  type: "history",
  source: "history",
  title: "York Docs",
  url: "https://yorkdocs.example/"
}, {
  autofill: {
    value: "yorkdocs.example/",
    selectionStart: 3,
    selectionEnd: 17
  }
}) as ResultItem;

const plainHistoryResult: ResultItem = {
  id: "history:plain",
  type: "history",
  source: "history",
  title: "Plain History",
  url: "https://plain.example/"
};

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

describe("getCommandSurfaceOpenState", () => {
  it("resets transient submit state for a reused new-tab surface", () => {
    const state = getCommandSurfaceOpenState(MODES.NEW_TAB, null);

    expect(state).toEqual({
      typedQuery: "",
      hasUserEditedInput: true,
      results: [],
      loading: false,
      submitting: false,
      statusMessage: ""
    });
    expect(getCommandSurfaceStatusState({
      mode: MODES.NEW_TAB,
      loading: state.loading,
      submitting: state.submitting,
      statusMessage: state.statusMessage
    })).toEqual({
      helperText: "",
      inputIcon: "search",
      isBusy: false
    });
  });

  it("prefills the current tab URL while still clearing stale submit state", () => {
    const state = getCommandSurfaceOpenState(MODES.CURRENT_TAB, {
      id: 1,
      windowId: 1,
      title: "Current",
      url: "https://current.example/",
      favIconUrl: ""
    });

    expect(state).toEqual({
      typedQuery: "https://current.example/",
      hasUserEditedInput: false,
      results: [],
      loading: false,
      submitting: false,
      statusMessage: ""
    });
  });
});

describe("getCommandInputState", () => {
  it("keeps the typed query even when the default result carries completion metadata", () => {
    const selectionModel = applyQueryResultState(createSelectionModel(MODES.NEW_TAB), {
      results: [defaultAutofillResult, plainHistoryResult],
      defaultResult: defaultAutofillResult,
      allowEmptySelection: false
    });

    expect(getCommandInputState({
      typedQuery: "yor",
      selectionModel,
      results: [defaultAutofillResult, plainHistoryResult],
      allowDefaultPreview: true
    })).toEqual({
      value: "yor",
      selectionStart: 3,
      selectionEnd: 3,
      previewResult: null
    });
  });

  it("keeps the typed query when an arrow-selected result carries completion metadata", () => {
    const selectionModel = setExplicitSelection(
      applyQueryResultState(createSelectionModel(MODES.NEW_TAB), {
        results: [defaultAutofillResult, secondAutofillResult],
        defaultResult: defaultAutofillResult,
        allowEmptySelection: false
      }),
      1,
      "arrow"
    );

    expect(getCommandInputState({
      typedQuery: "yor",
      selectionModel,
      results: [defaultAutofillResult, secondAutofillResult],
      allowDefaultPreview: true
    })).toEqual({
      value: "yor",
      selectionStart: 3,
      selectionEnd: 3,
      previewResult: null
    });
  });

  it("keeps the typed query when pointer movement highlights another row", () => {
    const selectionModel = setExplicitSelection(
      applyQueryResultState(createSelectionModel(MODES.NEW_TAB), {
        results: [defaultAutofillResult, secondAutofillResult],
        defaultResult: defaultAutofillResult,
        allowEmptySelection: false
      }),
      1,
      "pointer"
    );

    expect(getCommandInputState({
      typedQuery: "yor",
      selectionModel,
      results: [defaultAutofillResult, secondAutofillResult],
      allowDefaultPreview: true
    })).toEqual({
      value: "yor",
      selectionStart: 3,
      selectionEnd: 3,
      previewResult: null
    });
  });

  it("suppresses the default preview until the current-tab input has been edited", () => {
    const selectionModel = applyQueryResultState(createSelectionModel(MODES.CURRENT_TAB), {
      results: [defaultAutofillResult],
      defaultResult: defaultAutofillResult,
      allowEmptySelection: false
    });

    expect(getCommandInputState({
      typedQuery: "https://current.example/",
      selectionModel,
      results: [defaultAutofillResult],
      allowDefaultPreview: false
    })).toEqual({
      value: "https://current.example/",
      selectionStart: 24,
      selectionEnd: 24,
      previewResult: null
    });
  });
});

describe("getVisibleDefaultResult", () => {
  it("returns null when the default preview is suppressed", () => {
    const selectionModel = applyQueryResultState(createSelectionModel(MODES.CURRENT_TAB), {
      results: [defaultAutofillResult],
      defaultResult: defaultAutofillResult,
      allowEmptySelection: false
    });

    expect(getVisibleDefaultResult(selectionModel, false)).toBeNull();
  });

  it("returns the default result when preview is allowed", () => {
    const selectionModel = applyQueryResultState(createSelectionModel(MODES.NEW_TAB), {
      results: [defaultAutofillResult],
      defaultResult: defaultAutofillResult,
      allowEmptySelection: false
    });

    expect(getVisibleDefaultResult(selectionModel, true)).toBe(defaultAutofillResult);
  });
});
