import {
  COMMAND_TO_MODE,
  DUCKDUCKGO_ORIGIN,
  MODE_LABELS,
  SHORTCUTS_URL,
  SOURCE_LABELS
} from "../shared/constants.js";
import { getSettings, mergeSettings, patchSettings, saveSettings } from "../shared/settings.js";

const sourceDefinitions = [
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

const weightDefinitions = [
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

const state = {
  settings: null,
  platform: "unknown",
  permissions: {
    bookmarks: false,
    history: false,
    duckduckgo: false
  },
  commands: []
};

const elements = {
  sources: document.getElementById("sources"),
  weights: document.getElementById("weights"),
  suggestions: document.getElementById("suggestions"),
  shortcuts: document.getElementById("shortcuts"),
  status: document.getElementById("status"),
  changeShortcuts: document.getElementById("change-shortcuts"),
  exportButton: document.getElementById("export-settings"),
  importButton: document.getElementById("import-settings"),
  importFile: document.getElementById("import-file")
};

boot().catch((error) => {
  setStatus(error?.message || "Unable to load settings.", true);
});

async function boot() {
  bindStaticEvents();
  await refresh();
}

function bindStaticEvents() {
  elements.changeShortcuts.addEventListener("click", openShortcutsManager);
  elements.exportButton.addEventListener("click", exportSettings);
  elements.importButton.addEventListener("click", () => elements.importFile.click());
  elements.importFile.addEventListener("change", handleImportFile);
}

async function refresh() {
  state.settings = await getSettings();
  state.platform = await getPlatform();
  state.permissions = await getPermissionState();
  state.commands = await getCommandState();
  render();
}

function render() {
  renderSources();
  renderWeights();
  renderSuggestions();
  renderShortcuts();
}

function renderSources() {
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

  elements.sources.querySelectorAll("[data-source-toggle]").forEach((input) => {
    input.addEventListener("change", async (event) => {
      const key = event.currentTarget.dataset.sourceToggle;
      const checked = event.currentTarget.checked;
      state.settings = await patchSettings({
        sources: {
          [key]: checked
        }
      });
      render();
      setStatus(`${labelForKey(key)} ${checked ? "enabled" : "disabled"}.`);
    });
  });

  elements.sources.querySelectorAll("[data-request-permission]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      const permission = event.currentTarget.dataset.requestPermission;
      const granted = await requestPermission(permission);
      await refresh();
      setStatus(granted ? `${labelForKey(permission)} access granted.` : `${labelForKey(permission)} access was not granted.`, !granted);
    });
  });
}

function renderWeights() {
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

  elements.weights.querySelectorAll("[data-weight-slider]").forEach((slider) => {
    slider.addEventListener("input", (event) => {
      const key = event.currentTarget.dataset.weightSlider;
      elements.weights.querySelector(`[data-weight-value="${key}"]`).textContent = Number(event.currentTarget.value).toFixed(2);
    });

    slider.addEventListener("change", async (event) => {
      const key = event.currentTarget.dataset.weightSlider;
      const value = Number(event.currentTarget.value);
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

function renderSuggestions() {
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

  elements.suggestions.querySelector("#suggestion-provider").addEventListener("change", async (event) => {
    const nextValue = event.currentTarget.value;

    if (nextValue === "duckduckgo" && !state.permissions.duckduckgo) {
      const granted = await requestDuckDuckGoPermission();

      if (!granted) {
        event.currentTarget.value = "off";
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

  const grantButton = elements.suggestions.querySelector("#grant-ddg");

  if (grantButton) {
    grantButton.addEventListener("click", async () => {
      const granted = await requestDuckDuckGoPermission();
      await refresh();
      setStatus(granted ? "DuckDuckGo host access granted." : "DuckDuckGo host access was not granted.", !granted);
    });
  }
}

function renderShortcuts() {
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

async function getPermissionState() {
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

async function getCommandState() {
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

async function getPlatform() {
  try {
    const info = await chrome.runtime.getPlatformInfo();
    return info?.os || "unknown";
  } catch {
    return "unknown";
  }
}

async function requestPermission(permission) {
  if (permission === "bookmarks" || permission === "history") {
    return await chrome.permissions.request({ permissions: [permission] });
  }

  return false;
}

async function requestDuckDuckGoPermission() {
  return await chrome.permissions.request({ origins: [DUCKDUCKGO_ORIGIN] });
}

async function openShortcutsManager() {
  try {
    await chrome.tabs.create({ url: SHORTCUTS_URL });
    setStatus("Opened the browser shortcut manager.");
  } catch {
    setStatus(`Open ${SHORTCUTS_URL} manually if your browser blocks this link.`, true);
  }
}

function exportSettings() {
  const blob = new Blob([JSON.stringify(state.settings, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "zenbar-settings.json";
  anchor.click();
  URL.revokeObjectURL(url);
  setStatus("Exported Zenbar settings.");
}

async function handleImportFile(event) {
  const [file] = event.currentTarget.files || [];
  event.currentTarget.value = "";

  if (!file) {
    return;
  }

  try {
    const raw = await file.text();
    const parsed = JSON.parse(raw);
    state.settings = await saveSettings(mergeSettings(parsed));
    await refresh();
    setStatus("Imported Zenbar settings.");
  } catch (error) {
    setStatus(error?.message || "The selected file is not valid JSON.", true);
  }
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.dataset.error = isError ? "true" : "false";
}

function labelForKey(key) {
  return sourceDefinitions.find((source) => source.key === key)?.title || key;
}

function renderShortcutMarkup(shortcut, platform) {
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

function renderKeycap(key, platform) {
  const label = getKeycapLabel(key, platform);
  return `<span class="shortcut-key">${escapeHtml(label)}</span>`;
}

function getKeycapLabel(key, platform) {
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
