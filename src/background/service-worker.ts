import {
  COMMAND_TO_MODE,
  DUCKDUCKGO_ORIGIN,
  MAX_RESULTS,
  MODE_LABELS,
  MODES,
  SOURCE_PRIORITY
} from "../shared/constants.js";
import { ensureSettings, getSettings } from "../shared/settings.js";
import { extractDuckDuckGoSuggestionPhrases } from "../shared/duckduckgo.js";
import {
  fuzzyScore,
  getFaviconUrl,
  looksLikeUrl,
  normalizeComparableUrl,
  normalizeUrlCandidate
} from "../shared/utils.js";

import type {
  BasicResponse,
  Mode,
  OpenPayload,
  PermissionState,
  QueryPayload,
  ResultItem,
  SerializedTab,
  SubmitPayload,
  TogglePinResult,
  UiContext,
  UrlResult,
  ZenbarSettings
} from "../shared/types.js";

interface RankedResult {
  id: string;
  type: string;
  source: string;
  title?: string;
  subtitle?: string;
  url?: string;
  queryText?: string;
  iconUrl?: string;
  finalScore: number;
  tabId?: number | null;
  windowId?: number | null;
  openTabId?: number | null;
  openWindowId?: number | null;
  pinned?: boolean;
  closeable?: boolean;
}

interface MessagePayload {
  type?: string;
  payload?: unknown;
}

interface CloseTabPayload {
  tabId?: number | null;
}

interface SubmitContext {
  mode: Mode;
  contextTabId: number | null;
  contextWindowId: number | null;
  rawQuery: string;
  submitterTabId: number | null;
  reuseSubmitterTab: boolean;
}

interface ExecutionResult {
  reusedSubmitterTab: boolean;
}

const suggestionControllers = new Map<string, AbortController>();

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await ensureSettings();

  if (reason === "install") {
    await chrome.runtime.openOptionsPage().catch(() => {});
  }
});

chrome.runtime.onStartup.addListener(() => {
  ensureSettings().catch(() => {});
});

chrome.commands.onCommand.addListener((commandName) => {
  const mode = COMMAND_TO_MODE[commandName as keyof typeof COMMAND_TO_MODE];

  if (!mode) {
    return;
  }

  openZenbar(mode).catch((error) => {
    console.error("Failed to open Zenbar", error);
  });
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage().catch((error) => {
    console.error("Failed to open Zenbar settings", error);
  });
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!isZenbarMessage(message)) {
    return undefined;
  }

  handleMessage(message, sender)
    .then((response) => sendResponse(response))
    .catch((error: unknown) => {
      sendResponse({
        ok: false,
        error: getErrorMessage(error, "Unknown error")
      });
    });

  return true;
});

async function handleMessage(message: MessagePayload & { type: string }, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (message.type) {
    case "zenbar/get-context":
      return {
        ok: true,
        context: await getUiContext(message.payload as OpenPayload | undefined, sender)
      };

    case "zenbar/query":
      return {
        ok: true,
        results: await getResults(message.payload as QueryPayload | undefined, sender)
      };

    case "zenbar/submit":
      return await submitSelection(message.payload as SubmitPayload | undefined, sender);

    case "zenbar/close-tab":
      if (typeof (message.payload as CloseTabPayload | undefined)?.tabId === "number") {
        await chrome.tabs.remove((message.payload as CloseTabPayload).tabId!);
      }
      return { ok: true };

    case "zenbar/toggle-pin-tab":
      return {
        ok: true,
        result: await togglePinnedTab((message.payload as CloseTabPayload | undefined)?.tabId)
      };

    default:
      return {
        ok: false,
        error: `Unsupported message type: ${message.type}`
      };
  }
}

async function openZenbar(mode: Mode): Promise<void> {
  const activeTab = await getActiveTab();

  if (!activeTab) {
    await openFallbackPage(mode, null);
    return;
  }

  const injected = await tryOpenOverlay(activeTab.id, {
    mode,
    contextTabId: activeTab.id
  });

  if (!injected) {
    await openFallbackPage(mode, activeTab);
  }
}

async function tryOpenOverlay(tabId: number | undefined, payload: OpenPayload): Promise<boolean> {
  if (!tabId) {
    return false;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["src/content/bootstrap.js"]
    });

    const response = await chrome.tabs.sendMessage(tabId, {
      type: "zenbar/open-overlay",
      payload
    }) as BasicResponse | undefined;

    return Boolean(response?.ok);
  } catch {
    return false;
  }
}

async function openFallbackPage(mode: Mode, tab: chrome.tabs.Tab | null): Promise<void> {
  const url = new URL(chrome.runtime.getURL("ui/window.html"));
  url.searchParams.set("mode", mode);

  if (tab?.id) {
    url.searchParams.set("tabId", String(tab.id));
  }

  await chrome.tabs.create({
    url: url.toString(),
    active: true,
    index: typeof tab?.index === "number" ? tab.index + 1 : undefined
  });
}

async function getUiContext(payload: OpenPayload | undefined, sender: chrome.runtime.MessageSender): Promise<UiContext> {
  const currentTab = await resolveContextTab(payload?.contextTabId, sender);

  return {
    mode: payload?.mode ?? MODES.CURRENT_TAB,
    currentTab: serializeTab(currentTab),
    settings: await getSettings(),
    permissions: await getPermissionState()
  };
}

async function getResults(payload: QueryPayload | undefined, sender: chrome.runtime.MessageSender): Promise<RankedResult[]> {
  const mode = payload?.mode ?? MODES.CURRENT_TAB;
  const query = String(payload?.query ?? "");
  const currentTab = await resolveContextTab(payload?.contextTabId, sender);
  const settings = await getSettings();

  if (mode === MODES.TAB_SEARCH) {
    return await buildTabSearchResults(query, currentTab, settings);
  }

  return await buildGlobalResults(query, currentTab, settings, payload?.clientId);
}

async function buildGlobalResults(
  rawQuery: string,
  currentTab: chrome.tabs.Tab | null,
  settings: ZenbarSettings,
  clientId?: string
): Promise<RankedResult[]> {
  const query = rawQuery.trim();

  if (!query) {
    cancelSuggestionRequest(clientId);
    return [];
  }

  const permissions = await getPermissionState();
  const windowTabs = await queryTabsForWindow(currentTab);
  const openTabByUrl = createOpenTabMap(windowTabs, currentTab?.id);

  const [tabResults, bookmarkResults, historyResults, suggestionResults] = await Promise.all([
    settings.sources.tabs
      ? buildOpenTabResults(windowTabs, query, currentTab, settings)
      : Promise.resolve([]),
    settings.sources.bookmarks && permissions.bookmarks
      ? buildBookmarkResults(query, settings, openTabByUrl)
      : Promise.resolve([]),
    settings.sources.history && permissions.history
      ? buildHistoryResults(query, settings, openTabByUrl)
      : Promise.resolve([]),
    settings.suggestionProvider === "duckduckgo" && permissions.duckduckgo
      ? buildSuggestionResults(query, settings, clientId)
      : Promise.resolve([])
  ]);

  const searchActionResult: RankedResult[] = looksLikeUrl(query)
    ? []
    : [
        {
          id: `search:${query}`,
          type: "search-action",
          source: "searchAction",
          title: `Search \"${query}\"`,
          subtitle: "Use your default browser search engine",
          queryText: query,
          finalScore: 120 * settings.weights.searchAction
        }
      ];

  return dedupeAndSortResults([
    ...searchActionResult,
    ...tabResults,
    ...bookmarkResults,
    ...historyResults,
    ...suggestionResults
  ]).slice(0, MAX_RESULTS);
}

async function buildTabSearchResults(
  rawQuery: string,
  currentTab: chrome.tabs.Tab | null,
  settings: ZenbarSettings
): Promise<RankedResult[]> {
  const query = rawQuery.trim();
  const tabs = await queryTabsForWindow(currentTab);

  return tabs
    .filter((tab) => typeof tab.id === "number" && tab.id !== currentTab?.id && Boolean(tab.url))
    .map((tab): RankedResult | null => {
      if (typeof tab.id !== "number" || !tab.url) {
        return null;
      }

      const baseScore = query ? fuzzyScore(query, tab.title, tab.url) : 24;

      if (query && baseScore <= 0) {
        return null;
      }

      const windowBoost = tab.windowId === currentTab?.windowId
        ? settings.weights.currentWindowTabs * 100
        : 0;

      return {
        id: `tab:${tab.id}`,
        type: "tab",
        source: "tabs",
        title: tab.title || tab.url || "Untitled tab",
        subtitle: tab.url || "",
        url: tab.url || "",
        tabId: tab.id,
        windowId: tab.windowId ?? null,
        pinned: Boolean(tab.pinned),
        iconUrl: getFaviconUrl(tab.url, tab.favIconUrl),
        closeable: true,
        finalScore: baseScore * settings.weights.tabs + windowBoost
      };
    })
    .filter((result): result is RankedResult => result !== null)
    .sort(compareResults);
}

function buildOpenTabResults(
  allTabs: chrome.tabs.Tab[],
  query: string,
  currentTab: chrome.tabs.Tab | null,
  settings: ZenbarSettings
): RankedResult[] {
  return allTabs
    .filter((tab) => typeof tab.id === "number" && tab.id !== currentTab?.id && Boolean(tab.url))
    .map((tab): RankedResult | null => {
      if (typeof tab.id !== "number" || !tab.url) {
        return null;
      }

      const baseScore = fuzzyScore(query, tab.title, tab.url);

      if (baseScore <= 0) {
        return null;
      }

      return {
        id: `tab:${tab.id}`,
        type: "tab",
        source: "tabs",
        title: tab.title || tab.url || "Untitled tab",
        subtitle: tab.url || "",
        url: tab.url || "",
        tabId: tab.id,
        windowId: tab.windowId ?? null,
        pinned: Boolean(tab.pinned),
        iconUrl: getFaviconUrl(tab.url, tab.favIconUrl),
        finalScore: baseScore * settings.weights.tabs
      };
    })
    .filter((result): result is RankedResult => result !== null);
}

async function buildBookmarkResults(
  query: string,
  settings: ZenbarSettings,
  openTabByUrl: Map<string, chrome.tabs.Tab>
): Promise<RankedResult[]> {
  const bookmarks = await chrome.bookmarks.search(query);

  return bookmarks
    .filter((bookmark) => Boolean(bookmark.url))
    .slice(0, 28)
    .map((bookmark): RankedResult | null => {
      if (!bookmark.url) {
        return null;
      }

      const baseScore = fuzzyScore(query, bookmark.title, bookmark.url);

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
        finalScore: baseScore * settings.weights.bookmarks
      };
    })
    .filter((result): result is RankedResult => result !== null);
}

async function buildHistoryResults(
  query: string,
  settings: ZenbarSettings,
  openTabByUrl: Map<string, chrome.tabs.Tab>
): Promise<RankedResult[]> {
  const historyItems = await chrome.history.search({
    text: query,
    maxResults: 28,
    startTime: 0
  });

  return historyItems
    .filter((item) => Boolean(item.url))
    .map((item): RankedResult | null => {
      if (!item.url) {
        return null;
      }

      const baseScore = fuzzyScore(query, item.title, item.url);

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
        finalScore: baseScore * settings.weights.history
      };
    })
    .filter((result): result is RankedResult => result !== null);
}

async function buildSuggestionResults(query: string, settings: ZenbarSettings, clientId?: string): Promise<RankedResult[]> {
  if (!query || looksLikeUrl(query)) {
    cancelSuggestionRequest(clientId);
    return [];
  }

  const controller = createSuggestionController(clientId);

  try {
    const response = await fetch(
      `https://duckduckgo.com/ac/?q=${encodeURIComponent(query)}`,
      {
        signal: controller.signal,
        headers: {
          Accept: "application/json"
        }
      }
    );

    if (!response.ok) {
      throw new Error(`DuckDuckGo suggestions failed with ${response.status}`);
    }

    const suggestions = await response.json();
    const phrases = extractDuckDuckGoSuggestionPhrases(suggestions);

    return phrases
      .filter((phrase) => phrase.toLowerCase() !== query.toLowerCase())
      .slice(0, 4)
      .map((phrase) => ({
        id: `suggestion:${phrase}`,
        type: "suggestion",
        source: "suggestions",
        title: phrase,
        subtitle: "Search suggestion",
        queryText: phrase,
        finalScore: fuzzyScore(query, phrase) * settings.weights.suggestions
      }))
      .filter((entry) => entry.finalScore > 0);
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      return [];
    }

    console.warn("DuckDuckGo suggestion error", error);
    return [];
  } finally {
    releaseSuggestionController(clientId, controller);
  }
}

function dedupeAndSortResults(results: Array<RankedResult | null>): RankedResult[] {
  const searchMap = new Map<string, RankedResult>();
  const urlMap = new Map<string, RankedResult>();

  for (const result of results) {
    if (!result) {
      continue;
    }

    if (result.type === "search-action" || result.type === "suggestion") {
      const key = `${result.type}:${String(result.queryText || result.title).toLowerCase()}`;
      const existing = searchMap.get(key);

      if (!existing || compareResults(result, existing) < 0) {
        searchMap.set(key, result);
      }

      continue;
    }

    const key = normalizeComparableUrl(result.url) || result.id;
    const existing = urlMap.get(key);

    if (!existing || compareResults(result, existing) < 0) {
      urlMap.set(key, result);
    }
  }

  return [...searchMap.values(), ...urlMap.values()].sort(compareResults);
}

function compareResults(left: RankedResult, right: RankedResult): number {
  if (right.finalScore !== left.finalScore) {
    return right.finalScore - left.finalScore;
  }

  const priorityDelta =
    (SOURCE_PRIORITY[right.source as keyof typeof SOURCE_PRIORITY] ?? 0) -
    (SOURCE_PRIORITY[left.source as keyof typeof SOURCE_PRIORITY] ?? 0);

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  return String(left.title).localeCompare(String(right.title));
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

async function submitSelection(payload: SubmitPayload | undefined, sender: chrome.runtime.MessageSender): Promise<{ ok: true; closeSurface: boolean }> {
  const mode = payload?.mode ?? MODES.CURRENT_TAB;
  const rawQuery = String(payload?.rawQuery ?? "").trim();
  const selection = (payload?.selectedResult as ResultItem | null | undefined) ?? inferImplicitSelection(rawQuery);
  const reuseSubmitterTab = shouldReuseSubmitterTab(mode, sender);
  const submitterTabId = sender?.tab?.id ?? null;
  const contextTab = await resolveContextTab(payload?.contextTabId, sender);

  if (!selection) {
    return { ok: true, closeSurface: false };
  }

  if (mode === MODES.TAB_SEARCH) {
    if (selection.type !== "tab" || typeof selection.tabId !== "number") {
      return { ok: true, closeSurface: false };
    }

    await activateTab(selection.tabId, selection.windowId ?? selection.openWindowId ?? null);
    return { ok: true, closeSurface: true };
  }

  const execution = await executeSelection(selection, {
    mode,
    contextTabId: payload?.contextTabId ?? null,
    contextWindowId: contextTab?.windowId ?? null,
    rawQuery,
    submitterTabId,
    reuseSubmitterTab
  });

  return {
    ok: true,
    closeSurface: !execution.reusedSubmitterTab
  };
}

function inferImplicitSelection(query: string): ResultItem | null {
  if (!query) {
    return null;
  }

  if (looksLikeUrl(query)) {
    return {
      id: `url:${normalizeUrlCandidate(query)}`,
      type: "url",
      source: "url",
      url: normalizeUrlCandidate(query)
    };
  }

  return {
    id: `search:${query}`,
    type: "search-action",
    source: "searchAction",
    title: `Search "${query}"`,
    queryText: query
  };
}

async function executeSelection(selection: ResultItem, context: SubmitContext): Promise<ExecutionResult> {
  switch (selection.type) {
    case "tab":
      await activateTab(selection.tabId, selection.windowId ?? null);
      return { reusedSubmitterTab: false };

    case "bookmark":
    case "history":
    case "url":
      return await openUrl(
        selection.url,
        context.mode,
        context.contextTabId,
        selection.openTabId,
        selection.openWindowId,
        context.contextWindowId,
        context.submitterTabId,
        context.reuseSubmitterTab
      );

    case "search-action":
    case "suggestion":
      return await executeSearch(
        selection.queryText || context.rawQuery,
        context.mode,
        context.contextTabId,
        context.submitterTabId,
        context.reuseSubmitterTab
      );
  }

  return { reusedSubmitterTab: false };
}

async function openUrl(
  url: string | undefined,
  mode: Mode,
  contextTabId: number | null,
  knownTabId?: number | null,
  knownWindowId?: number | null,
  currentWindowId?: number | null,
  submitterTabId?: number | null,
  reuseSubmitterTab = false
): Promise<ExecutionResult> {
  if (!url) {
    return { reusedSubmitterTab: false };
  }

  if (mode === MODES.NEW_TAB) {
    if (knownTabId) {
      await activateTab(knownTabId, knownWindowId ?? null);
      return { reusedSubmitterTab: false };
    }

    if (reuseSubmitterTab && submitterTabId) {
      await chrome.tabs.update(submitterTabId, { url, active: true });
      return { reusedSubmitterTab: true };
    }

    const matchingTab = await findMatchingTab(url, contextTabId, currentWindowId);

    if (matchingTab?.id) {
      await activateTab(matchingTab.id, matchingTab.windowId ?? null);
      return { reusedSubmitterTab: false };
    }

    await chrome.tabs.create({ url, active: true });
    return { reusedSubmitterTab: false };
  }

  if (contextTabId) {
    await chrome.tabs.update(contextTabId, { url });
    return { reusedSubmitterTab: false };
  }

  const activeTab = await getActiveTab();

  if (activeTab?.id) {
    await chrome.tabs.update(activeTab.id, { url });
    return { reusedSubmitterTab: false };
  }

  await chrome.tabs.create({ url, active: true });
  return { reusedSubmitterTab: false };
}

async function executeSearch(
  text: string | undefined,
  mode: Mode,
  contextTabId: number | null,
  submitterTabId: number | null,
  reuseSubmitterTab: boolean
): Promise<ExecutionResult> {
  if (!text) {
    return { reusedSubmitterTab: false };
  }

  if (mode === MODES.NEW_TAB) {
    if (reuseSubmitterTab && submitterTabId) {
      await chrome.search.query({
        text,
        tabId: submitterTabId
      });
      return { reusedSubmitterTab: true };
    }

    await chrome.search.query({
      text,
      disposition: "NEW_TAB"
    });
    return { reusedSubmitterTab: false };
  }

  if (contextTabId) {
    await chrome.search.query({
      text,
      tabId: contextTabId
    });
    return { reusedSubmitterTab: false };
  }

  await chrome.search.query({
    text,
    disposition: "CURRENT_TAB"
  });
  return { reusedSubmitterTab: false };
}

async function activateTab(tabId: number | null | undefined, windowId: number | null | undefined): Promise<void> {
  if (!tabId) {
    return;
  }

  const targetTab = await chrome.tabs.get(tabId).catch(() => null);

  if (!targetTab) {
    return;
  }

  await chrome.windows.update(windowId || targetTab.windowId, { focused: true }).catch(() => {});
  await chrome.tabs.update(targetTab.id, { active: true });
}

async function togglePinnedTab(tabId: number | null | undefined): Promise<TogglePinResult> {
  if (!tabId) {
    throw new Error("Missing tab id");
  }

  const tab = await chrome.tabs.get(tabId);
  const updatedTab = await chrome.tabs.update(tab.id, {
    pinned: !tab.pinned
  });

  if (!updatedTab || typeof updatedTab.id !== "number") {
    throw new Error("Updated tab is missing an id");
  }

  return {
    tabId: updatedTab.id,
    pinned: Boolean(updatedTab.pinned)
  };
}

async function findMatchingTab(url: string, excludedTabId: number | null | undefined, windowId: number | null | undefined): Promise<chrome.tabs.Tab | null> {
  const tabs = await queryTabsForWindowId(windowId);
  const comparableUrl = normalizeComparableUrl(url);

  return tabs.find((tab) => {
    if (!tab.url || !tab.id || tab.id === excludedTabId) {
      return false;
    }

    return normalizeComparableUrl(tab.url) === comparableUrl;
  }) || null;
}

async function resolveContextTab(contextTabId: number | null | undefined, sender: chrome.runtime.MessageSender): Promise<chrome.tabs.Tab | null> {
  if (contextTabId) {
    const byId = await chrome.tabs.get(contextTabId).catch(() => null);

    if (byId) {
      return byId;
    }
  }

  if (sender?.tab) {
    return sender.tab;
  }

  return await getActiveTab();
}

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  return tab ?? null;
}

async function queryTabsForWindow(currentTab: chrome.tabs.Tab | null): Promise<chrome.tabs.Tab[]> {
  return await queryTabsForWindowId(currentTab?.windowId ?? null);
}

async function queryTabsForWindowId(windowId: number | null | undefined): Promise<chrome.tabs.Tab[]> {
  if (windowId) {
    return await chrome.tabs.query({ windowId });
  }

  return await chrome.tabs.query({ currentWindow: true });
}

function shouldReuseSubmitterTab(mode: Mode, sender: chrome.runtime.MessageSender): boolean {
  if (mode !== MODES.NEW_TAB || !sender?.tab?.id || !sender.tab.url) {
    return false;
  }

  return sender.tab.url.startsWith(chrome.runtime.getURL("ui/window.html"));
}

async function getPermissionState(): Promise<PermissionState> {
  const [bookmarks, history, duckduckgo] = await Promise.all([
    chrome.permissions.contains({ permissions: ["bookmarks"] }),
    chrome.permissions.contains({ permissions: ["history"] }),
    chrome.permissions.contains({ origins: [DUCKDUCKGO_ORIGIN] })
  ]);

  return {
    bookmarks,
    history,
    duckduckgo
  };
}

function serializeTab(tab: chrome.tabs.Tab | null | undefined): SerializedTab | null {
  if (!tab) {
    return null;
  }

  return {
    id: tab.id ?? null,
    windowId: tab.windowId ?? null,
    url: tab.url ?? "",
    title: tab.title ?? MODE_LABELS[MODES.CURRENT_TAB],
    favIconUrl: getFaviconUrl(tab.url, tab.favIconUrl)
  };
}

function createSuggestionController(clientId?: string): AbortController {
  if (!clientId) {
    return new AbortController();
  }

  cancelSuggestionRequest(clientId);

  const controller = new AbortController();
  suggestionControllers.set(clientId, controller);
  return controller;
}

function cancelSuggestionRequest(clientId?: string): void {
  if (!clientId) {
    return;
  }

  suggestionControllers.get(clientId)?.abort();
  suggestionControllers.delete(clientId);
}

function releaseSuggestionController(clientId: string | undefined, controller: AbortController): void {
  if (!clientId) {
    return;
  }

  if (suggestionControllers.get(clientId) === controller) {
    suggestionControllers.delete(clientId);
  }
}

function isZenbarMessage(message: unknown): message is MessagePayload & { type: string } {
  return (
    typeof message === "object" &&
    message !== null &&
    typeof (message as MessagePayload).type === "string" &&
    (message as MessagePayload).type!.startsWith("zenbar/")
  );
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
