export type Mode = "current-tab" | "new-tab" | "tab-search";
export type SuggestionProvider = "off" | "duckduckgo";
export type ResultSource = "searchAction" | "tabs" | "bookmarks" | "history" | "suggestions" | "url";

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
}

export interface RawZenbarSettings {
  sources?: Partial<SettingsSources>;
  weights?: Partial<SettingsWeights>;
  suggestionProvider?: string;
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
