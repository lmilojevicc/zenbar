import {
  COMMAND_TO_MODE,
  DUCKDUCKGO_ORIGIN,
  MODE_LABELS,
  MODES
} from "../shared/constants.js";
import { ensureSettings, getSettings } from "../shared/settings.js";
import { extractDuckDuckGoSuggestionPhrases } from "../shared/duckduckgo.js";
import {
  createAdaptiveHistoryStore,
} from "./adaptive-history-store.js";
import {
  createQueryContext,
} from "./query-context.js";
import {
  runQueryEngine,
} from "./query-engine.js";
import {
  activateTabWithChrome,
  createSubmitHandlers,
  findMatchingTabWithChrome,
  inferImplicitSelection,
  maybeRecordAdaptiveSelection,
  shouldReuseSubmitterTab as shouldReuseSubmitterTabForWindow,
  type ExecutionResult
} from "./submit.js";
import { createAutofillHeuristicProvider } from "./providers/heuristic/autofill.js";
import { createFallbackHeuristicProvider } from "./providers/heuristic/fallback.js";
import { createHistoryUrlHeuristicProvider } from "./providers/heuristic/history-url.js";
import { createBookmarksResultsProvider } from "./providers/results/bookmarks.js";
import { createHistoryResultsProvider } from "./providers/results/history.js";
import { createInputHistoryResultsProvider } from "./providers/results/input-history.js";
import { createSuggestionsResultsProvider } from "./providers/results/suggestions.js";
import { createTabsResultsProvider } from "./providers/results/tabs.js";
import {
  fuzzyScore,
  getFaviconUrl,
  looksLikeUrl,
  normalizeComparableUrl,
  stripPrefixAndTrim
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

interface MessagePayload {
  type?: string;
  payload?: unknown;
}

interface CloseTabPayload {
  tabId?: number | null;
}

const suggestionControllers = new Map<string, AbortController>();
const adaptiveHistoryStore = createAdaptiveHistoryStore();
const submitHandlers = createSubmitHandlers({
  activateTab: (tabId, windowId) => activateTabWithChrome(
    tabId,
    windowId,
    (id) => chrome.tabs.get(id).catch(() => null),
    (id, properties) => chrome.windows.update(id, properties),
    (id, properties) => chrome.tabs.update(id, properties)
  ),
  createTab: (properties) => chrome.tabs.create(properties),
  findMatchingTab: (url, excludedTabId, windowId) => findMatchingTabWithChrome(url, excludedTabId, windowId, queryTabsForWindowId),
  getActiveTab,
  getTab: (tabId) => chrome.tabs.get(tabId).catch(() => null),
  searchQuery: (query) => chrome.search.query(query),
  updateTab: (tabId, properties) => chrome.tabs.update(tabId, properties),
  updateWindow: (windowId, properties) => chrome.windows.update(windowId, properties)
});

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
        ...(await getResults(message.payload as QueryPayload | undefined, sender))
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
        result: await submitHandlers.togglePinnedTab((message.payload as CloseTabPayload | undefined)?.tabId)
      };

    case "zenbar/clear-adaptive-history":
      await adaptiveHistoryStore.clearAdaptiveHistory();
      return { ok: true };

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

async function getResults(
  payload: QueryPayload | undefined,
  sender: chrome.runtime.MessageSender
): Promise<{ results: ResultItem[]; defaultResult: ResultItem | null; allowEmptySelection: boolean }> {
  const mode = payload?.mode ?? MODES.CURRENT_TAB;
  const query = String(payload?.query ?? "");
  const currentTab = await resolveContextTab(payload?.contextTabId, sender);
  const settings = await getSettings();

  if (mode === MODES.TAB_SEARCH) {
    return {
      results: await buildTabSearchResults(query, currentTab),
      defaultResult: null,
      allowEmptySelection: false
    };
  }

  const permissions = await getPermissionState();
  const context = createQueryContext({
    requestId: `${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    clientId: payload?.clientId,
    mode,
    rawInput: query,
    currentTab,
    settings,
    permissions
  });

  const response = await runQueryEngine(context, createUrlbarProviders(context));

  return {
    results: response.results,
    defaultResult: response.defaultResult,
    allowEmptySelection: response.allowEmptySelection
  };
}

function createUrlbarProviders(context: ReturnType<typeof createQueryContext>) {
  return [
    createAutofillHeuristicProvider({
      resolveResult: resolveAutofillHeuristicResult
    }),
    createHistoryUrlHeuristicProvider({
      resolveResult: resolveHistoryUrlHeuristicResult
    }),
    createFallbackHeuristicProvider(),
    createInputHistoryResultsProvider(adaptiveHistoryStore),
    createTabsResultsProvider({
      queryTabsForWindow
    }),
    createBookmarksResultsProvider({
      queryTabsForWindow
    }),
    createHistoryResultsProvider({
      queryTabsForWindow
    }),
    createSuggestionsResultsProvider({
      fetchSuggestions: (query) => fetchDuckDuckGoSuggestions(query, context.clientId)
    })
  ];
}

async function resolveAutofillHeuristicResult(context: ReturnType<typeof createQueryContext>): Promise<ResultItem | null> {
  if (context.classification === "search" || context.classification === "empty") {
    return null;
  }

  const [adaptiveMatches, windowTabs, bookmarks, historyItems] = await Promise.all([
    context.allowedSources.includes("inputHistory")
      ? adaptiveHistoryStore.getAdaptiveMatches(context.trimmedInput, context.settings)
      : Promise.resolve([]),
    context.allowedSources.includes("tabs")
      ? queryTabsForWindow(context.currentTab)
      : Promise.resolve([]),
    context.allowedSources.includes("bookmarks") && context.permissions.bookmarks
      ? chrome.bookmarks.search(context.trimmedInput)
      : Promise.resolve([]),
    context.allowedSources.includes("history") && context.permissions.history
      ? chrome.history.search({
          text: context.trimmedInput,
          maxResults: 16,
          startTime: 0
        })
      : Promise.resolve([])
  ]);

  const candidates = [
    ...adaptiveMatches.map((entry) => entry.result),
    ...windowTabs
      .filter((tab) => Boolean(tab.url))
      .map((tab) => ({
        id: `autofill-tab:${tab.id}`,
        type: "url" as const,
        source: "url" as const,
        title: tab.title || tab.url || "Untitled tab",
        subtitle: tab.url || "",
        url: tab.url || "",
        openTabId: tab.id ?? null,
        openWindowId: tab.windowId ?? null,
        iconUrl: getFaviconUrl(tab.url, tab.favIconUrl),
        dedupeKey: normalizeComparableUrl(tab.url)
      })),
    ...bookmarks
      .filter((bookmark) => Boolean(bookmark.url))
      .map((bookmark) => ({
        id: `autofill-bookmark:${bookmark.id}`,
        type: "url" as const,
        source: "url" as const,
        title: bookmark.title || bookmark.url || "Bookmark",
        subtitle: bookmark.url || "",
        url: bookmark.url || "",
        dedupeKey: normalizeComparableUrl(bookmark.url)
      })),
    ...historyItems
      .filter((item) => Boolean(item.url))
      .map((item) => ({
        id: `autofill-history:${item.id}`,
        type: "url" as const,
        source: "url" as const,
        title: item.title || item.url || "History",
        subtitle: item.url || "",
        url: item.url || "",
        dedupeKey: normalizeComparableUrl(item.url)
      }))
  ];

  const bestCandidate = candidates
    .map((candidate) => ({
      candidate,
      score: scoreAutofillCandidate(context, candidate.url, candidate.title)
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)[0];

  if (!bestCandidate) {
    return null;
  }

  return {
    ...bestCandidate.candidate,
    finalScore: bestCandidate.score
  };
}

async function resolveHistoryUrlHeuristicResult(context: ReturnType<typeof createQueryContext>): Promise<ResultItem | null> {
  if (!context.permissions.history || !context.normalizedUrlCandidate) {
    return null;
  }

  const historyItems = await chrome.history.search({
    text: context.trimmedInput,
    maxResults: 12,
    startTime: 0
  });
  const matchingItem = historyItems.find((item) => item.url && normalizeComparableUrl(item.url) === normalizeComparableUrl(context.normalizedUrlCandidate));

  if (!matchingItem?.url || !matchingItem.title) {
    return null;
  }

  return {
    id: `history-heuristic:${matchingItem.id}`,
    type: "history",
    source: "history",
    title: matchingItem.title,
    subtitle: matchingItem.url,
    url: matchingItem.url,
    iconUrl: getFaviconUrl(matchingItem.url),
    dedupeKey: normalizeComparableUrl(matchingItem.url)
  };
}

async function fetchDuckDuckGoSuggestions(query: string, clientId?: string): Promise<string[]> {
  if (!query || looksLikeUrl(query)) {
    cancelSuggestionRequest(clientId);
    return [];
  }

  const controller = createSuggestionController(clientId);

  try {
    const response = await fetch(`https://duckduckgo.com/ac/?q=${encodeURIComponent(query)}`, {
      signal: controller.signal,
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo suggestions failed with ${response.status}`);
    }

    return extractDuckDuckGoSuggestionPhrases(await response.json());
  } finally {
    releaseSuggestionController(clientId, controller);
  }
}

function scoreAutofillCandidate(
  context: ReturnType<typeof createQueryContext>,
  candidateUrl: string | undefined,
  candidateTitle?: string
): number {
  if (!candidateUrl) {
    return 0;
  }

  const comparableCandidateUrl = normalizeComparableUrl(candidateUrl);
  const comparableInputUrl = context.normalizedUrlCandidate ? normalizeComparableUrl(context.normalizedUrlCandidate) : "";
  const strippedCandidate = stripPrefixAndTrim(candidateUrl);
  const strippedInput = context.strippedInput;
  let score = 0;

  if (comparableInputUrl && comparableCandidateUrl === comparableInputUrl) {
    score += 400;
  }

  if (comparableInputUrl && comparableCandidateUrl.startsWith(comparableInputUrl)) {
    score += 240;
  }

  if (strippedInput && strippedCandidate.startsWith(strippedInput)) {
    score += 180;
  }

  score += fuzzyScore(context.trimmedInput, candidateTitle, candidateUrl);

  return score;
}

async function buildTabSearchResults(
  rawQuery: string,
  currentTab: chrome.tabs.Tab | null
): Promise<ResultItem[]> {
  const query = rawQuery.trim();
  const tabs = await queryTabsForWindow(currentTab);

  return tabs
    .filter((tab) => typeof tab.id === "number" && tab.id !== currentTab?.id && Boolean(tab.url))
    .map((tab): ResultItem | null => {
      if (typeof tab.id !== "number" || !tab.url) {
        return null;
      }

      const baseScore = query ? fuzzyScore(query, tab.title, tab.url) : 24;

      if (query && baseScore <= 0) {
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
        closeable: true,
        finalScore: baseScore
      };
    })
    .filter((result): result is ResultItem => result !== null)
    .sort((left, right) => {
      if ((right.finalScore ?? 0) !== (left.finalScore ?? 0)) {
        return (right.finalScore ?? 0) - (left.finalScore ?? 0);
      }

      return String(left.title).localeCompare(String(right.title));
    });
}

async function submitSelection(payload: SubmitPayload | undefined, sender: chrome.runtime.MessageSender): Promise<{ ok: true; closeSurface: boolean }> {
  const mode = payload?.mode ?? MODES.CURRENT_TAB;
  const rawQuery = String(payload?.rawQuery ?? "").trim();
  const selection = (payload?.selectedResult as ResultItem | null | undefined)
    ?? (payload?.defaultResult as ResultItem | null | undefined)
    ?? inferImplicitSelection(rawQuery);
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

    await submitHandlers.activateTab(selection.tabId, selection.windowId ?? selection.openWindowId ?? null);
    return { ok: true, closeSurface: true };
  }

  const execution = await submitHandlers.executeSelection(selection, {
    mode,
    contextTabId: payload?.contextTabId ?? null,
    contextWindowId: contextTab?.windowId ?? null,
    rawQuery,
    submitterTabId,
    reuseSubmitterTab
  });

  await maybeRecordAdaptiveSelection({
    mode,
    rawQuery,
    selection,
    settings: await getSettings(),
    recordSelection: (query, result, settings) => adaptiveHistoryStore.recordSelection(query, result, settings)
  });

  return {
    ok: true,
    closeSurface: !execution.reusedSubmitterTab
  };
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
  return shouldReuseSubmitterTabForWindow(mode, sender, chrome.runtime.getURL("ui/window.html"));
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
