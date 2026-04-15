import { MODES } from "../../../shared/constants.js";
import { fuzzyScore, getFaviconUrl, normalizeComparableUrl } from "../../../shared/utils.js";

import type { QueryProvider, ResultItem } from "../../../shared/types.js";

interface BookmarksResultsDependencies {
  queryTabsForWindow?: (currentTab: chrome.tabs.Tab | null) => Promise<chrome.tabs.Tab[]>;
  searchBookmarks?: (query: string) => Promise<chrome.bookmarks.BookmarkTreeNode[]>;
}

export function createBookmarksResultsProvider({
  queryTabsForWindow = async (currentTab) => {
    if (currentTab?.windowId) {
      return await chrome.tabs.query({ windowId: currentTab.windowId });
    }

    return await chrome.tabs.query({ currentWindow: true });
  },
  searchBookmarks = async (query) => await chrome.bookmarks.search(query)
}: BookmarksResultsDependencies = {}): QueryProvider {
  return {
    id: "bookmarks-results",
    kind: "normal",
    group: "bookmarks",
    isActive: (context) => context.mode !== MODES.TAB_SEARCH && context.allowedSources.includes("bookmarks") && Boolean(context.trimmedInput),
    start: async (context) => {
      const [bookmarks, tabs] = await Promise.all([
        searchBookmarks(context.trimmedInput),
        queryTabsForWindow(context.currentTab)
      ]);
      const openTabByUrl = createOpenTabMap(tabs, context.currentTab?.id);

      return bookmarks
        .filter((bookmark) => Boolean(bookmark.url))
        .slice(0, 28)
        .map((bookmark): ResultItem | null => {
          if (!bookmark.url) {
            return null;
          }

          const baseScore = fuzzyScore(context.trimmedInput, bookmark.title, bookmark.url);

          if (baseScore <= 0) {
            return null;
          }

          const openTab = openTabByUrl.get(normalizeComparableUrl(bookmark.url));

          return {
            id: `bookmark:${bookmark.id}`,
            type: "bookmark",
            source: "bookmarks",
            title: bookmark.title || bookmark.url,
            subtitle: bookmark.url,
            url: bookmark.url,
            openTabId: openTab?.id ?? null,
            openWindowId: openTab?.windowId ?? null,
            iconUrl: getFaviconUrl(bookmark.url, openTab?.favIconUrl || ""),
            finalScore: baseScore * context.settings.weights.bookmarks,
            group: "bookmarks",
            providerId: "bookmarks-results",
            dedupeKey: normalizeComparableUrl(bookmark.url)
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
