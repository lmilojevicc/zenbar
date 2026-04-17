import { describe, expect, it } from "bun:test";

import { MODES } from "../src/shared/constants.js";
import {
  canStartSubmit,
  getCommandInputState,
  getResultsFooterText,
  getCommandSurfaceOpenState,
  getSubmitTargetText,
  getSubmitStartState,
  getSubmitSuccessState,
  getCommandSurfaceStatusState,
  shouldShowResultsHost,
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
      navigationPending: false,
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
      navigationPending: false,
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
      navigationPending: false,
      statusMessage: "Unable to open the selected result."
    })).toEqual({
      helperText: "Unable to open the selected result.",
      inputIcon: "search",
      isBusy: false
    });
  });

  it("shows a spinner while fallback-tab navigation is still pending", () => {
    expect(getCommandSurfaceStatusState({
      mode: MODES.NEW_TAB,
      loading: false,
      submitting: false,
      navigationPending: true,
      submitTargetText: "",
      statusMessage: ""
    })).toEqual({
      helperText: "Opening in new tab...",
      inputIcon: "spinner",
      isBusy: true
    });
  });

  it("shows the destination text while opening a new tab", () => {
    expect(getCommandSurfaceStatusState({
      mode: MODES.NEW_TAB,
      loading: false,
      submitting: true,
      navigationPending: false,
      submitTargetText: "https://example.com/",
      statusMessage: ""
    })).toEqual({
      helperText: "Opening in new tab: https://example.com/",
      inputIcon: "spinner",
      isBusy: true
    });
  });
});

describe("getSubmitTargetText", () => {
  it("prefers the selected result url", () => {
    expect(getSubmitTargetText({
      id: "history:1",
      type: "history",
      source: "history",
      url: "https://example.com/"
    } as ResultItem, "cats")).toBe("https://example.com/");
  });

  it("falls back to the selected query text", () => {
    expect(getSubmitTargetText({
      id: "search:cats",
      type: "search-action",
      source: "searchAction",
      queryText: "cats"
    } as ResultItem, "cats")).toBe("cats");
  });

  it("falls back to the typed query when there is no selected result", () => {
    expect(getSubmitTargetText(null, "  https://typed.example/  ")).toBe("https://typed.example/");
  });
});

describe("getSubmitSuccessState", () => {
  it("keeps submitting only when the fallback surface tab is still navigating", () => {
    expect(getSubmitSuccessState(false, true)).toEqual({
      submitting: false,
      navigationPending: true,
      statusMessage: "",
      shouldCloseSurface: false,
      shouldRenderChrome: false
    });
  });

  it("clears submitting when the surface stays open without a pending navigation", () => {
    expect(getSubmitSuccessState(false, false)).toEqual({
      submitting: false,
      navigationPending: false,
      statusMessage: "",
      shouldCloseSurface: false,
      shouldRenderChrome: true
    });
  });

  it("clears submitting and closes the surface when submit should dismiss", () => {
    expect(getSubmitSuccessState(true, false)).toEqual({
      submitting: false,
      navigationPending: false,
      statusMessage: "",
      shouldCloseSurface: true,
      shouldRenderChrome: false
    });
    expect(getSubmitSuccessState(undefined, false)).toEqual({
      submitting: false,
      navigationPending: false,
      statusMessage: "",
      shouldCloseSurface: true,
      shouldRenderChrome: false
    });
  });
});

describe("getSubmitStartState", () => {
  it("starts a new submit by clearing stale navigation pending state", () => {
    expect(getSubmitStartState()).toEqual({
      submitting: true,
      navigationPending: false
    });
  });
});

describe("canStartSubmit", () => {
  it("blocks submits while a request is in flight", () => {
    expect(canStartSubmit(true, false)).toBe(false);
  });

  it("allows a new submit while fallback navigation is still pending", () => {
    expect(canStartSubmit(false, true)).toBe(true);
  });

  it("allows submits once both busy states are clear", () => {
    expect(canStartSubmit(false, false)).toBe(true);
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
      navigationPending: false,
      statusMessage: ""
    });
    expect(getCommandSurfaceStatusState({
      mode: MODES.NEW_TAB,
      loading: state.loading,
      submitting: state.submitting,
      navigationPending: state.navigationPending,
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
      navigationPending: false,
      statusMessage: ""
    });
  });
});

describe("shouldShowResultsHost", () => {
  it("hides the results area when idle with no results", () => {
    expect(shouldShowResultsHost(false, 0)).toBe(false);
  });

  it("shows the results area while loading", () => {
    expect(shouldShowResultsHost(true, 0)).toBe(true);
  });

  it("shows the results area when results exist", () => {
    expect(shouldShowResultsHost(false, 1)).toBe(true);
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
      selectionStart: null,
      selectionEnd: null,
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
      selectionStart: null,
      selectionEnd: null,
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
      selectionStart: null,
      selectionEnd: null,
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
      selectionStart: null,
      selectionEnd: null,
      previewResult: null
    });
  });
});

describe("getVisibleDefaultResult", () => {
  it("returns null when the user has not explicitly selected a row", () => {
    const selectionModel = applyQueryResultState(createSelectionModel(MODES.NEW_TAB), {
      results: [defaultAutofillResult],
      defaultResult: defaultAutofillResult,
      allowEmptySelection: false
    });

    expect(getVisibleDefaultResult(selectionModel, true)).toBeNull();
  });

  it("returns null when the default preview is suppressed", () => {
    const selectionModel = applyQueryResultState(createSelectionModel(MODES.CURRENT_TAB), {
      results: [defaultAutofillResult],
      defaultResult: defaultAutofillResult,
      allowEmptySelection: false
    });

    expect(getVisibleDefaultResult(selectionModel, false)).toBeNull();
  });

  it("returns the default result when the user has explicitly selected it", () => {
    const selectionModel = setExplicitSelection(applyQueryResultState(createSelectionModel(MODES.NEW_TAB), {
      results: [defaultAutofillResult],
      defaultResult: defaultAutofillResult,
      allowEmptySelection: false
    }), 0, "arrow");

    expect(getVisibleDefaultResult(selectionModel, true)).toBe(defaultAutofillResult);
  });
});

describe("getResultsFooterText", () => {
  it("shows tab-search keyboard guidance only in tab search", () => {
    expect(getResultsFooterText(MODES.TAB_SEARCH)).toBe("Ctrl/Cmd+X closes the highlighted tab. Ctrl/Cmd+P pins it.");
    expect(getResultsFooterText(MODES.NEW_TAB)).toBe("");
    expect(getResultsFooterText(MODES.CURRENT_TAB)).toBe("");
  });
});
