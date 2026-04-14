import { MODE_META, MODES } from "../shared/constants.js";
import { createIcon } from "./icons.js";

const iconUrlCache = new Map();

export function mountCommandSurface({ root, surface = "overlay", closeSurface }) {
  const clientId = crypto.randomUUID();

  let mode = MODES.CURRENT_TAB;
  let contextTabId = null;
  let currentTab = null;
  let results = [];
  let highlightedIndex = 0;
  let loading = false;
  let submitting = false;
  let searchTimer = 0;
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
      </div>
    </section>
  `;

  const container = root.querySelector(".zenbar");
  const backdrop = root.querySelector(".zenbar__backdrop");
  const modeLabel = root.querySelector(".zenbar__mode");
  const helper = root.querySelector(".zenbar__helper");
  const input = root.querySelector(".zenbar__input");
  const inputShell = root.querySelector(".zenbar__input-shell");
  const inputIcon = root.querySelector(".zenbar__input-icon");
  const resultsHost = root.querySelector(".zenbar__results");
  const eventRoot = root.getRootNode();
  const ownerDocument = root.ownerDocument;

  inputIcon.append(createIcon("search"));

  backdrop.hidden = surface !== "overlay";

  root.querySelectorAll('[data-action="dismiss"]').forEach((button) => {
    button.addEventListener("click", dismiss);
  });
  input.addEventListener("input", handleInput);
  input.addEventListener("keydown", handleKeydown);
  eventRoot.addEventListener("keydown", handleEscapeKeydown, true);
  if (ownerDocument !== eventRoot) {
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

  async function open(payload = {}) {
    isOpen = true;
    mode = payload.mode || MODES.CURRENT_TAB;
    contextTabId = Number(payload.contextTabId) || null;
    statusMessage = "";
    searchVersion += 1;

    const response = await chrome.runtime.sendMessage({
      type: "zenbar/get-context",
      payload: {
        mode,
        contextTabId
      }
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Unable to open Zenbar");
    }

    currentTab = response.context.currentTab;
    input.value = mode === MODES.CURRENT_TAB ? currentTab?.url || "" : "";
    results = [];
    highlightedIndex = 0;
    loading = false;
    renderChrome();
    renderResults();
    queueSearch(true);
    restoreInputFocus(mode === MODES.CURRENT_TAB);
  }

  function renderChrome() {
    const meta = MODE_META[mode] || MODE_META[MODES.CURRENT_TAB];
    const isBusy = loading ? " zenbar__input-shell--busy" : "";
    const helperText = statusMessage || "";

    container.dataset.mode = mode;
    modeLabel.textContent = meta.label;
    helper.textContent = helperText;
    helper.hidden = !helperText;
    input.placeholder = meta.placeholder;

    inputShell.className = `zenbar__input-shell${isBusy}`;
  }

  function renderResults() {
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

  function renderResultRows() {
    highlightedIndex = Math.min(highlightedIndex, results.length - 1);
    highlightedIndex = Math.max(highlightedIndex, 0);

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

      if (result.closeable && result.tabId) {
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

    const activeRow = resultsHost.querySelector(".zenbar-result-row--active");
    if (activeRow) {
      activeRow.scrollIntoView({ block: "nearest" });
    }
  }

  function getEmptyStateMarkup() {
    if (mode === MODES.TAB_SEARCH) {
      return input.value.trim()
        ? "<strong>No matching tabs</strong><span>Try a shorter title or URL fragment from this window.</span>"
        : "<strong>Ready to jump</strong><span>Your other tabs in this window will appear here as soon as you type.</span>";
    }

    return input.value.trim()
      ? "<strong>No direct matches yet</strong><span>Press Enter to use your typed query with your default search engine.</span>"
      : "<strong>Start typing</strong><span>Search, navigate, or jump to a result from this calm command space.</span>";
  }

  function queueSearch(immediate = false) {
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(runSearch, immediate ? 0 : 140);
  }

  async function runSearch() {
    const requestId = ++searchVersion;
    loading = true;
    renderResults();

    const response = await chrome.runtime.sendMessage({
      type: "zenbar/query",
      payload: {
        mode,
        query: input.value,
        contextTabId,
        clientId
      }
    });

    if (requestId !== searchVersion) {
      return;
    }

    loading = false;

    if (!response?.ok) {
      statusMessage = response?.error || "Unable to fetch results.";
      results = [];
      renderResults();
      return;
    }

    statusMessage = "";
    results = prioritizeTypedQueryResult(Array.isArray(response.results) ? response.results : [], input.value, mode);
    renderResults();
  }

  function handleInput() {
    highlightedIndex = 0;
    statusMessage = "";
    queueSearch(false);
  }

  async function handleKeydown(event) {
    if (event.key === "ArrowDown" && results.length) {
      event.preventDefault();
      highlightedIndex = (highlightedIndex + 1) % results.length;
      renderResults();
      return;
    }

    if (event.key === "ArrowUp" && results.length) {
      event.preventDefault();
      highlightedIndex = (highlightedIndex - 1 + results.length) % results.length;
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

  async function submitSelection(index = highlightedIndex) {
    if (submitting) {
      return;
    }

    submitting = true;

    const response = await chrome.runtime.sendMessage({
      type: "zenbar/submit",
      payload: {
        mode,
        contextTabId,
        rawQuery: input.value,
        selectedResult: results[index] || null
      }
    });

    submitting = false;

    if (!response?.ok) {
      statusMessage = response?.error || "Unable to open the selected result.";
      renderChrome();
      return;
    }

    if (response.closeSurface !== false) {
      dismiss();
    }
  }

  async function closeHighlightedTab(index = highlightedIndex) {
    const target = results[index];

    if (!target?.tabId) {
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: "zenbar/close-tab",
      payload: {
        tabId: target.tabId
      }
    });

    if (!response?.ok) {
      statusMessage = response?.error || "Unable to close the tab.";
      renderChrome();
      return;
    }

    results = results.filter((result) => result.tabId !== target.tabId);
    highlightedIndex = Math.max(Math.min(index - 1, results.length - 1), 0);
    renderResults();
    queueSearch(true);
  }

  async function toggleHighlightedPin(index = highlightedIndex) {
    const target = results[index];

    if (!target?.tabId || mode !== MODES.TAB_SEARCH) {
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: "zenbar/toggle-pin-tab",
      payload: {
        tabId: target.tabId
      }
    });

    if (!response?.ok) {
      statusMessage = response?.error || "Unable to update the tab pin state.";
      renderChrome();
      return;
    }

    results = results.map((result) => {
      if (result.tabId !== target.tabId) {
        return result;
      }

      return {
        ...result,
        pinned: Boolean(response.result?.pinned)
      };
    });

    statusMessage = response.result?.pinned ? "Pinned tab." : "Unpinned tab.";
    renderResults();
  }

  function handleResultsClick(event) {
    const closeButton = event.target.closest("[data-close-tab]");

    if (closeButton) {
      void closeHighlightedTab(Number(closeButton.dataset.closeTab));
      return;
    }

    const trigger = event.target.closest("[data-result-index]");

    if (!trigger) {
      return;
    }

    const index = Number(trigger.dataset.resultIndex);
    highlightedIndex = index;
    renderResults();
    void submitSelection(index);
  }

  function handleResultsHover(event) {
    const trigger = event.target.closest("[data-result-index]");

    if (!trigger) {
      return;
    }

    const nextIndex = Number(trigger.dataset.resultIndex);

    if (nextIndex !== highlightedIndex) {
      highlightedIndex = nextIndex;
      renderResults();
    }
  }

  function stopKeyboardEventPropagation(event) {
    if (!isOpen) {
      return;
    }

    event.stopPropagation();
  }

  function handleEscapeKeydown(event) {
    if (!isOpen || event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dismiss();
  }

  function dismiss() {
    if (!isOpen) {
      return;
    }

    isOpen = false;
    clearTimeout(searchTimer);
    searchVersion += 1;
    closeSurface();
  }

  function restoreInputFocus(selectAll = false) {
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

export function prioritizeTypedQueryResult(results, rawQuery, mode) {
  if (mode === MODES.TAB_SEARCH) {
    return results;
  }

  const query = String(rawQuery ?? "").trim().toLowerCase();

  if (!query) {
    return results;
  }

  const prioritizedIndex = results.findIndex(
    (result) => result?.type === "search-action" && String(result.queryText ?? "").trim().toLowerCase() === query
  );

  if (prioritizedIndex <= 0) {
    return results;
  }

  return [
    results[prioritizedIndex],
    ...results.slice(0, prioritizedIndex),
    ...results.slice(prioritizedIndex + 1)
  ];
}

function appendIcon(container, result) {
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
    iconUrlCache.set(result.iconUrl, "loaded");
    fallback.remove();
    image.style.display = "";
  }, { once: true });

  image.addEventListener("error", () => {
    iconUrlCache.set(result.iconUrl, "error");
    image.remove();
    fallback.style.display = "";
  }, { once: true });

  image.src = result.iconUrl;
}

function iconNameForResult(result) {
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

function subtitleForResult(result) {
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

function badgesForResult(result) {
  const badges = [];

  if (!result.closeable && (result.type === "tab" || result.openTabId)) {
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

function buildBadge(kind) {
  const badge = document.createElement("span");
  badge.className = "zenbar-badge";
  badge.title = badgeLabel(kind);
  badge.append(createIcon(kind));
  return badge;
}

function badgeLabel(kind) {
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
