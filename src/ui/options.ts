import Sortable from "sortablejs";

import {
  COMMAND_TO_MODE,
  DEFAULT_RESULT_SOURCE_ORDER,
  DEFAULT_SETTINGS,
  DUCKDUCKGO_ORIGIN,
  MODE_LABELS,
  SHORTCUTS_URL
} from "../shared/constants.js";
import { createResultSourceSortableOptions } from "./result-source-sortable.js";
import { getSettings, mergeSettings, patchSettings, saveSettings } from "../shared/settings.js";
import type {
  CommandPosition,
  PermissionState,
  ResultSourceOrderItem,
  ZenbarSettings
} from "../shared/types.js";

type PermissionKey = "bookmarks" | "history";
type Platform = string;

interface CommandState {
  name: string;
  label: string;
  shortcut: string;
}

interface OptionsState {
  settings: ZenbarSettings;
  platform: Platform;
  permissions: PermissionState;
  commands: CommandState[];
}

const reorderableResultDefinitions: Record<ResultSourceOrderItem, { title: string; description: string }> = {
  "input-history": {
    title: "Learned picks",
    description: "Use your local Zenbar selections to surface the result you usually choose for the same query."
  },
  tabs: {
    title: "Open tabs",
    description: "Blend matching tabs from the current window into Cmd+T and Cmd+L results."
  },
  bookmarks: {
    title: "Bookmarks",
    description: "Include bookmark matches when bookmark access is granted."
  },
  history: {
    title: "History",
    description: "Include browser history matches when history access is granted."
  },
  suggestions: {
    title: "Suggestions",
    description: "Optional DuckDuckGo suggestions for typed searches. Final search execution still uses your default engine."
  }
};

const state: OptionsState = {
  settings: structuredClone(DEFAULT_SETTINGS),
  platform: "unknown",
  permissions: {
    bookmarks: false,
    history: false,
    duckduckgo: false
  },
  commands: []
};

let resultSourceSortable: Sortable | null = null;

function mustGetElement<T extends HTMLElement>(id: string, ctor: { new (): T }): T {
  const element = document.getElementById(id);

  if (!(element instanceof ctor)) {
    throw new Error(`Missing required element: #${id}`);
  }

  return element;
}

const elements = {
  sources: mustGetElement("sources", HTMLElement),
  appearance: mustGetElement("appearance", HTMLElement),
  shortcuts: mustGetElement("shortcuts", HTMLElement),
  status: mustGetElement("status", HTMLElement),
  changeShortcuts: mustGetElement("change-shortcuts", HTMLButtonElement),
  exportButton: mustGetElement("export-settings", HTMLButtonElement),
  importButton: mustGetElement("import-settings", HTMLButtonElement),
  importFile: mustGetElement("import-file", HTMLInputElement)
};

boot().catch((error: unknown) => {
  setStatus(error instanceof Error ? error.message : "Unable to load settings.", true);
});

async function boot(): Promise<void> {
  bindStaticEvents();
  await refresh();
}

function bindStaticEvents(): void {
  elements.changeShortcuts.addEventListener("click", openShortcutsManager);
  elements.exportButton.addEventListener("click", exportSettings);
  elements.importButton.addEventListener("click", () => elements.importFile.click());
  elements.importFile.addEventListener("change", handleImportFile);
}

async function refresh(): Promise<void> {
  state.settings = await getSettings();
  state.platform = await getPlatform();
  state.permissions = await getPermissionState();
  state.commands = await getCommandState();
  render();
}

function render(): void {
  renderSources();
  renderAppearance();
  renderShortcuts();
  applyAutoGridSpans();
}

function renderSources(): void {
  resultSourceSortable?.destroy();
  resultSourceSortable = null;

  elements.sources.innerHTML = `
    <div class="stack">
      <p class="note">Drag the result sources to control which rows surface first in Cmd+T and Cmd+L.</p>
      <div id="result-source-order" class="result-panel result-panel--sortable">
        ${state.settings.resultSourceOrder.map((key) => renderReorderableResultRow(key)).join("")}
      </div>
    </div>
  `;

  bindResultToggleEvents();
  bindPermissionEvents();
  bindAdaptiveHistoryEvents();
  initializeResultSourceSorting();
}

function renderReorderableResultRow(key: ResultSourceOrderItem): string {
  const definition = reorderableResultDefinitions[key];
  const enabled = isResultSourceEnabled(key);
  const pill = getResultSourcePill(key);
  const actionMarkup = renderResultSourceAction(key);

  return `
    <article class="control-row control-row--result control-row--sortable" data-order-key="${key}">
      <div class="result-row__content">
        <span class="drag-handle" data-drag-handle="true" aria-hidden="true">⋮⋮</span>
        <div>
          <div class="control-title-row">
            <h3>${escapeHtml(definition.title)}</h3>
            <span class="pill${pill.muted ? " pill--muted" : ""}">${escapeHtml(pill.label)}</span>
          </div>
          <p>${escapeHtml(definition.description)}</p>
        </div>
      </div>
      <div class="control-actions">
        ${actionMarkup}
        <label class="toggle">
          <input type="checkbox" data-result-toggle="${key}" ${enabled ? "checked" : ""} />
          <span>${enabled ? "On" : "Off"}</span>
        </label>
      </div>
    </article>
  `;
}

function bindResultToggleEvents(): void {
  elements.sources.querySelectorAll<HTMLInputElement>("[data-result-toggle]").forEach((input) => {
    input.addEventListener("change", async (event: Event) => {
      const target = event.currentTarget;

      if (!(target instanceof HTMLInputElement)) {
        return;
      }

      const key = target.dataset.resultToggle;

      if (!isResultSourceOrderItem(key)) {
        return;
      }

      const checked = target.checked;

      if (key === "suggestions") {
        if (checked && !state.permissions.duckduckgo) {
          const granted = await requestDuckDuckGoPermission();

          if (!granted) {
            target.checked = false;
            setStatus("DuckDuckGo host access was not granted.", true);
            return;
          }
        }

        state.settings = await patchSettings({
          suggestionProvider: checked ? "duckduckgo" : "off"
        });
        await refresh();
        setStatus(checked ? "DuckDuckGo suggestions enabled." : "Remote suggestions disabled.");
        return;
      }

      if (key === "input-history") {
        state.settings = await patchSettings({
          adaptiveHistoryEnabled: checked
        });
        renderSources();
        setStatus(checked ? "Learned picks enabled." : "Learned picks disabled.");
        return;
      }

      state.settings = await patchSettings({
        sources: {
          [key]: checked
        }
      });
      renderSources();
      setStatus(`${labelForKey(key)} ${checked ? "enabled" : "disabled"}.`);
    });
  });
}

function bindPermissionEvents(): void {
  elements.sources.querySelectorAll<HTMLButtonElement>("[data-request-permission]").forEach((button) => {
    button.addEventListener("click", async (event: Event) => {
      const target = event.currentTarget;

      if (!(target instanceof HTMLButtonElement)) {
        return;
      }

      const permission = target.dataset.requestPermission as PermissionKey | undefined;

      if (!permission) {
        return;
      }

      const granted = await requestPermission(permission);
      await refresh();
      setStatus(granted ? `${labelForKey(permission)} access granted.` : `${labelForKey(permission)} access was not granted.`, !granted);
    });
  });

  elements.sources.querySelectorAll<HTMLButtonElement>("[data-request-ddg]").forEach((button) => {
    button.addEventListener("click", async () => {
      const granted = await requestDuckDuckGoPermission();
      await refresh();
      setStatus(granted ? "DuckDuckGo host access granted." : "DuckDuckGo host access was not granted.", !granted);
    });
  });
}

function bindAdaptiveHistoryEvents(): void {
  const clearButton = elements.sources.querySelector<HTMLButtonElement>("[data-clear-adaptive-history]");

  if (!clearButton) {
    return;
  }

  clearButton.addEventListener("click", async () => {
    const response = await chrome.runtime.sendMessage({
      type: "zenbar/clear-adaptive-history"
    }) as { ok?: boolean; error?: string };

    if (!response?.ok) {
      setStatus(response?.error || "Unable to clear learned history.", true);
      return;
    }

    setStatus("Cleared learned history.");
  });
}

function initializeResultSourceSorting(): void {
  const list = elements.sources.querySelector<HTMLElement>("#result-source-order");

  if (!list) {
    return;
  }

  resultSourceSortable = Sortable.create(list, createResultSourceSortableOptions({
    onEnd: async () => {
      const nextOrder = Array.from(list.querySelectorAll<HTMLElement>("[data-order-key]"))
        .map((item) => item.dataset.orderKey)
        .filter(isResultSourceOrderItem);

      if (hasSameResultOrder(state.settings.resultSourceOrder, nextOrder)) {
        return;
      }

      try {
        state.settings = await patchSettings({
          resultSourceOrder: nextOrder
        });
        setStatus("Results order updated.");
      } catch (error: unknown) {
        await refresh();
        setStatus(error instanceof Error ? error.message : "Unable to save results order.", true);
      }
    }
  }));
}

function applyAutoGridSpans(): void {
  const cards = Array.from(document.querySelectorAll<HTMLElement>(".options-grid > .card"));
  let pendingCards: HTMLElement[] = [];

  const flushPendingCards = () => {
    if (pendingCards.length % 2 === 1) {
      pendingCards.at(-1)?.classList.add("card--auto-full");
    }

    pendingCards = [];
  };

  for (const card of cards) {
    card.classList.remove("card--auto-full");

    if (card.classList.contains("card--full")) {
      flushPendingCards();
      continue;
    }

    pendingCards.push(card);
  }

  flushPendingCards();
}

function isResultSourceEnabled(key: ResultSourceOrderItem): boolean {
  switch (key) {
    case "input-history":
      return state.settings.adaptiveHistoryEnabled;
    case "tabs":
      return state.settings.sources.tabs;
    case "bookmarks":
      return state.settings.sources.bookmarks;
    case "history":
      return state.settings.sources.history;
    case "suggestions":
      return state.settings.suggestionProvider === "duckduckgo";
  }
}

function getResultSourcePill(key: ResultSourceOrderItem): { label: string; muted: boolean } {
  switch (key) {
    case "input-history":
      return { label: "Local only", muted: false };
    case "tabs":
      return { label: "Always available", muted: false };
    case "bookmarks":
      return state.permissions.bookmarks
        ? { label: "Access enabled", muted: false }
        : { label: "Permission needed", muted: true };
    case "history":
      return state.permissions.history
        ? { label: "Access enabled", muted: false }
        : { label: "Permission needed", muted: true };
    case "suggestions":
      return state.permissions.duckduckgo
        ? { label: "Host access enabled", muted: false }
        : { label: "Host access not granted", muted: true };
  }
}

function renderResultSourceAction(key: ResultSourceOrderItem): string {
  switch (key) {
    case "input-history":
      return '<button class="ghost-button" type="button" data-clear-adaptive-history="true">Clear Learned History</button>';
    case "bookmarks":
      return state.permissions.bookmarks
        ? ""
        : '<button class="ghost-button" type="button" data-request-permission="bookmarks">Grant Access</button>';
    case "history":
      return state.permissions.history
        ? ""
        : '<button class="ghost-button" type="button" data-request-permission="history">Grant Access</button>';
    case "suggestions":
      return state.permissions.duckduckgo
        ? ""
        : '<button class="ghost-button" type="button" data-request-ddg="true">Enable Host Access</button>';
    case "tabs":
      return "";
  }
}

function isResultSourceOrderItem(value: string | undefined): value is ResultSourceOrderItem {
  return Boolean(value) && DEFAULT_RESULT_SOURCE_ORDER.includes(value as ResultSourceOrderItem);
}

function hasSameResultOrder(left: ResultSourceOrderItem[], right: ResultSourceOrderItem[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function renderAppearance(): void {
  const position = state.settings.commandPosition;

  elements.appearance.innerHTML = `
    <div class="stack">
      <label class="field">
        <span>Position</span>
        <select id="command-position">
          <option value="center" ${position === "center" ? "selected" : ""}>Centered</option>
          <option value="top" ${position === "top" ? "selected" : ""}>Top</option>
        </select>
      </label>
      <p class="note">Choose where Zenbar appears on screen. Center keeps it near mid-screen, while Top pins it higher with the same layout.</p>
    </div>
  `;

  const positionSelect = elements.appearance.querySelector<HTMLSelectElement>("#command-position");

  if (!positionSelect) {
    return;
  }

  positionSelect.addEventListener("change", async (event: Event) => {
    const target = event.currentTarget;

    if (!(target instanceof HTMLSelectElement)) {
      return;
    }

    const nextValue: CommandPosition = target.value === "top" ? "top" : "center";

    state.settings = await patchSettings({
      commandPosition: nextValue
    });
    renderAppearance();
    setStatus(nextValue === "top" ? "Command surface position set to top." : "Command surface position set to center.");
  });
}

function renderShortcuts(): void {
  const unassignedCount = state.commands.filter((command) => !command.shortcut).length;
  const warning = unassignedCount
    ? `<p class="note">${unassignedCount} command${unassignedCount === 1 ? " is" : "s are"} currently unassigned. Note that reserved shortcuts like Ctrl+L, Ctrl+T, or Ctrl+Shift+A must be manually assigned.</p>`
    : '<p class="note">All Zenbar commands currently have a shortcut.</p>';

  elements.shortcuts.innerHTML = `
    ${warning}
    <div class="shortcut-list">
      ${state.commands
        .map(
          (command) => `
            <article class="shortcut-row">
              <div>
                <h3>${command.label}</h3>
                <p>${command.name}</p>
              </div>
              ${renderShortcutMarkup(command.shortcut, state.platform)}
            </article>
          `
        )
        .join("")}
    </div>
  `;
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

async function getCommandState(): Promise<CommandState[]> {
  const commands = await chrome.commands.getAll();
  return Object.entries(COMMAND_TO_MODE).map(([name, mode]) => {
    const command = commands.find((entry) => entry.name === name);

    return {
      name,
      label: MODE_LABELS[mode],
      shortcut: command?.shortcut || ""
    };
  });
}

async function getPlatform(): Promise<Platform> {
  try {
    const info = await chrome.runtime.getPlatformInfo();
    return info?.os || "unknown";
  } catch {
    return "unknown";
  }
}

async function requestPermission(permission: PermissionKey): Promise<boolean> {
  return await chrome.permissions.request({ permissions: [permission] });
}

async function requestDuckDuckGoPermission(): Promise<boolean> {
  return await chrome.permissions.request({ origins: [DUCKDUCKGO_ORIGIN] });
}

async function openShortcutsManager(): Promise<void> {
  try {
    await chrome.tabs.create({ url: SHORTCUTS_URL });
    setStatus("Opened the browser shortcut manager.");
  } catch {
    setStatus(`Open ${SHORTCUTS_URL} manually if your browser blocks this link.`, true);
  }
}

function exportSettings(): void {
  const blob = new Blob([JSON.stringify(state.settings, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "zenbar-settings.json";
  anchor.click();
  URL.revokeObjectURL(url);
  setStatus("Exported Zenbar settings.");
}

async function handleImportFile(event: Event): Promise<void> {
  const input = event.currentTarget;

  if (!(input instanceof HTMLInputElement)) {
    return;
  }

  const [file] = input.files || [];
  input.value = "";

  if (!file) {
    return;
  }

  try {
    const raw = await file.text();
    const parsed = JSON.parse(raw);
    state.settings = await saveSettings(mergeSettings(parsed));
    await refresh();
    setStatus("Imported Zenbar settings.");
  } catch (error: unknown) {
    setStatus(error instanceof Error ? error.message : "The selected file is not valid JSON.", true);
  }
}

function setStatus(message: string, isError = false): void {
  elements.status.textContent = message;
  elements.status.dataset.error = isError ? "true" : "false";
}

function labelForKey(key: string): string {
  switch (key) {
    case "tabs":
      return reorderableResultDefinitions.tabs.title;
    case "bookmarks":
      return reorderableResultDefinitions.bookmarks.title;
    case "history":
      return reorderableResultDefinitions.history.title;
    case "suggestions":
      return reorderableResultDefinitions.suggestions.title;
    case "input-history":
      return reorderableResultDefinitions["input-history"].title;
    default:
      return key;
  }
}

function renderShortcutMarkup(shortcut: string, platform: Platform): string {
  if (!shortcut) {
    return '<span class="shortcut-pill shortcut-pill--muted">Unassigned</span>';
  }

  const keys = shortcut
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => renderKeycap(part, platform))
    .join('<span class="shortcut-separator">+</span>');

  return `<span class="shortcut-pill">${keys}</span>`;
}

function renderKeycap(key: string, platform: Platform): string {
  const label = getKeycapLabel(key, platform);
  return `<span class="shortcut-key">${escapeHtml(label)}</span>`;
}

function getKeycapLabel(key: string, platform: Platform): string {
  const normalized = key.toLowerCase();
  const isMac = platform === "mac";

  if (normalized === "command") {
    return isMac ? "⌘" : "Cmd";
  }

  if (normalized === "ctrl" || normalized === "control") {
    return isMac ? "⌃" : "Ctrl";
  }

  if (normalized === "alt" || normalized === "option") {
    return isMac ? "⌥" : "Alt";
  }

  if (normalized === "shift") {
    return isMac ? "⇧" : "Shift";
  }

  return key.length === 1 ? key.toUpperCase() : key;
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
