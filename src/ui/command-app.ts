import { MODE_META, MODES } from "../shared/constants.js";
import type {
  BasicResponse,
  CommandPosition,
  Mode,
  OpenPayload,
  QueryResponse,
  ResultItem,
  SerializedTab,
  SubmitResponse,
  TogglePinResponse,
  UiContextResponse
} from "../shared/types.js";
import {
  applyQueryResultState,
  createSelectionModel,
  getHighlightedIndex,
  getSelectedResult,
  moveSelection,
  resetSelectionForTypedInput,
  setExplicitSelection,
  type SelectionModelState
} from "./selection-model.js";
import { createIcon } from "./icons.js";

type SurfaceKind = "overlay" | "window";
type BadgeKind = "tab" | "bookmark" | "pin" | "history";
type InputIconKind = "search" | "spinner";

interface MountCommandSurfaceOptions {
  root: HTMLElement;
  surface?: SurfaceKind;
  closeSurface: () => void | Promise<void>;
}

interface CommandSurfaceApp {
  open: (payload?: OpenPayload) => Promise<void>;
}

interface PrioritizableResult {
  type?: string;
  queryText?: string | null;
}

const iconUrlCache = new Map<string, "loaded" | "error">();

export function mountCommandSurface({
  root,
  surface = "overlay",
  closeSurface
}: MountCommandSurfaceOptions): CommandSurfaceApp {
  const clientId = crypto.randomUUID();

  let mode: Mode = MODES.CURRENT_TAB;
  let commandPosition: CommandPosition = "center";
  let contextTabId: number | null = null;
  let currentTab: SerializedTab | null = null;
  let typedQuery = "";
  let hasUserEditedInput = false;
  let results: ResultItem[] = [];
  let selectionModel: SelectionModelState = createSelectionModel(MODES.CURRENT_TAB);
  let loading = false;
  let submitting = false;
  let searchTimer: number | undefined;
  let searchVersion = 0;
  let statusMessage = "";
  let isOpen = false;

  root.innerHTML = `
    <section class="zenbar zenbar--${surface}">
      <button class="zenbar__backdrop" data-action="dismiss" type="button" aria-label="Close Zenbar"></button>
      <div class="zenbar__panel" role="dialog" aria-modal="true" aria-label="Zenbar command bar">
        <div class="zenbar__heading">
          <div class="zenbar__heading-copy">
            <p class="zenbar__eyebrow">Zenbar</p>
            <h1 class="zenbar__mode"></h1>
          </div>
          <button class="zenbar__dismiss" data-action="dismiss" type="button">Esc</button>
        </div>
        <label class="zenbar__input-shell">
          <span class="zenbar__input-icon" aria-hidden="true"></span>
          <input class="zenbar__input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" />
        </label>
        <p class="zenbar__helper" aria-live="polite"></p>
        <div class="zenbar__results" role="listbox"></div>
        <p class="zenbar__results-tip"></p>
      </div>
    </section>
  `;

  const container = getRequiredElement<HTMLElement>(root, ".zenbar");
  const backdrop = getRequiredElement<HTMLButtonElement>(root, ".zenbar__backdrop");
  const modeLabel = getRequiredElement<HTMLElement>(root, ".zenbar__mode");
  const helper = getRequiredElement<HTMLElement>(root, ".zenbar__helper");
  const input = getRequiredElement<HTMLInputElement>(root, ".zenbar__input");
  const inputShell = getRequiredElement<HTMLElement>(root, ".zenbar__input-shell");
  const inputIcon = getRequiredElement<HTMLElement>(root, ".zenbar__input-icon");
  const resultsHost = getRequiredElement<HTMLElement>(root, ".zenbar__results");
  const resultsTip = getRequiredElement<HTMLElement>(root, ".zenbar__results-tip");
  const eventRoot = root.getRootNode();
  const ownerDocument = root.ownerDocument;

  backdrop.hidden = surface !== "overlay";

  root.querySelectorAll<HTMLButtonElement>('[data-action="dismiss"]').forEach((button) => {
    button.addEventListener("click", dismiss);
  });
  input.addEventListener("input", handleInput);
  input.addEventListener("keydown", handleKeydown);
  if (eventRoot instanceof ShadowRoot || eventRoot instanceof Document) {
    eventRoot.addEventListener("keydown", handleEscapeKeydown, true);
  }
  if (eventRoot !== ownerDocument) {
    ownerDocument.addEventListener("keydown", handleEscapeKeydown, true);
  }
  root.addEventListener("keydown", stopKeyboardEventPropagation);
  root.addEventListener("keypress", stopKeyboardEventPropagation);
  root.addEventListener("keyup", stopKeyboardEventPropagation);
  resultsHost.addEventListener("click", handleResultsClick);
  resultsHost.addEventListener("pointermove", handleResultsHover);

  renderChrome();
  renderResults();

  return {
    open
  };

  async function open(payload: OpenPayload = {}): Promise<void> {
    isOpen = true;
    mode = payload.mode ?? MODES.CURRENT_TAB;
    contextTabId = typeof payload.contextTabId === "number" ? payload.contextTabId : null;
    selectionModel = createSelectionModel(mode);
    searchVersion += 1;

    const response = await sendRuntimeMessage<UiContextResponse>({
      type: "zenbar/get-context",
      payload: {
        mode,
        contextTabId
      }
    });

    if (!response.ok) {
      throw new Error(response.error || "Unable to open Zenbar");
    }

    currentTab = response.context.currentTab;
    commandPosition = response.context.settings.commandPosition;
    ({
      typedQuery,
      hasUserEditedInput,
      results,
      loading,
      submitting,
      statusMessage
    } = getCommandSurfaceOpenState(mode, currentTab));
    input.value = typedQuery;
    renderChrome();
    renderResults();
    queueSearch(true);
    restoreInputFocus(mode === MODES.CURRENT_TAB);
  }

  function renderChrome(): void {
    const meta = MODE_META[mode] ?? MODE_META[MODES.CURRENT_TAB];
    const visualState = getCommandSurfaceStatusState({
      mode,
      loading,
      submitting,
      statusMessage
    });
    const isBusy = visualState.isBusy ? " zenbar__input-shell--busy" : "";
    const helperText = visualState.helperText;

    container.dataset.mode = mode;
    container.dataset.position = commandPosition;
    modeLabel.textContent = meta.label;
    helper.textContent = helperText;
    helper.hidden = !helperText;
    resultsTip.textContent = getResultsFooterText(mode);
    resultsTip.hidden = !resultsTip.textContent;
    input.placeholder = meta.placeholder;

    inputShell.className = `zenbar__input-shell${isBusy}`;
    renderInputIcon(inputIcon, visualState.inputIcon);
    applyCommandInputState(input, getCommandInputState({
      typedQuery,
      selectionModel,
      results,
      allowDefaultPreview: mode !== MODES.CURRENT_TAB || hasUserEditedInput
    }));
  }

  function renderResults(): void {
    renderChrome();
    resultsHost.textContent = "";

    resultsHost.classList.toggle("zenbar__results--busy", loading && results.length > 0);

    if (loading && results.length > 0) {
      renderResultRows();
      return;
    }

    if (loading) {
      const loadingState = document.createElement("div");
      loadingState.className = "zenbar__empty zenbar__empty--loading";
      loadingState.innerHTML = `
        <strong>Refreshing results</strong>
        <span>Looking for the best match for your current query.</span>
      `;
      resultsHost.append(loadingState);
      return;
    }

    if (!results.length) {
      const emptyState = document.createElement("div");
      emptyState.className = "zenbar__empty";
      emptyState.innerHTML = getEmptyStateMarkup();
      resultsHost.append(emptyState);
      return;
    }

    renderResultRows();
  }

  function renderResultRows(): void {
    const highlightedIndex = getHighlightedIndex(selectionModel, results);

    const fragment = document.createDocumentFragment();

    results.forEach((result, index) => {
      const row = document.createElement("div");
      row.className = `zenbar-result-row${index === highlightedIndex ? " zenbar-result-row--active" : ""}`;
      row.dataset.resultIndex = String(index);
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", index === highlightedIndex ? "true" : "false");

      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "zenbar-result";

      const icon = document.createElement("span");
      icon.className = "zenbar-result__icon";
      appendIcon(icon, result);

      const copy = document.createElement("span");
      copy.className = "zenbar-result__copy";

      const title = document.createElement("span");
      title.className = "zenbar-result__title";
      title.textContent = result.title || result.queryText || result.url || "Untitled result";

      const subtitle = document.createElement("span");
      subtitle.className = "zenbar-result__subtitle";
      subtitle.textContent = result.subtitle || subtitleForResult(result);

      copy.append(title, subtitle);

      const meta = document.createElement("span");
      meta.className = "zenbar-result__meta";

      for (const badge of badgesForResult(result)) {
        meta.append(buildBadge(badge));
      }

      trigger.append(icon, copy);
      row.append(trigger, meta);

      if (result.closeable && typeof result.tabId === "number") {
        const closeButton = document.createElement("button");
        closeButton.type = "button";
        closeButton.className = "zenbar-result__close";
        closeButton.dataset.closeTab = String(index);
        closeButton.dataset.resultIndex = String(index);
        closeButton.append(createIcon("x"));
        closeButton.setAttribute("aria-label", `Close ${result.title || "tab"}`);
        meta.append(closeButton);
      }

      fragment.append(row);
    });

    resultsHost.append(fragment);

    const activeRow = resultsHost.querySelector<HTMLElement>(".zenbar-result-row--active");
    if (activeRow) {
      activeRow.scrollIntoView({ block: "nearest" });
    }
  }

  function getEmptyStateMarkup(): string {
    if (mode === MODES.TAB_SEARCH) {
      return typedQuery.trim()
        ? "<strong>No matching tabs</strong><span>Try a shorter title or URL fragment from this window.</span>"
        : "<strong>Ready to jump</strong><span>Your other tabs in this window will appear here as soon as you type.</span>";
    }

    return typedQuery.trim()
      ? "<strong>No direct matches yet</strong><span>Press Enter to use your typed query with your default search engine.</span>"
      : "<strong>Start typing</strong><span>Search, navigate, or jump to a result from this calm command space.</span>";
  }

  function queueSearch(immediate = false): void {
    if (searchTimer !== undefined) {
      window.clearTimeout(searchTimer);
    }
    searchTimer = window.setTimeout(runSearch, immediate ? 0 : 140);
  }

  async function runSearch(): Promise<void> {
    const requestId = ++searchVersion;
    loading = true;
    renderResults();

    const response = await sendRuntimeMessage<QueryResponse>({
      type: "zenbar/query",
      payload: {
        mode,
        query: typedQuery,
        contextTabId,
        clientId
      }
    });

    if (requestId !== searchVersion) {
      return;
    }

    loading = false;

    if (!response.ok) {
      statusMessage = response.error || "Unable to fetch results.";
      results = [];
      selectionModel = applyQueryResultState(resetSelectionForTypedInput(selectionModel), {
        results: [],
        defaultResult: null,
        allowEmptySelection: mode !== MODES.TAB_SEARCH
      });
      renderResults();
      return;
    }

    statusMessage = "";
    results = response.results;
    selectionModel = applyQueryResultState(selectionModel, response);
    renderResults();
  }

  function handleInput(): void {
    typedQuery = input.value;
    hasUserEditedInput = true;
    selectionModel = resetSelectionForTypedInput(selectionModel);
    statusMessage = "";
    queueSearch(false);
  }

  async function handleKeydown(event: KeyboardEvent): Promise<void> {
    if (event.key === "ArrowDown" && results.length) {
      event.preventDefault();
      selectionModel = moveSelection(selectionModel, results, 1);
      renderResults();
      return;
    }

    if (event.key === "ArrowUp" && results.length) {
      event.preventDefault();
      selectionModel = moveSelection(selectionModel, results, -1);
      renderResults();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      await submitSelection();
      return;
    }

    if (
      mode === MODES.TAB_SEARCH &&
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === "x"
    ) {
      event.preventDefault();
      await closeHighlightedTab();
      return;
    }

    if (
      mode === MODES.TAB_SEARCH &&
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === "p"
    ) {
      event.preventDefault();
      await toggleHighlightedPin();
    }
  }

  async function submitSelection(index?: number): Promise<void> {
    if (submitting) {
      return;
    }

    submitting = true;
    renderChrome();
    const explicitSelection = typeof index === "number"
      ? results[index] || null
      : selectionModel.explicitIndex !== null
        ? getSelectedResult(selectionModel, results)
        : null;

    const response = await sendRuntimeMessage<SubmitResponse>({
      type: "zenbar/submit",
      payload: {
        mode,
        contextTabId,
        rawQuery: typedQuery,
        selectedResult: explicitSelection,
        defaultResult: getVisibleDefaultResult(selectionModel, mode !== MODES.CURRENT_TAB || hasUserEditedInput)
      }
    });

    if (!response.ok) {
      submitting = false;
      statusMessage = response.error || "Unable to open the selected result.";
      renderChrome();
      return;
    }

    submitting = false;
    statusMessage = "";

    if (response.closeSurface !== false) {
      dismiss();
      return;
    }

    renderChrome();
  }

  async function closeHighlightedTab(index?: number): Promise<void> {
    const targetIndex = typeof index === "number" ? index : getHighlightedIndex(selectionModel, results);

    if (targetIndex === null) {
      return;
    }

    const target = results[targetIndex];

    if (!target || typeof target.tabId !== "number") {
      return;
    }

    const response = await sendRuntimeMessage<BasicResponse>({
      type: "zenbar/close-tab",
      payload: {
        tabId: target.tabId
      }
    });

    if (!response.ok) {
      statusMessage = response.error || "Unable to close the tab.";
      renderChrome();
      return;
    }

    results = results.filter((result) => result.tabId !== target.tabId);
    selectionModel = applyQueryResultState(selectionModel, {
      results,
      defaultResult: selectionModel.defaultResult,
      allowEmptySelection: selectionModel.allowEmptySelection
    });
    renderResults();
    queueSearch(true);
  }

  async function toggleHighlightedPin(index?: number): Promise<void> {
    const targetIndex = typeof index === "number" ? index : getHighlightedIndex(selectionModel, results);

    if (targetIndex === null) {
      return;
    }

    const target = results[targetIndex];

    if (!target || typeof target.tabId !== "number" || mode !== MODES.TAB_SEARCH) {
      return;
    }

    const response = await sendRuntimeMessage<TogglePinResponse>({
      type: "zenbar/toggle-pin-tab",
      payload: {
        tabId: target.tabId
      }
    });

    if (!response.ok) {
      statusMessage = response.error || "Unable to update the tab pin state.";
      renderChrome();
      return;
    }

    results = results.map((result) => {
      if (result.tabId !== target.tabId) {
        return result;
      }

      return {
        ...result,
        pinned: Boolean(response.result.pinned)
      };
    });

    statusMessage = response.result.pinned ? "Pinned tab." : "Unpinned tab.";
    renderResults();
  }

  function handleResultsClick(event: MouseEvent): void {
    if (!(event.target instanceof Element)) {
      return;
    }

    const closeButton = event.target.closest<HTMLElement>("[data-close-tab]");

    if (closeButton) {
      void closeHighlightedTab(Number(closeButton.dataset.closeTab));
      return;
    }

    const trigger = event.target.closest<HTMLElement>("[data-result-index]");

    if (!trigger) {
      return;
    }

    const index = Number(trigger.dataset.resultIndex);
    selectionModel = setExplicitSelection(selectionModel, index, "pointer");
    renderResults();
    void submitSelection(index);
  }

  function handleResultsHover(event: PointerEvent): void {
    if (!(event.target instanceof Element)) {
      return;
    }

    const trigger = event.target.closest<HTMLElement>("[data-result-index]");

    if (!trigger) {
      return;
    }

    const nextIndex = Number(trigger.dataset.resultIndex);

    if (nextIndex !== getHighlightedIndex(selectionModel, results)) {
      selectionModel = setExplicitSelection(selectionModel, nextIndex, "pointer");
      renderResults();
    }
  }

  function stopKeyboardEventPropagation(event: Event): void {
    if (!isOpen) {
      return;
    }

    event.stopPropagation();
  }

  function handleEscapeKeydown(event: Event): void {
    if (!isOpen || !(event instanceof KeyboardEvent) || event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dismiss();
  }

  function dismiss(): void {
    if (!isOpen) {
      return;
    }

    isOpen = false;
    if (searchTimer !== undefined) {
      window.clearTimeout(searchTimer);
    }
    searchVersion += 1;
    void closeSurface();
  }

  function restoreInputFocus(selectAll = false): void {
    const applyFocus = () => {
      input.focus({ preventScroll: true });

      if (selectAll) {
        input.setSelectionRange(0, input.value.length);
        return;
      }

      input.setSelectionRange(input.value.length, input.value.length);
    };

    requestAnimationFrame(() => {
      applyFocus();
      window.setTimeout(applyFocus, 32);
    });
  }
}

export function prioritizeTypedQueryResult<T extends PrioritizableResult>(results: T[], rawQuery: string, mode: Mode): T[] {
  if (mode === MODES.TAB_SEARCH) {
    return results;
  }

  const query = String(rawQuery ?? "").trim().toLowerCase();

  if (!query) {
    return results;
  }

  const prioritizedIndex = results.findIndex(
    (result) => result.type === "search-action" && String(result.queryText ?? "").trim().toLowerCase() === query
  );

  if (prioritizedIndex <= 0) {
    return results;
  }

  return [
    results[prioritizedIndex]!,
    ...results.slice(0, prioritizedIndex),
    ...results.slice(prioritizedIndex + 1)
  ];
}

export interface CommandInputState {
  value: string;
  selectionStart: number | null;
  selectionEnd: number | null;
  previewResult: ResultItem | null;
}

export interface CommandSurfaceOpenState {
  typedQuery: string;
  hasUserEditedInput: boolean;
  results: ResultItem[];
  loading: boolean;
  submitting: boolean;
  statusMessage: string;
}

export function getCommandSurfaceOpenState(mode: Mode, currentTab: SerializedTab | null): CommandSurfaceOpenState {
  return {
    typedQuery: mode === MODES.CURRENT_TAB ? currentTab?.url ?? "" : "",
    hasUserEditedInput: mode !== MODES.CURRENT_TAB,
    results: [],
    loading: false,
    submitting: false,
    statusMessage: ""
  };
}

export function getCommandInputState({
  typedQuery,
  selectionModel: _selectionModel,
  results: _results,
  allowDefaultPreview: _allowDefaultPreview
}: {
  typedQuery: string;
  selectionModel: SelectionModelState;
  results: ResultItem[];
  allowDefaultPreview: boolean;
}): CommandInputState {
  return {
    value: typedQuery,
    selectionStart: null,
    selectionEnd: null,
    previewResult: null
  };
}

export function getVisibleDefaultResult(selectionModel: SelectionModelState, allowDefaultPreview: boolean): ResultItem | null {
  if (!allowDefaultPreview || selectionModel.explicitIndex === null || !selectionModel.defaultResult) {
    return null;
  }

  return selectionModel.defaultResult;
}

export function getResultsFooterText(mode: Mode): string {
  return mode === MODES.TAB_SEARCH
    ? "Ctrl/Cmd+X closes the highlighted tab. Ctrl/Cmd+P pins it."
    : "";
}

export function getCommandSurfaceStatusState({
  mode,
  loading,
  submitting,
  statusMessage
}: {
  mode: Mode;
  loading: boolean;
  submitting: boolean;
  statusMessage: string;
}): {
  helperText: string;
  inputIcon: InputIconKind;
  isBusy: boolean;
} {
  if (submitting) {
    return {
      helperText: mode === MODES.NEW_TAB ? "Opening in new tab..." : "Opening in current tab...",
      inputIcon: "spinner",
      isBusy: true
    };
  }

  return {
    helperText: statusMessage || "",
    inputIcon: "search",
    isBusy: loading
  };
}

function applyCommandInputState(input: HTMLInputElement, inputState: CommandInputState): void {
  if (input.value !== inputState.value) {
    input.value = inputState.value;
  }

  if (!input.matches(":focus") || inputState.selectionStart === null || inputState.selectionEnd === null) {
    return;
  }

  if (input.selectionStart === inputState.selectionStart && input.selectionEnd === inputState.selectionEnd) {
    return;
  }

  input.setSelectionRange(inputState.selectionStart, inputState.selectionEnd);
}

function getRequiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }

  return element;
}

async function sendRuntimeMessage<T>(message: { type: string; payload?: unknown }): Promise<T> {
  return await chrome.runtime.sendMessage(message) as T;
}

function renderInputIcon(container: HTMLElement, inputIcon: InputIconKind): void {
  if (container.dataset.iconKind === inputIcon) {
    return;
  }

  container.textContent = "";
  container.dataset.iconKind = inputIcon;

  if (inputIcon === "spinner") {
    const spinner = document.createElement("span");
    spinner.className = "zenbar__spinner";
    spinner.setAttribute("aria-hidden", "true");
    container.append(spinner);
    return;
  }

  container.append(createIcon("search"));
}

function appendIcon(container: HTMLElement, result: ResultItem): void {
  const fallbackName = iconNameForResult(result);

  if (!result.iconUrl) {
    container.append(createIcon(fallbackName));
    return;
  }

  const cached = iconUrlCache.get(result.iconUrl);

  if (cached === "error") {
    container.append(createIcon(fallbackName));
    return;
  }

  const fallback = document.createElement("span");
  fallback.className = "zenbar-result__icon-fallback";
  fallback.append(createIcon(fallbackName));

  const image = document.createElement("img");
  image.className = "zenbar-result__favicon";
  image.alt = "";
  image.referrerPolicy = "no-referrer";

  if (cached === "loaded") {
    image.src = result.iconUrl;
    container.append(image);
    return;
  }

  image.style.display = "none";
  container.append(fallback, image);

  image.addEventListener("load", () => {
    iconUrlCache.set(result.iconUrl!, "loaded");
    fallback.remove();
    image.style.display = "";
  }, { once: true });

  image.addEventListener("error", () => {
    iconUrlCache.set(result.iconUrl!, "error");
    image.remove();
    fallback.style.display = "";
  }, { once: true });

  image.src = result.iconUrl;
}

function iconNameForResult(result: ResultItem): string {
  switch (result.type) {
    case "search-action":
      return "search";
    case "tab":
      return "tab";
    case "bookmark":
      return "globe";
    case "history":
      return "history";
    case "suggestion":
      return "spark";
    default:
      return "globe";
  }
}

function subtitleForResult(result: ResultItem): string {
  if (result.url) {
    return result.url;
  }

  if (result.type === "suggestion") {
    return "Use this query with your default search engine";
  }

  if (result.type === "search-action") {
    return "Use your default search engine";
  }

  return "";
}

function badgesForResult(result: ResultItem): BadgeKind[] {
  const badges: BadgeKind[] = [];

  if (!result.closeable && (result.type === "tab" || typeof result.openTabId === "number")) {
    badges.push("tab");
  }

  if (result.pinned) {
    badges.push("pin");
  }

  if (result.type === "bookmark") {
    badges.push("bookmark");
  }

  if (result.type === "history") {
    badges.push("history");
  }

  return badges;
}

function buildBadge(kind: BadgeKind): HTMLElement {
  const badge = document.createElement("span");
  badge.className = "zenbar-badge";
  badge.title = badgeLabel(kind);
  badge.append(createIcon(kind));
  return badge;
}

function badgeLabel(kind: BadgeKind): string {
  switch (kind) {
    case "tab":
      return "Open tab";
    case "bookmark":
      return "Bookmark";
    case "pin":
      return "Pinned tab";
    case "history":
      return "History";
    default:
      return "Result";
  }
}
