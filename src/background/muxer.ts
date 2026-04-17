import { MAX_RESULTS } from "../shared/constants.js";

import type { QueryContext, ResultGroup, ResultItem, ResultSourceOrderItem } from "../shared/types.js";

export function muxQueryResults(
  context: QueryContext,
  heuristicCandidates: ResultItem[],
  normalCandidates: ResultItem[]
): ResultItem[] {
  const defaultResult = heuristicCandidates[0] ?? null;
  const sortedNormalCandidates = [...normalCandidates].sort((left, right) => compareCandidates(left, right, context.settings.resultSourceOrder));
  const visibleResults: ResultItem[] = defaultResult ? [defaultResult] : [];
  const seenKeys = new Set<string>();

  if (defaultResult?.dedupeKey) {
    seenKeys.add(defaultResult.dedupeKey);
  }

  for (const candidate of sortedNormalCandidates) {
    if (visibleResults.length >= MAX_RESULTS) {
      break;
    }

    const dedupeKey = candidate.dedupeKey ?? candidate.url ?? candidate.queryText ?? candidate.id;

    if (seenKeys.has(dedupeKey)) {
      continue;
    }

    visibleResults.push(candidate);
    seenKeys.add(dedupeKey);
  }

  return visibleResults.slice(0, MAX_RESULTS);
}

function compareCandidates(left: ResultItem, right: ResultItem, resultSourceOrder: ResultSourceOrderItem[]): number {
  const groupDelta = getGroupRank(left.group, resultSourceOrder) - getGroupRank(right.group, resultSourceOrder);

  if (groupDelta !== 0) {
    return groupDelta;
  }

  const scoreDelta = (right.finalScore ?? 0) - (left.finalScore ?? 0);

  if (scoreDelta !== 0) {
    return scoreDelta;
  }

  return String(left.title ?? left.url ?? left.queryText ?? left.id).localeCompare(
    String(right.title ?? right.url ?? right.queryText ?? right.id)
  );
}

function getGroupRank(group: ResultItem["group"], resultSourceOrder: ResultSourceOrderItem[]): number {
  const groupOrder = createGroupOrder(resultSourceOrder);
  const index = groupOrder.indexOf(group ?? "history");
  return index === -1 ? groupOrder.length : index;
}

function createGroupOrder(resultSourceOrder: ResultSourceOrderItem[]): ResultGroup[] {
  return [
    "search",
    ...resultSourceOrder,
    "url"
  ];
}
