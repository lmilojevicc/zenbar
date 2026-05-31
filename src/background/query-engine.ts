import { isHeuristicProvider, sortProvidersByKind } from "./providers/base.js";
import { muxQueryResults } from "./muxer.js";

import type { QueryContext, QueryEngineResponse, QueryProvider, ResultItem } from "../shared/types.js";

export async function runQueryEngine(
  context: QueryContext,
  providers: QueryProvider[]
): Promise<QueryEngineResponse> {
  const sortedProviders = sortProvidersByKind(providers);
  const heuristicProviders = sortedProviders.filter(isHeuristicProvider);
  const normalProviders = sortedProviders.filter((provider) => !isHeuristicProvider(provider));
  const heuristicCandidates: ResultItem[] = [];
  const normalCandidates: ResultItem[] = [];

  for (const provider of heuristicProviders) {
    heuristicCandidates.push(...await runProvider(context, provider));
  }

  const normalResultBatches = await Promise.all(
    normalProviders.map((provider) => runProvider(context, provider))
  );

  for (const batch of normalResultBatches) {
    normalCandidates.push(...batch);
  }

  const results = muxQueryResults(context, heuristicCandidates, normalCandidates);
  const defaultResult = heuristicCandidates[0] ?? null;
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

async function runProvider(context: QueryContext, provider: QueryProvider): Promise<ResultItem[]> {
  try {
    if (!(await provider.isActive(context))) {
      return [];
    }

    const results = await provider.start(context);

    return results.map((result) => ({
      ...result,
      heuristic: result.heuristic ?? isHeuristicProvider(provider),
      group: result.group ?? provider.group,
      providerId: result.providerId ?? provider.id,
      dedupeKey: result.dedupeKey ?? result.url ?? result.queryText ?? result.id
    }));
  } catch (error) {
    console.warn(`Query provider failed: ${provider.id}`, error);
    return [];
  }
}
