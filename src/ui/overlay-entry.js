import { mountCommandSurface } from "./command-app.js";

export async function createOverlayApp() {
  let host = document.getElementById("zenbar-overlay-root");

  if (!host) {
    host = document.createElement("div");
    host.id = "zenbar-overlay-root";
    document.documentElement.append(host);
  }

  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.zIndex = "2147483647";
  host.style.isolation = "isolate";
  host.style.display = "none";

  const shadowRoot = host.shadowRoot || host.attachShadow({ mode: "open" });

  if (!shadowRoot.querySelector("link[data-zenbar-style]")) {
    const styleLink = document.createElement("link");
    styleLink.rel = "stylesheet";
    styleLink.href = chrome.runtime.getURL("styles/command.css");
    styleLink.dataset.zenbarStyle = "true";
    shadowRoot.append(styleLink);
  }

  let mountPoint = shadowRoot.querySelector("[data-zenbar-mount]");

  if (!mountPoint) {
    mountPoint = document.createElement("div");
    mountPoint.dataset.zenbarMount = "true";
    mountPoint.style.width = "100%";
    mountPoint.style.height = "100%";
    shadowRoot.append(mountPoint);
  }

  const app = mountCommandSurface({
    root: mountPoint,
    surface: "overlay",
    closeSurface: () => {
      host.style.display = "none";
    }
  });

  return {
    async open(payload) {
      host.style.display = "block";
      await app.open(payload);
    }
  };
}
