export type Mode = "current-tab" | "new-tab" | "tab-search";
export type SuggestionProvider = "off" | "duckduckgo";
export type ResultSource = "searchAction" | "tabs" | "bookmarks" | "history" | "suggestions" | "url" | "inputHistory";
export type QueryClassification = "empty" | "search" | "origin-like" | "url-like" | "deep-url";
export type ProviderKind = "heuristic" | "normal";
export type UserSelectionBehavior = "none" | "arrow" | "pointer";
export type ProviderId =
  | "autofill-heuristic"
  | "history-url-heuristic"
  | "fallback-heuristic"
  | "tabs-results"
  | "bookmarks-results"
  | "history-results"
  | "suggestions-results"
  | "input-history-results"
  | "unknown-provider";
export type ResultGroup =
  | "heuristic"
  | "tabs"
  | "bookmarks"
  | "history"
  | "suggestions"
  | "input-history"
  | "search"
  | "url";

export interface SettingsSources {
  tabs: boolean;
  bookmarks: boolean;
  history: boolean;
}

export interface SettingsWeights {
  searchAction: number;
  tabs: number;
  bookmarks: number;
  history: number;
  suggestions: number;
  currentWindowTabs: number;
}

export interface ZenbarSettings {
  sources: SettingsSources;
  weights: SettingsWeights;
  suggestionProvider: SuggestionProvider;
  adaptiveHistoryEnabled: boolean;
}

export interface RawZenbarSettings {
  sources?: Partial<SettingsSources>;
  weights?: Partial<SettingsWeights>;
  suggestionProvider?: string;
  adaptiveHistoryEnabled?: boolean;
}

export interface PermissionState {
  bookmarks: boolean;
  history: boolean;
  duckduckgo: boolean;
}

export interface SerializedTab {
  id: number | null;
  windowId: number | null;
  url: string;
  title: string;
  favIconUrl: string;
}

interface BaseResult {
  id: string;
  source: ResultSource;
  title?: string;
  subtitle?: string;
  url?: string;
  queryText?: string;
  iconUrl?: string;
  finalScore?: number;
  tabId?: number | null;
  windowId?: number | null;
  openTabId?: number | null;
  openWindowId?: number | null;
  pinned?: boolean;
  closeable?: boolean;
  heuristic?: boolean;
  group?: ResultGroup;
  providerId?: ProviderId;
  dedupeKey?: string;
  suggestedIndex?: number;
}

export interface SearchActionResult extends BaseResult {
  type: "search-action";
  source: "searchAction";
  queryText: string;
}

export interface SuggestionResult extends BaseResult {
  type: "suggestion";
  source: "suggestions";
  queryText: string;
}

export interface TabResult extends BaseResult {
  type: "tab";
  source: "tabs";
  tabId: number;
}

export interface BookmarkResult extends BaseResult {
  type: "bookmark";
  source: "bookmarks";
  url: string;
}

export interface HistoryResult extends BaseResult {
  type: "history";
  source: "history";
  url: string;
}

export interface UrlResult extends BaseResult {
  type: "url";
  source: "url";
  url: string;
}

export type ResultItem =
  | SearchActionResult
  | SuggestionResult
  | TabResult
  | BookmarkResult
  | HistoryResult
  | UrlResult;

export interface UiContext {
  mode: Mode;
  currentTab: SerializedTab | null;
  settings: ZenbarSettings;
  permissions: PermissionState;
}

export interface OpenPayload {
  mode?: Mode;
  contextTabId?: number | null;
}

export interface QueryPayload extends OpenPayload {
  query?: string;
  clientId?: string;
}

export interface SubmitPayload extends OpenPayload {
  rawQuery?: string;
  selectedResult?: ResultItem | null;
}

export interface QueryContext {
  requestId: string;
  clientId?: string;
  mode: Mode;
  rawInput: string;
  trimmedInput: string;
  normalizedInput: string;
  strippedInput: string;
  normalizedUrlCandidate: string;
  classification: QueryClassification;
  currentTab: chrome.tabs.Tab | null;
  permissions: PermissionState;
  settings: ZenbarSettings;
  allowedSources: ResultSource[];
  pendingProviderIds: ProviderId[];
  heuristicCandidates: ResultItem[];
  normalCandidates: ResultItem[];
  heuristicResult: ResultItem | null;
  defaultResult: ResultItem | null;
  results: ResultItem[];
  allowEmptySelection: boolean;
}

export interface QueryProvider {
  id: ProviderId;
  kind: ProviderKind;
  group: ResultGroup;
  priority?: number;
  isActive: (context: QueryContext) => boolean | Promise<boolean>;
  start: (context: QueryContext) => Promise<ResultItem[]>;
}

export interface QueryEngineResponse {
  context: QueryContext;
  results: ResultItem[];
  defaultResult: ResultItem | null;
  allowEmptySelection: boolean;
}

export interface ErrorResponse {
  ok: false;
  error: string;
}

export interface UiContextSuccessResponse {
  ok: true;
  context: UiContext;
}

export interface QuerySuccessResponse {
  ok: true;
  results: ResultItem[];
}

export interface SubmitSuccessResponse {
  ok: true;
  closeSurface?: boolean;
}

export interface TogglePinResult {
  tabId: number | undefined;
  pinned: boolean;
}

export interface TogglePinSuccessResponse {
  ok: true;
  result: TogglePinResult;
}

export interface BasicSuccessResponse {
  ok: true;
}

export type UiContextResponse = UiContextSuccessResponse | ErrorResponse;
export type QueryResponse = QuerySuccessResponse | ErrorResponse;
export type SubmitResponse = SubmitSuccessResponse | ErrorResponse;
export type TogglePinResponse = TogglePinSuccessResponse | ErrorResponse;
export type BasicResponse = BasicSuccessResponse | ErrorResponse;
