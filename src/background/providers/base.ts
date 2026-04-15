import type { QueryProvider } from "../../shared/types.js";

export function isHeuristicProvider(provider: QueryProvider): boolean {
  return provider.kind === "heuristic";
}

export function sortProvidersByKind(providers: QueryProvider[]): QueryProvider[] {
  return [...providers].sort((left, right) => {
    if (left.kind === right.kind) {
      return (right.priority ?? 0) - (left.priority ?? 0);
    }

    return left.kind === "heuristic" ? -1 : 1;
  });
}
