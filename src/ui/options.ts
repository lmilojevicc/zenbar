import {
  COMMAND_TO_MODE,
  DEFAULT_SETTINGS,
  DUCKDUCKGO_ORIGIN,
  MODE_LABELS,
  SHORTCUTS_URL,
  SOURCE_LABELS
} from "../shared/constants.js";
import { getSettings, mergeSettings, patchSettings, saveSettings } from "../shared/settings.js";
import type { PermissionState, ZenbarSettings } from "../shared/types.js";

type SourceKey = keyof ZenbarSettings["sources"];
type WeightKey = keyof ZenbarSettings["weights"];
type PermissionKey = "bookmarks" | "history";
type Platform = string;

interface SourceDefinition {
  key: SourceKey;
  title: string;
  description: string;
  permission: PermissionKey | null;
}

interface WeightDefinition {
  key: WeightKey;
  label: string;
  min: number;
  max: number;
  step: number;
}

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

const sourceDefinitions: SourceDefinition[] = [
  {
    key: "tabs",
    title: "Open tabs",
    description: "Blend matching open tabs into the main results.",
    permission: null
  },
  {
    key: "bookmarks",
    title: "Bookmarks",
    description: "Optional. Requests bookmark access before results appear.",
    permission: "bookmarks"
  },
  {
    key: "history",
    title: "History",
    description: "Optional. Requests browser history access before results appear.",
    permission: "history"
  }
];

const weightDefinitions: WeightDefinition[] = [
  {
    key: "searchAction",
    label: SOURCE_LABELS.searchAction,
    min: 0.4,
    max: 1.8,
    step: 0.02
  },
  {
    key: "tabs",
    label: SOURCE_LABELS.tabs,
    min: 0.4,
    max: 1.8,
    step: 0.02
  },
  {
    key: "bookmarks",
    label: SOURCE_LABELS.bookmarks,
    min: 0.4,
    max: 1.8,
    step: 0.02
  },
  {
    key: "history",
    label: SOURCE_LABELS.history,
    min: 0.4,
    max: 1.8,
    step: 0.02
  },
  {
    key: "suggestions",
    label: SOURCE_LABELS.suggestions,
    min: 0.4,
    max: 1.8,
    step: 0.02
  },
  {
    key: "currentWindowTabs",
    label: "Current window boost",
    min: 0,
    max: 1,
    step: 0.02
  }
];

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

function mustGetElement<T extends HTMLElement>(id: string, ctor: { new (): T }): T {
  const element = document.getElementById(id);

  if (!(element instanceof ctor)) {
    throw new Error(`Missing required element: #${id}`);
  }

  return element;
}

const elements = {
  sources: mustGetElement("sources", HTMLElement),
  weights: mustGetElement("weights", HTMLElement),
  suggestions: mustGetElement("suggestions", HTMLElement),
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
  renderWeights();
  renderSuggestions();
  renderShortcuts();
}

function renderSources(): void {
  elements.sources.innerHTML = sourceDefinitions
    .map((source) => {
      const enabled = state.settings.sources[source.key];
      const permissionGranted = source.permission ? state.permissions[source.permission] : true;
      const status = permissionGranted ? "Access enabled" : source.permission ? "Permission needed" : "Always available";
      const action = source.permission && !permissionGranted
        ? `<button class="ghost-button" type="button" data-request-permission="${source.permission}">Grant Access</button>`
        : "";

      return `
        <article class="control-row">
          <div>
            <div class="control-title-row">
              <h3>${source.title}</h3>
              <span class="pill${permissionGranted ? "" : " pill--muted"}">${status}</span>
            </div>
            <p>${source.description}</p>
          </div>
          <div class="control-actions">
            ${action}
            <label class="toggle">
              <input type="checkbox" data-source-toggle="${source.key}" ${enabled ? "checked" : ""} />
              <span>${enabled ? "On" : "Off"}</span>
            </label>
          </div>
        </article>
      `;
    })
    .join("");

  elements.sources.querySelectorAll<HTMLInputElement>("[data-source-toggle]").forEach((input) => {
    input.addEventListener("change", async (event: Event) => {
      const target = event.currentTarget;

      if (!(target instanceof HTMLInputElement)) {
        return;
      }

      const key = target.dataset.sourceToggle as SourceKey | undefined;

      if (!key) {
        return;
      }

      const checked = target.checked;
      state.settings = await patchSettings({
        sources: {
          [key]: checked
        }
      });
      render();
      setStatus(`${labelForKey(key)} ${checked ? "enabled" : "disabled"}.`);
    });
  });

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
}

function renderWeights(): void {
  elements.weights.innerHTML = weightDefinitions
    .map((weight) => {
      const value = state.settings.weights[weight.key];

      return `
        <label class="slider-row">
          <span class="slider-row__top">
            <span>${weight.label}</span>
            <strong data-weight-value="${weight.key}">${value.toFixed(2)}</strong>
          </span>
          <input
            type="range"
            min="${weight.min}"
            max="${weight.max}"
            step="${weight.step}"
            value="${value}"
            data-weight-slider="${weight.key}"
          />
        </label>
      `;
    })
    .join("");

  elements.weights.querySelectorAll<HTMLInputElement>("[data-weight-slider]").forEach((slider) => {
    slider.addEventListener("input", (event: Event) => {
      const target = event.currentTarget;

      if (!(target instanceof HTMLInputElement)) {
        return;
      }

      const key = target.dataset.weightSlider as WeightKey | undefined;

      if (!key) {
        return;
      }

      const valueElement = elements.weights.querySelector<HTMLElement>(`[data-weight-value="${key}"]`);
      if (valueElement) {
        valueElement.textContent = Number(target.value).toFixed(2);
      }
    });

    slider.addEventListener("change", async (event: Event) => {
      const target = event.currentTarget;

      if (!(target instanceof HTMLInputElement)) {
        return;
      }

      const key = target.dataset.weightSlider as WeightKey | undefined;

      if (!key) {
        return;
      }

      const value = Number(target.value);
      state.settings = await patchSettings({
        weights: {
          [key]: value
        }
      });
      renderWeights();
      setStatus(`${weightDefinitions.find((entry) => entry.key === key)?.label || key} updated.`);
    });
  });
}

function renderSuggestions(): void {
  const provider = state.settings.suggestionProvider;
  const hasAccess = state.permissions.duckduckgo;

  elements.suggestions.innerHTML = `
    <div class="stack">
      <label class="field">
        <span>Provider</span>
        <select id="suggestion-provider">
          <option value="off" ${provider === "off" ? "selected" : ""}>Off</option>
          <option value="duckduckgo" ${provider === "duckduckgo" ? "selected" : ""}>DuckDuckGo</option>
        </select>
      </label>
      <p class="note">
        Remote suggestions are optional. If enabled, typed queries may be sent to DuckDuckGo for suggestions, but final searches still open with your browser default engine.
      </p>
      <div class="inline-actions">
        <span class="pill${hasAccess ? "" : " pill--muted"}">${hasAccess ? "Host access enabled" : "Host access not granted"}</span>
        ${hasAccess ? "" : '<button id="grant-ddg" class="ghost-button" type="button">Enable Host Access</button>'}
      </div>
    </div>
  `;

  const providerSelect = elements.suggestions.querySelector<HTMLSelectElement>("#suggestion-provider");

  if (!providerSelect) {
    return;
  }

  providerSelect.addEventListener("change", async (event: Event) => {
    const target = event.currentTarget;

    if (!(target instanceof HTMLSelectElement)) {
      return;
    }

    const nextValue = target.value === "duckduckgo" ? "duckduckgo" : "off";

    if (nextValue === "duckduckgo" && !state.permissions.duckduckgo) {
      const granted = await requestDuckDuckGoPermission();

      if (!granted) {
        target.value = "off";
        setStatus("DuckDuckGo host access was not granted.", true);
        return;
      }
    }

    state.settings = await patchSettings({
      suggestionProvider: nextValue
    });
    await refresh();
    setStatus(nextValue === "off" ? "Remote suggestions disabled." : "DuckDuckGo suggestions enabled.");
  });

  const grantButton = elements.suggestions.querySelector<HTMLButtonElement>("#grant-ddg");

  if (grantButton) {
    grantButton.addEventListener("click", async () => {
      const granted = await requestDuckDuckGoPermission();
      await refresh();
      setStatus(granted ? "DuckDuckGo host access granted." : "DuckDuckGo host access was not granted.", !granted);
    });
  }
}

function renderShortcuts(): void {
  const unassignedCount = state.commands.filter((command) => !command.shortcut).length;
  const warning = unassignedCount
    ? `<p class="note">${unassignedCount} command${unassignedCount === 1 ? " is" : "s are"} currently unassigned.</p>`
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
  return sourceDefinitions.find((source) => source.key === key)?.title || key;
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
