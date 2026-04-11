(function bootstrapZenbar() {
  if (globalThis.__zenbarContentBootstrap) {
    return;
  }

  globalThis.__zenbarContentBootstrap = {
    appPromise: null
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "zenbar/open-overlay") {
      return undefined;
    }

    ensureApp()
      .then((app) => app.open(message.payload))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error?.message || "Unable to open overlay"
        });
      });

    return true;
  });

  function ensureApp() {
    if (!globalThis.__zenbarContentBootstrap.appPromise) {
      globalThis.__zenbarContentBootstrap.appPromise = import(
        chrome.runtime.getURL("src/ui/overlay-entry.js")
      ).then((module) => module.createOverlayApp());
    }

    return globalThis.__zenbarContentBootstrap.appPromise;
  }
})();
