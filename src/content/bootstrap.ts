import type { BasicResponse, OpenPayload } from "../shared/types.js";

interface OverlayApp {
  open: (payload: OpenPayload) => Promise<void>;
}

declare global {
  var __zenbarContentBootstrap:
    | {
        appPromise: Promise<OverlayApp> | null;
      }
    | undefined;
}

(function bootstrapZenbar() {
  if (globalThis.__zenbarContentBootstrap) {
    return;
  }

  globalThis.__zenbarContentBootstrap = {
    appPromise: null
  };

  chrome.runtime.onMessage.addListener((message: { type?: string; payload?: OpenPayload }, _sender, sendResponse) => {
    if (message?.type !== "zenbar/open-overlay") {
      return undefined;
    }

    void ensureApp()
      .then((app) => app.open(message.payload ?? {}))
      .then(() => sendResponse({ ok: true } satisfies BasicResponse))
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Unable to open overlay"
        });
      });

    return true;
  });

  function ensureApp(): Promise<OverlayApp> {
    if (!globalThis.__zenbarContentBootstrap?.appPromise) {
      globalThis.__zenbarContentBootstrap = {
        appPromise: import(chrome.runtime.getURL("src/ui/overlay-entry.js")).then((module) => module.createOverlayApp())
      };
    }

    return globalThis.__zenbarContentBootstrap.appPromise!;
  }
})();
