import { MODES } from "../shared/constants.js";
import type { Mode } from "../shared/types.js";
import { mountCommandSurface } from "./command-app.js";

function isMode(value: string | null): value is Mode {
  return typeof value === "string" && Object.values(MODES).includes(value as Mode);
}

const params = new URLSearchParams(window.location.search);
const requestedMode = params.get("mode");
const mode: Mode = isMode(requestedMode) ? requestedMode : MODES.CURRENT_TAB;
const contextTabId = Number(params.get("tabId")) || null;
const root = document.getElementById("app");

if (!(root instanceof HTMLElement)) {
  throw new Error("Missing #app mount point");
}

const app = mountCommandSurface({
  root,
  surface: "overlay",
  closeSurface: async () => {
    const currentTab = await chrome.tabs.getCurrent().catch(() => null);

    if (currentTab?.id) {
      await chrome.tabs.remove(currentTab.id).catch(() => window.close());
      return;
    }

    window.close();
  }
});

void app.open({
  mode,
  contextTabId
});
