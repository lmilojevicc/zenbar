import { MODES } from "../shared/constants.js";
import { mountCommandSurface } from "./command-app.js";

const params = new URLSearchParams(window.location.search);
const requestedMode = params.get("mode");
const mode = Object.values(MODES).includes(requestedMode) ? requestedMode : MODES.CURRENT_TAB;
const contextTabId = Number(params.get("tabId")) || null;

const app = mountCommandSurface({
  root: document.getElementById("app"),
  surface: "window",
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
