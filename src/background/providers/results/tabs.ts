import { MODES } from "../../../shared/constants.js";
import { fuzzyScore, getFaviconUrl, normalizeComparableUrl } from "../../../shared/utils.js";

import type { QueryContext, QueryProvider, ResultItem } from "../../../shared/types.js";

interface TabsResultsDependencies {
  queryTabsForWindow?: (currentTab: chrome.tabs.Tab | null) => Promise<chrome.tabs.Tab[]>;
}

export function createTabsResultsProvider({
  queryTabsForWindow = async (currentTab) => {
    if (currentTab?.windowId) {
      return await chrome.tabs.query({ windowId: currentTab.windowId });
    }

    return await chrome.tabs.query({ currentWindow: true });
  }
}: TabsResultsDependencies = {}): QueryProvider {
  return {
    id: "tabs-results",
    kind: "normal",
    group: "tabs",
    isActive: (context) => context.mode !== MODES.TAB_SEARCH && context.allowedSources.includes("tabs") && Boolean(context.trimmedInput),
    start: async (context) => {
      const tabs = await queryTabsForWindow(context.currentTab);

      return tabs
        .filter((tab) => typeof tab.id === "number" && tab.id !== context.currentTab?.id && Boolean(tab.url))
        .map((tab): ResultItem | null => {
          const baseScore = fuzzyScore(context.trimmedInput, tab.title, tab.url);

          if (!tab.id || !tab.url || baseScore <= 0) {
            return null;
          }

          return {
            id: `tab:${tab.id}`,
            type: "tab",
            source: "tabs",
            title: tab.title || tab.url || "Untitled tab",
            subtitle: tab.url || "",
            url: tab.url,
            tabId: tab.id,
            windowId: tab.windowId ?? null,
            pinned: Boolean(tab.pinned),
            iconUrl: getFaviconUrl(tab.url, tab.favIconUrl),
            finalScore: baseScore,
            group: "tabs",
            providerId: "tabs-results",
            dedupeKey: normalizeComparableUrl(tab.url)
          };
        })
        .filter((result) => result !== null);
    }
  };
}
