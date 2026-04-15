import { MODES } from "../shared/constants.js";

import type { Mode, ResultItem, UserSelectionBehavior } from "../shared/types.js";

export interface SelectionModelState {
  mode: Mode;
  explicitIndex: number | null;
  defaultResult: ResultItem | null;
  allowEmptySelection: boolean;
  userSelectionBehavior: UserSelectionBehavior;
}

interface QueryResultState {
  results: ResultItem[];
  defaultResult: ResultItem | null;
  allowEmptySelection: boolean;
}

export function createSelectionModel(mode: Mode): SelectionModelState {
  return {
    mode,
    explicitIndex: mode === MODES.TAB_SEARCH ? 0 : null,
    defaultResult: null,
    allowEmptySelection: mode !== MODES.TAB_SEARCH,
    userSelectionBehavior: mode === MODES.TAB_SEARCH ? "arrow" : "none"
  };
}

export function applyQueryResultState(
  model: SelectionModelState,
  { results, defaultResult, allowEmptySelection }: QueryResultState
): SelectionModelState {
  if (model.mode === MODES.TAB_SEARCH) {
    return {
      ...model,
      explicitIndex: results.length ? clampIndex(model.explicitIndex ?? 0, results.length) : null,
      defaultResult,
      allowEmptySelection
    };
  }

  return {
    ...model,
    explicitIndex: model.explicitIndex === null ? null : clampIndex(model.explicitIndex, results.length),
    defaultResult,
    allowEmptySelection
  };
}

export function resetSelectionForTypedInput(model: SelectionModelState): SelectionModelState {
  return {
    ...model,
    defaultResult: null,
    explicitIndex: model.mode === MODES.TAB_SEARCH ? 0 : null,
    userSelectionBehavior: model.mode === MODES.TAB_SEARCH ? "arrow" : "none"
  };
}

export function moveSelection(
  model: SelectionModelState,
  results: ResultItem[],
  delta: 1 | -1
): SelectionModelState {
  if (!results.length) {
    return model;
  }

  const currentIndex = getHighlightedIndex(model, results);

  if (currentIndex === null) {
    return {
      ...model,
      explicitIndex: delta > 0 ? 0 : results.length - 1,
      userSelectionBehavior: "arrow"
    };
  }

  let nextIndex = currentIndex + delta;

  if (nextIndex < 0 || nextIndex >= results.length) {
    if (model.allowEmptySelection) {
      return {
        ...model,
        explicitIndex: null,
        userSelectionBehavior: "arrow"
      };
    }

    nextIndex = delta > 0 ? 0 : results.length - 1;
  }

  return {
    ...model,
    explicitIndex: nextIndex,
    userSelectionBehavior: "arrow"
  };
}

export function setExplicitSelection(
  model: SelectionModelState,
  index: number,
  behavior: UserSelectionBehavior
): SelectionModelState {
  return {
    ...model,
    explicitIndex: index,
    userSelectionBehavior: behavior
  };
}

export function getHighlightedIndex(model: SelectionModelState, results: ResultItem[]): number | null {
  if (!results.length) {
    return null;
  }

  if (model.mode === MODES.TAB_SEARCH) {
    return clampIndex(model.explicitIndex ?? 0, results.length);
  }

  if (model.explicitIndex !== null) {
    return clampIndex(model.explicitIndex, results.length);
  }

  return null;
}

export function getSelectedResult(model: SelectionModelState, results: ResultItem[]): ResultItem | null {
  if (model.mode === MODES.TAB_SEARCH) {
    const highlightedIndex = getHighlightedIndex(model, results);
    return highlightedIndex === null ? null : results[highlightedIndex] ?? null;
  }

  if (model.explicitIndex !== null) {
    const highlightedIndex = getHighlightedIndex(model, results);
    return highlightedIndex === null ? null : results[highlightedIndex] ?? null;
  }

  return null;
}

function clampIndex(index: number, resultCount: number): number | null {
  if (!resultCount) {
    return null;
  }

  return Math.max(0, Math.min(index, resultCount - 1));
}
