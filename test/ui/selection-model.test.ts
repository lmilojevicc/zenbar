import { describe, expect, it } from "bun:test";

import { MODES } from "../../src/shared/constants.js";
import {
  applyQueryResultState,
  createSelectionModel,
  getHighlightedIndex,
  getSelectedResult,
  moveSelection,
  resetSelectionForTypedInput,
  setExplicitSelection
} from "../../src/ui/selection-model.js";
import type { ResultItem } from "../../src/shared/types.js";

const defaultResult: ResultItem = {
  id: "default-search",
  type: "search-action",
  source: "searchAction",
  title: 'Search "cats"',
  queryText: "cats",
  heuristic: true,
  group: "heuristic",
  providerId: "fallback-heuristic",
  dedupeKey: "search:cats"
};

const secondResult: ResultItem = {
  id: "history-result",
  type: "history",
  source: "history",
  title: "Cats Blog",
  url: "https://cats.example/",
  group: "history",
  providerId: "history-results",
  dedupeKey: "https://cats.example/"
};

describe("selection model", () => {
  it("uses the default result when there is no explicit selection", () => {
    const model = applyQueryResultState(createSelectionModel(MODES.NEW_TAB), {
      results: [defaultResult, secondResult],
      defaultResult,
      allowEmptySelection: false
    });

    expect(getSelectedResult(model, [defaultResult, secondResult])?.id).toBe("default-search");
    expect(getHighlightedIndex(model, [defaultResult, secondResult])).toBe(0);
  });

  it("ArrowDown moves from the default result into explicit selection of the next row", () => {
    const model = moveSelection(
      applyQueryResultState(createSelectionModel(MODES.NEW_TAB), {
        results: [defaultResult, secondResult],
        defaultResult,
        allowEmptySelection: false
      }),
      [defaultResult, secondResult],
      1
    );

    expect(getHighlightedIndex(model, [defaultResult, secondResult])).toBe(1);
    expect(getSelectedResult(model, [defaultResult, secondResult])?.id).toBe("history-result");
  });

  it("typing clears explicit selection and restores the default-result model", () => {
    const withExplicitSelection = setExplicitSelection(
      applyQueryResultState(createSelectionModel(MODES.NEW_TAB), {
        results: [defaultResult, secondResult],
        defaultResult,
        allowEmptySelection: false
      }),
      1,
      "arrow"
    );

    const reset = resetSelectionForTypedInput(withExplicitSelection);

    expect(getHighlightedIndex(reset, [defaultResult, secondResult])).toBe(null);
    expect(getSelectedResult(reset, [defaultResult, secondResult])).toBe(null);
  });

  it("tab-search stays explicit and highlights the first row when results exist", () => {
    const model = applyQueryResultState(createSelectionModel(MODES.TAB_SEARCH), {
      results: [secondResult],
      defaultResult: null,
      allowEmptySelection: false
    });

    expect(getHighlightedIndex(model, [secondResult])).toBe(0);
    expect(getSelectedResult(model, [secondResult])?.id).toBe("history-result");
  });
});
