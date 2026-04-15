import { DUCKDUCKGO_ORIGIN, SHORTCUTS_URL } from "../shared/constants.js";
import { patchSettings } from "../shared/settings.js";

const elements = {
  changeShortcuts: document.getElementById("change-shortcuts") as HTMLButtonElement,
  grantDdg: document.getElementById("grant-ddg") as HTMLButtonElement,
  finish: document.getElementById("finish") as HTMLButtonElement,
  status: document.getElementById("status") as HTMLElement,
  permissionButtons: document.querySelectorAll<HTMLButtonElement>("[data-request-permission]")
};

elements.changeShortcuts.addEventListener("click", async () => {
  try {
    await chrome.tabs.create({ url: SHORTCUTS_URL });
    setStatus("Opened shortcut settings.");
  } catch {
    setStatus(`Please open ${SHORTCUTS_URL} manually.`, true);
  }
});

elements.permissionButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const permission = button.dataset.requestPermission;
    if (permission === "history" || permission === "bookmarks") {
      const granted = await chrome.permissions.request({ permissions: [permission] });
      if (granted) {
        button.disabled = true;
        button.textContent = `${permission.charAt(0).toUpperCase() + permission.slice(1)} Access Granted`;
        setStatus(`${permission} access granted.`);
      } else {
        setStatus(`${permission} access denied.`, true);
      }
    }
  });
});

elements.grantDdg.addEventListener("click", async () => {
  const granted = await chrome.permissions.request({ origins: [DUCKDUCKGO_ORIGIN] });
  if (granted) {
    await patchSettings({ suggestionProvider: "duckduckgo" });
    elements.grantDdg.disabled = true;
    elements.grantDdg.textContent = "Suggestions Enabled";
    setStatus("DuckDuckGo suggestions enabled.");
  } else {
    setStatus("Host access denied.", true);
  }
});

elements.finish.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

function setStatus(message: string, isError = false): void {
  elements.status.textContent = message;
  elements.status.dataset.error = isError ? "true" : "false";
}
