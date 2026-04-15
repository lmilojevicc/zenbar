import { isHeuristicProvider, sortProvidersByKind } from "./providers/base.js";

import type { QueryContext, QueryEngineResponse, QueryProvider, ResultItem } from "../shared/types.js";

export async function runQueryEngine(
  context: QueryContext,
  providers: QueryProvider[]
): Promise<QueryEngineResponse> {
  const sortedProviders = sortProvidersByKind(providers);
  const heuristicCandidates: ResultItem[] = [];
  const normalCandidates: ResultItem[] = [];

  for (const provider of sortedProviders) {
    try {
      if (!(await provider.isActive(context))) {
        continue;
      }

      const results = await provider.start(context);
      const enrichedResults = results.map((result) => ({
        ...result,
        heuristic: result.heuristic ?? isHeuristicProvider(provider),
        group: result.group ?? provider.group,
        providerId: result.providerId ?? provider.id,
        dedupeKey: result.dedupeKey ?? result.url ?? result.queryText ?? result.id
      }));

      if (isHeuristicProvider(provider)) {
        heuristicCandidates.push(...enrichedResults);
      } else {
        normalCandidates.push(...enrichedResults);
      }
    } catch (error) {
      console.warn(`Query provider failed: ${provider.id}`, error);
    }
  }

  const defaultResult = heuristicCandidates[0] ?? null;
  const results = defaultResult
    ? [defaultResult, ...normalCandidates]
    : [...normalCandidates];
  const nextContext: QueryContext = {
    ...context,
    heuristicCandidates,
    normalCandidates,
    heuristicResult: defaultResult,
    defaultResult,
    results,
    allowEmptySelection: !defaultResult
  };

  return {
    context: nextContext,
    results,
    defaultResult,
    allowEmptySelection: nextContext.allowEmptySelection
  };
}
