import { MODES } from "../../../shared/constants.js";

import type { AdaptiveHistoryMatch } from "../../adaptive-history-store.js";
import type { QueryProvider, ZenbarSettings } from "../../../shared/types.js";

interface AdaptiveHistoryReader {
  getAdaptiveMatches: (query: string, settings: ZenbarSettings) => Promise<AdaptiveHistoryMatch[]>;
}

export function createInputHistoryResultsProvider(store: AdaptiveHistoryReader): QueryProvider {
  return {
    id: "input-history-results",
    kind: "normal",
    group: "input-history",
    isActive: (context) => context.mode !== MODES.TAB_SEARCH && context.allowedSources.includes("inputHistory") && Boolean(context.trimmedInput),
    start: async (context) => {
      const matches = await store.getAdaptiveMatches(context.trimmedInput, context.settings);

      return matches.map((entry) => ({
        ...entry.result,
        finalScore: (entry.result.finalScore ?? 0) + entry.count * 10,
        group: "input-history",
        providerId: "input-history-results",
        dedupeKey: entry.dedupeKey
      }));
    }
  };
}
