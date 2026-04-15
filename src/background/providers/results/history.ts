import { MODES } from "../../../shared/constants.js";
import { fuzzyScore, getFaviconUrl, normalizeComparableUrl } from "../../../shared/utils.js";

import type { QueryProvider, ResultItem } from "../../../shared/types.js";

interface HistoryResultsDependencies {
  queryTabsForWindow?: (currentTab: chrome.tabs.Tab | null) => Promise<chrome.tabs.Tab[]>;
  searchHistory?: (query: string) => Promise<chrome.history.HistoryItem[]>;
}

export function createHistoryResultsProvider({
  queryTabsForWindow = async (currentTab) => {
    if (currentTab?.windowId) {
      return await chrome.tabs.query({ windowId: currentTab.windowId });
    }

    return await chrome.tabs.query({ currentWindow: true });
  },
  searchHistory = async (query) => await chrome.history.search({
    text: query,
    maxResults: 28,
    startTime: 0
  })
}: HistoryResultsDependencies = {}): QueryProvider {
  return {
    id: "history-results",
    kind: "normal",
    group: "history",
    isActive: (context) => context.mode !== MODES.TAB_SEARCH && context.allowedSources.includes("history") && Boolean(context.trimmedInput),
    start: async (context) => {
      const [historyItems, tabs] = await Promise.all([
        searchHistory(context.trimmedInput),
        queryTabsForWindow(context.currentTab)
      ]);
      const openTabByUrl = createOpenTabMap(tabs, context.currentTab?.id);

      return historyItems
        .filter((item) => Boolean(item.url))
        .map((item): ResultItem | null => {
          if (!item.url) {
            return null;
          }

          const baseScore = fuzzyScore(context.trimmedInput, item.title, item.url);

          if (baseScore <= 0) {
            return null;
          }

          const openTab = openTabByUrl.get(normalizeComparableUrl(item.url));

          return {
            id: `history:${item.id}`,
            type: "history",
            source: "history",
            title: item.title || item.url,
            subtitle: item.url,
            url: item.url,
            openTabId: openTab?.id ?? null,
            openWindowId: openTab?.windowId ?? null,
            iconUrl: getFaviconUrl(item.url),
            finalScore: baseScore * context.settings.weights.history,
            group: "history",
            providerId: "history-results",
            dedupeKey: normalizeComparableUrl(item.url)
          };
        })
        .filter((result) => result !== null);
    }
  };
}

function createOpenTabMap(tabs: chrome.tabs.Tab[], excludedTabId?: number | null): Map<string, chrome.tabs.Tab> {
  const openTabByUrl = new Map<string, chrome.tabs.Tab>();

  for (const tab of tabs) {
    if (!tab.url || !tab.id || tab.id === excludedTabId) {
      continue;
    }

    const key = normalizeComparableUrl(tab.url);

    if (key && !openTabByUrl.has(key)) {
      openTabByUrl.set(key, tab);
    }
  }

  return openTabByUrl;
}
