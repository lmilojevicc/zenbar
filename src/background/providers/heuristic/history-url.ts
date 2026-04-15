import { MODES } from "../../../shared/constants.js";

import type { QueryContext, QueryProvider, ResultItem } from "../../../shared/types.js";

interface HistoryUrlHeuristicDependencies {
  resolveResult?: (context: QueryContext) => Promise<ResultItem | null>;
}

export function createHistoryUrlHeuristicProvider({
  resolveResult = async () => null
}: HistoryUrlHeuristicDependencies = {}): QueryProvider {
  return {
    id: "history-url-heuristic",
    kind: "heuristic",
    group: "heuristic",
    priority: 20,
    isActive: (context) => context.mode !== MODES.TAB_SEARCH && context.permissions.history,
    start: async (context) => {
      const result = await resolveResult(context);

      if (!result) {
        return [];
      }

      return [
        {
          ...result,
          heuristic: true,
          group: "heuristic",
          providerId: "history-url-heuristic",
          dedupeKey: result.dedupeKey ?? result.url ?? result.queryText ?? result.id
        }
      ];
    }
  };
}
