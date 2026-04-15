import { inferImplicitSelection } from "../../submit.js";
import { MODES } from "../../../shared/constants.js";

import type { QueryProvider, ResultItem } from "../../../shared/types.js";

export function createFallbackHeuristicProvider(): QueryProvider {
  return {
    id: "fallback-heuristic",
    kind: "heuristic",
    group: "heuristic",
    priority: 10,
    isActive: (context) => context.mode !== MODES.TAB_SEARCH && Boolean(context.trimmedInput),
    start: async (context) => {
      const result = inferImplicitSelection(context.trimmedInput);

      if (!result) {
        return [];
      }

      return [toHeuristicResult(result, "fallback-heuristic")];
    }
  };
}

function toHeuristicResult(result: ResultItem, providerId: QueryProvider["id"]): ResultItem {
  return {
    ...result,
    heuristic: true,
    group: "heuristic",
    providerId,
    dedupeKey: result.dedupeKey ?? result.url ?? result.queryText ?? result.id
  };
}
