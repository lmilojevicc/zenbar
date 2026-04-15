import { MODES } from "../shared/constants.js";
import { looksLikeUrl, normalizeComparableUrl, normalizeUrlCandidate } from "../shared/utils.js";

import type { Mode, ResultItem, TogglePinResult, ZenbarSettings } from "../shared/types.js";

type MinimalTab = Pick<chrome.tabs.Tab, "id" | "windowId" | "pinned" | "url"> & Partial<chrome.tabs.Tab>;

export interface ExecutionResult {
  reusedSubmitterTab: boolean;
}

export interface SubmitExecutionContext {
  mode: Mode;
  contextTabId: number | null;
  contextWindowId?: number | null;
  submitterTabId: number | null;
  reuseSubmitterTab: boolean;
  rawQuery?: string;
  knownTabId?: number | null;
  knownWindowId?: number | null;
}

interface SearchExecutionContext {
  mode: Mode;
  contextTabId: number | null;
  submitterTabId: number | null;
  reuseSubmitterTab: boolean;
}

interface SubmitHandlerDependencies {
  activateTab: (tabId: number | null | undefined, windowId: number | null | undefined) => Promise<void>;
  createTab: (properties: chrome.tabs.CreateProperties) => Promise<chrome.tabs.Tab | void | undefined>;
  findMatchingTab: (url: string, excludedTabId: number | null | undefined, windowId: number | null | undefined) => Promise<chrome.tabs.Tab | null>;
  getActiveTab: () => Promise<MinimalTab | null>;
  getTab: (tabId: number) => Promise<MinimalTab | null | undefined>;
  searchQuery: (query: chrome.search.QueryInfo) => Promise<void>;
  updateTab: (tabId: number, properties: chrome.tabs.UpdateProperties) => Promise<chrome.tabs.Tab | void | undefined>;
  updateWindow: (windowId: number, properties: chrome.windows.UpdateInfo) => Promise<unknown>;
}

export function inferImplicitSelection(query: string): ResultItem | null {
  const trimmedQuery = String(query ?? "").trim();

  if (!trimmedQuery) {
    return null;
  }

  if (looksLikeUrl(trimmedQuery)) {
    return {
      id: `url:${normalizeUrlCandidate(trimmedQuery)}`,
      type: "url",
      source: "url",
      url: normalizeUrlCandidate(trimmedQuery)
    };
  }

  return {
    id: `search:${trimmedQuery}`,
    type: "search-action",
    source: "searchAction",
    title: `Search "${trimmedQuery}"`,
    queryText: trimmedQuery
  };
}

export function createSubmitHandlers(dependencies: SubmitHandlerDependencies) {
  return {
    activateTab: dependencies.activateTab,
    openUrl,
    executeSearch,
    executeSelection,
    togglePinnedTab
  };

  async function openUrl(url: string | undefined, context: SubmitExecutionContext): Promise<ExecutionResult> {
    if (!url) {
      return { reusedSubmitterTab: false };
    }

    if (context.mode === MODES.NEW_TAB) {
      if (context.knownTabId) {
        await dependencies.activateTab(context.knownTabId, context.knownWindowId ?? null);
        return { reusedSubmitterTab: false };
      }

      if (context.reuseSubmitterTab && context.submitterTabId) {
        await dependencies.updateTab(context.submitterTabId, { url, active: true });
        return { reusedSubmitterTab: true };
      }

      const matchingTab = await dependencies.findMatchingTab(url, context.contextTabId, context.contextWindowId);

      if (matchingTab?.id) {
        await dependencies.activateTab(matchingTab.id, matchingTab.windowId ?? null);
        return { reusedSubmitterTab: false };
      }

      await dependencies.createTab({ url, active: true });
      return { reusedSubmitterTab: false };
    }

    if (context.contextTabId) {
      await dependencies.updateTab(context.contextTabId, { url });
      return { reusedSubmitterTab: false };
    }

    const activeTab = await dependencies.getActiveTab();

    if (activeTab?.id) {
      await dependencies.updateTab(activeTab.id, { url });
      return { reusedSubmitterTab: false };
    }

    await dependencies.createTab({ url, active: true });
    return { reusedSubmitterTab: false };
  }

  async function executeSearch(text: string | undefined, context: SearchExecutionContext): Promise<ExecutionResult> {
    if (!text) {
      return { reusedSubmitterTab: false };
    }

    if (context.mode === MODES.NEW_TAB) {
      if (context.reuseSubmitterTab && context.submitterTabId) {
        await dependencies.searchQuery({ text, tabId: context.submitterTabId });
        return { reusedSubmitterTab: true };
      }

      await dependencies.searchQuery({ text, disposition: "NEW_TAB" });
      return { reusedSubmitterTab: false };
    }

    if (context.contextTabId) {
      await dependencies.searchQuery({ text, tabId: context.contextTabId });
      return { reusedSubmitterTab: false };
    }

    await dependencies.searchQuery({ text, disposition: "CURRENT_TAB" });
    return { reusedSubmitterTab: false };
  }

  async function executeSelection(selection: ResultItem, context: SubmitExecutionContext): Promise<ExecutionResult> {
    switch (selection.type) {
      case "tab":
        await dependencies.activateTab(selection.tabId, selection.windowId ?? null);
        return { reusedSubmitterTab: false };

      case "bookmark":
      case "history":
      case "url":
        return await openUrl(selection.url, {
          ...context,
          knownTabId: selection.openTabId,
          knownWindowId: selection.openWindowId
        });

      case "search-action":
      case "suggestion":
        return await executeSearch(selection.queryText || context.rawQuery, context);
    }

    return { reusedSubmitterTab: false };
  }

  async function togglePinnedTab(tabId: number | null | undefined): Promise<TogglePinResult> {
    if (!tabId) {
      throw new Error("Missing tab id");
    }

    const tab = await dependencies.getTab(tabId);

    if (!tab?.id) {
      throw new Error("Tab not found");
    }

    const updatedTab = await dependencies.updateTab(tab.id, {
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
}

export function shouldReuseSubmitterTab(
  mode: Mode,
  sender: chrome.runtime.MessageSender,
  windowUrlPrefix: string
): boolean {
  if (mode !== MODES.NEW_TAB || !sender?.tab?.id || !sender.tab.url) {
    return false;
  }

  return sender.tab.url.startsWith(windowUrlPrefix);
}

interface AdaptiveSelectionRecordingOptions {
  mode: Mode;
  rawQuery: string;
  selection: ResultItem | null;
  settings: ZenbarSettings;
  recordSelection: (query: string, result: ResultItem, settings: ZenbarSettings) => Promise<void>;
}

export async function maybeRecordAdaptiveSelection({
  mode,
  rawQuery,
  selection,
  settings,
  recordSelection
}: AdaptiveSelectionRecordingOptions): Promise<void> {
  if (!settings.adaptiveHistoryEnabled || mode === MODES.TAB_SEARCH || !selection || !rawQuery.trim()) {
    return;
  }

  await recordSelection(rawQuery, selection, settings);
}

export async function activateTabWithChrome(
  tabId: number | null | undefined,
  windowId: number | null | undefined,
  getTab: (tabId: number) => Promise<MinimalTab | null | undefined>,
  updateWindow: (windowId: number, properties: chrome.windows.UpdateInfo) => Promise<unknown>,
  updateTab: (tabId: number, properties: chrome.tabs.UpdateProperties) => Promise<chrome.tabs.Tab | void | undefined>
): Promise<void> {
  if (!tabId) {
    return;
  }

  const targetTab = await getTab(tabId);

  if (!targetTab?.id) {
    return;
  }

  await updateWindow(windowId || targetTab.windowId, { focused: true }).catch(() => undefined);
  await updateTab(targetTab.id, { active: true });
}

export async function findMatchingTabWithChrome(
  url: string,
  excludedTabId: number | null | undefined,
  windowId: number | null | undefined,
  queryTabsForWindowId: (windowId: number | null | undefined) => Promise<chrome.tabs.Tab[]>
): Promise<chrome.tabs.Tab | null> {
  const tabs = await queryTabsForWindowId(windowId);
  const comparableUrl = normalizeComparableUrl(url);

  return tabs.find((tab) => {
    if (!tab.url || !tab.id || tab.id === excludedTabId) {
      return false;
    }

    return normalizeComparableUrl(tab.url) === comparableUrl;
  }) || null;
}
