import type { OpenPayload } from "../shared/types.js";
import { mountCommandSurface } from "./command-app.js";

interface OverlayApp {
  open: (payload: OpenPayload) => Promise<void>;
}

export async function createOverlayApp(): Promise<OverlayApp> {
  let host = document.getElementById("zenbar-overlay-root");

  if (!(host instanceof HTMLElement)) {
    host = document.createElement("div");
    host.id = "zenbar-overlay-root";
    document.documentElement.append(host);
  }

  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.zIndex = "2147483647";
  host.style.isolation = "isolate";
  host.style.mixBlendMode = "normal";
  host.style.filter = "none";
  host.style.opacity = "1";
  host.style.colorScheme = "dark";
  host.style.display = "none";

  const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: "open" });

  if (!shadowRoot.querySelector("link[data-zenbar-style]")) {
    const styleLink = document.createElement("link");
    styleLink.rel = "stylesheet";
    styleLink.href = chrome.runtime.getURL("styles/command.css");
    styleLink.dataset.zenbarStyle = "true";
    shadowRoot.append(styleLink);
  }

  let mountPoint = shadowRoot.querySelector<HTMLElement>("[data-zenbar-mount]");

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
    async open(payload: OpenPayload) {
      host.style.display = "block";
      await app.open(payload);
    }
  };
}
