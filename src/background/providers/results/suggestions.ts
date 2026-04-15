import { extractDuckDuckGoSuggestionPhrases } from "../../../shared/duckduckgo.js";
import { MODES } from "../../../shared/constants.js";
import { fuzzyScore, looksLikeUrl, normalizeText } from "../../../shared/utils.js";

import type { QueryProvider, ResultItem } from "../../../shared/types.js";

interface SuggestionsResultsDependencies {
  fetchSuggestions?: (query: string) => Promise<string[]>;
}

export function createSuggestionsResultsProvider({
  fetchSuggestions = fetchDuckDuckGoSuggestions
}: SuggestionsResultsDependencies = {}): QueryProvider {
  return {
    id: "suggestions-results",
    kind: "normal",
    group: "suggestions",
    isActive: (context) => context.mode !== MODES.TAB_SEARCH && context.allowedSources.includes("suggestions") && Boolean(context.trimmedInput),
    start: async (context) => {
      if (!context.trimmedInput || looksLikeUrl(context.trimmedInput)) {
        return [];
      }

      const phrases = await fetchSuggestions(context.trimmedInput);

      return phrases
        .filter((phrase) => normalizeText(phrase) !== context.normalizedInput)
        .slice(0, 4)
        .map((phrase): ResultItem => ({
          id: `suggestion:${phrase}`,
          type: "suggestion",
          source: "suggestions",
          title: phrase,
          subtitle: "Search suggestion",
          queryText: phrase,
          finalScore: fuzzyScore(context.trimmedInput, phrase),
          group: "suggestions",
          providerId: "suggestions-results",
          dedupeKey: `search:${normalizeText(phrase)}`
        }))
        .filter((entry) => (entry.finalScore ?? 0) > 0);
    }
  };
}

async function fetchDuckDuckGoSuggestions(query: string): Promise<string[]> {
  const response = await fetch(`https://duckduckgo.com/ac/?q=${encodeURIComponent(query)}`, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo suggestions failed with ${response.status}`);
  }

  return extractDuckDuckGoSuggestionPhrases(await response.json());
}
