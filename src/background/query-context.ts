import { MODES } from "../shared/constants.js";
import {
  classifyQueryInput,
  looksLikeUrl,
  normalizeText,
  normalizeUrlCandidate,
  stripPrefixAndTrim
} from "../shared/utils.js";

import type {
  PermissionState,
  QueryContext,
  ResultSource,
  SerializedTab,
  ZenbarSettings
} from "../shared/types.js";

interface CreateQueryContextOptions {
  requestId: string;
  clientId?: string;
  mode: QueryContext["mode"];
  rawInput: string;
  currentTab: chrome.tabs.Tab | null;
  settings: ZenbarSettings;
  permissions: PermissionState;
}

export function createQueryContext({
  requestId,
  clientId,
  mode,
  rawInput,
  currentTab,
  settings,
  permissions
}: CreateQueryContextOptions): QueryContext {
  const trimmedInput = rawInput.trim();

  return {
    requestId,
    clientId,
    mode,
    rawInput,
    trimmedInput,
    normalizedInput: normalizeText(trimmedInput),
    strippedInput: stripPrefixAndTrim(trimmedInput),
    normalizedUrlCandidate: looksLikeUrl(trimmedInput) ? normalizeUrlCandidate(trimmedInput) : "",
    classification: classifyQueryInput(trimmedInput),
    currentTab,
    permissions,
    settings,
    allowedSources: buildAllowedSources(mode, settings, permissions),
    pendingProviderIds: [],
    heuristicCandidates: [],
    normalCandidates: [],
    heuristicResult: null,
    defaultResult: null,
    results: [],
    allowEmptySelection: true
  };
}

function buildAllowedSources(
  mode: QueryContext["mode"],
  settings: ZenbarSettings,
  permissions: PermissionState
): ResultSource[] {
  if (mode === MODES.TAB_SEARCH) {
    return ["tabs"];
  }

  const allowedSources: ResultSource[] = ["url", "searchAction"];

  if (settings.sources.tabs) {
    allowedSources.push("tabs");
  }

  if (settings.sources.bookmarks && permissions.bookmarks) {
    allowedSources.push("bookmarks");
  }

  if (settings.sources.history && permissions.history) {
    allowedSources.push("history");
  }

  if (settings.adaptiveHistoryEnabled) {
    allowedSources.push("inputHistory");
  }

  if (settings.suggestionProvider === "duckduckgo" && permissions.duckduckgo) {
    allowedSources.push("suggestions");
  }

  return allowedSources;
}
