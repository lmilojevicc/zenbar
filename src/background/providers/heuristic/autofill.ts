import { MODES } from "../../../shared/constants.js";

import type { QueryContext, QueryProvider, ResultItem, ResultSource } from "../../../shared/types.js";

interface AutofillHeuristicDependencies {
  resolveResult?: (context: QueryContext) => Promise<ResultItem | null>;
}

export function createAutofillHeuristicProvider({
  resolveResult = async () => null
}: AutofillHeuristicDependencies = {}): QueryProvider {
  const localAutofillSources: ResultSource[] = ["tabs", "bookmarks", "history", "inputHistory"];

  return {
    id: "autofill-heuristic",
    kind: "heuristic",
    group: "heuristic",
    priority: 30,
    isActive: (context) => (
      context.mode !== MODES.TAB_SEARCH
      && context.classification !== "empty"
      && context.classification !== "search"
      && localAutofillSources.some((source) => context.allowedSources.includes(source))
    ),
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
          providerId: "autofill-heuristic",
          dedupeKey: result.dedupeKey ?? result.url ?? result.queryText ?? result.id
        }
      ];
    }
  };
}
