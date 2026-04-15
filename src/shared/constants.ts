import type { Mode, ResultSource, ZenbarSettings } from "./types.js";

interface ModeMeta {
  label: string;
  placeholder: string;
  helper: string;
}

export const MODES = Object.freeze({
  CURRENT_TAB: "current-tab",
  NEW_TAB: "new-tab",
  TAB_SEARCH: "tab-search"
} satisfies Record<string, Mode>);

export const COMMAND_TO_MODE = Object.freeze({
  "open-current-tab-mode": MODES.CURRENT_TAB,
  "open-new-tab-mode": MODES.NEW_TAB,
  "open-tab-search-mode": MODES.TAB_SEARCH
} satisfies Record<string, Mode>);

export const MODE_META = Object.freeze({
  [MODES.CURRENT_TAB]: {
    label: "Current Tab",
    placeholder: "Type a URL or search this tab",
    helper: "Enter navigates or searches in the current tab."
  },
  [MODES.NEW_TAB]: {
    label: "Open In New Tab",
    placeholder: "Search or open a destination",
    helper: "Enter opens the highlight in a new tab or switches to an existing match."
  },
  [MODES.TAB_SEARCH]: {
    label: "Tab Search",
    placeholder: "Jump to a tab",
    helper: "Enter switches tabs. Cmd/Ctrl+P pins tabs. Cmd/Ctrl+X closes the highlighted tab."
  }
} satisfies Record<Mode, ModeMeta>);

export const MODE_LABELS: Record<Mode, string> = Object.freeze(
  Object.fromEntries(
    Object.entries(MODE_META).map(([mode, meta]) => [mode, meta.label])
  ) as Record<Mode, string>
);

export const SETTINGS_KEY = "zenbar.settings.v1";

export const DEFAULT_SETTINGS = Object.freeze({
  sources: Object.freeze({
    tabs: true,
    bookmarks: true,
    history: true
  }),
  weights: Object.freeze({
    searchAction: 1.18,
    tabs: 1.04,
    bookmarks: 0.96,
    history: 0.88,
    suggestions: 0.84,
    currentWindowTabs: 0.35
  }),
  suggestionProvider: "off"
} satisfies ZenbarSettings);

export const MAX_RESULTS = 9;
export const DUCKDUCKGO_ORIGIN = "https://duckduckgo.com/*";
export const SHORTCUTS_URL = "chrome://extensions/shortcuts";

export const SOURCE_PRIORITY = Object.freeze({
  searchAction: 6,
  tabs: 5,
  bookmarks: 4,
  history: 3,
  suggestions: 2,
  url: 1
} satisfies Record<ResultSource, number>);

export const SOURCE_LABELS = Object.freeze({
  searchAction: "Default search",
  tabs: "Open tabs",
  bookmarks: "Bookmarks",
  history: "History",
  suggestions: "DuckDuckGo suggestions"
});
