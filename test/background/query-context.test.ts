import { describe, expect, it } from "bun:test";

import { MODES } from "../../src/shared/constants.js";
import { createQueryContext } from "../../src/background/query-context.js";
import type { PermissionState, ZenbarSettings } from "../../src/shared/types.js";

const settings: ZenbarSettings = {
  sources: {
    tabs: true,
    bookmarks: true,
    history: true
  },
  suggestionProvider: "duckduckgo",
  adaptiveHistoryEnabled: false
};

const permissions: PermissionState = {
  bookmarks: true,
  history: true,
  duckduckgo: true
};

describe("createQueryContext", () => {
  it("classifies plain search input", () => {
    const context = createQueryContext({
      requestId: "q1",
      mode: MODES.NEW_TAB,
      rawInput: "cats",
      currentTab: null,
      settings,
      permissions
    });

    expect(context.classification).toBe("search");
  });

  it("classifies origin-like input", () => {
    const context = createQueryContext({
      requestId: "q2",
      mode: MODES.NEW_TAB,
      rawInput: "example.com",
      currentTab: null,
      settings,
      permissions
    });

    expect(context.classification).toBe("origin-like");
  });

  it("classifies full URL input", () => {
    const context = createQueryContext({
      requestId: "q3",
      mode: MODES.CURRENT_TAB,
      rawInput: "https://example.com",
      currentTab: null,
      settings,
      permissions
    });

    expect(context.classification).toBe("url-like");
  });

  it("classifies deep URL input", () => {
    const context = createQueryContext({
      requestId: "q4",
      mode: MODES.NEW_TAB,
      rawInput: "example.com/foo",
      currentTab: null,
      settings,
      permissions
    });

    expect(context.classification).toBe("deep-url");
  });

  it("restricts tab-search to tabs only", () => {
    const context = createQueryContext({
      requestId: "q5",
      mode: MODES.TAB_SEARCH,
      rawInput: "docs",
      currentTab: null,
      settings,
      permissions
    });

    expect(context.allowedSources).toEqual(["tabs"]);
  });

  it("includes input history only when adaptive history is enabled", () => {
    const disabledContext = createQueryContext({
      requestId: "q6",
      mode: MODES.NEW_TAB,
      rawInput: "cats",
      currentTab: null,
      settings,
      permissions
    });

    const enabledContext = createQueryContext({
      requestId: "q7",
      mode: MODES.NEW_TAB,
      rawInput: "cats",
      currentTab: null,
      settings: {
        ...settings,
        adaptiveHistoryEnabled: true
      },
      permissions
    });

    expect(disabledContext.allowedSources).not.toContain("inputHistory");
    expect(enabledContext.allowedSources).toContain("inputHistory");
  });
});
