import { describe, expect, it } from "bun:test";

import { DEFAULT_SETTINGS, SETTINGS_KEY } from "../src/shared/constants.js";
import { ensureSettings, mergeSettings, patchSettings } from "../src/shared/settings.js";
import type { ZenbarSettings } from "../src/shared/types.js";

describe("mergeSettings", () => {
  it("fills missing nested branches from defaults", () => {
    expect(
      mergeSettings({
        sources: { history: false }
      })
    ).toEqual({
      ...DEFAULT_SETTINGS,
      sources: {
        ...DEFAULT_SETTINGS.sources,
        history: false
      },
      suggestionProvider: "off",
      adaptiveHistoryEnabled: false
    });
  });

  it("normalizes unsupported suggestion providers to off", () => {
    const raw = JSON.parse('{"suggestionProvider":"custom"}');

    expect(mergeSettings(raw).suggestionProvider).toBe("off");
  });

  it("defaults adaptive history to disabled", () => {
    expect(mergeSettings({}).adaptiveHistoryEnabled).toBe(false);
  });

  it("defaults result source order to the current blended ranking", () => {
    expect(mergeSettings({}).resultSourceOrder).toEqual([
      "input-history",
      "tabs",
      "bookmarks",
      "history",
      "suggestions"
    ]);
  });

  it("preserves an explicit result source order", () => {
    expect(mergeSettings({
      resultSourceOrder: ["history", "tabs", "bookmarks", "input-history", "suggestions"]
    } as Parameters<typeof mergeSettings>[0]).resultSourceOrder).toEqual([
      "history",
      "tabs",
      "bookmarks",
      "input-history",
      "suggestions"
    ]);
  });

  it("repairs invalid imported result source order entries", () => {
    expect(mergeSettings({
      resultSourceOrder: ["history", "history", "custom", "tabs"]
    } as unknown as Parameters<typeof mergeSettings>[0]).resultSourceOrder).toEqual([
      "history",
      "tabs",
      "input-history",
      "bookmarks",
      "suggestions"
    ]);
  });

  it("preserves explicit adaptive history preference", () => {
    expect(mergeSettings({ adaptiveHistoryEnabled: true }).adaptiveHistoryEnabled).toBe(true);
  });

  it("defaults command position to center", () => {
    expect(mergeSettings({}).commandPosition).toBe("center");
  });

  it("preserves explicit top command position preference", () => {
    expect(mergeSettings({ commandPosition: "top" } as Parameters<typeof mergeSettings>[0]).commandPosition).toBe("top");
  });

  it("normalizes unsupported command positions to center", () => {
    expect(mergeSettings({ commandPosition: "bottom" } as Parameters<typeof mergeSettings>[0]).commandPosition).toBe("center");
  });

  it("ignores legacy stored weight settings", () => {
    expect(
      mergeSettings({
        suggestionProvider: "duckduckgo",
        weights: {
          tabs: 9
        }
      } as unknown as Parameters<typeof mergeSettings>[0])
    ).toEqual({
      ...DEFAULT_SETTINGS,
      suggestionProvider: "duckduckgo",
      adaptiveHistoryEnabled: false
    });
  });

  it("does not preserve weights from imported data", () => {
    expect("weights" in mergeSettings({
      weights: {
        history: 12
      }
    } as unknown as Parameters<typeof mergeSettings>[0])).toBe(false);
  });

  it("serializes concurrent patch writes so order and toggles are both preserved", async () => {
    const originalChrome = globalThis.chrome;
    let storedSettings: ZenbarSettings = structuredClone(DEFAULT_SETTINGS);

    globalThis.chrome = {
      storage: {
        local: {
          async get(key: string) {
            const snapshot = structuredClone(storedSettings);
            await Promise.resolve();
            return { [key]: snapshot };
          },
          async set(values: Record<string, unknown>) {
            const nextSettings: ZenbarSettings = structuredClone(values[SETTINGS_KEY] as ZenbarSettings);

            if (nextSettings.sources.history === false) {
              await new Promise((resolve) => setTimeout(resolve, 10));
            }

            storedSettings = nextSettings;
          }
        }
      }
    } as unknown as typeof chrome;

    try {
      await Promise.all([
        patchSettings({
          resultSourceOrder: ["history", "tabs", "bookmarks", "input-history", "suggestions"]
        }),
        patchSettings({
          sources: {
            history: false
          }
        })
      ]);

      expect(storedSettings.resultSourceOrder).toEqual([
        "history",
        "tabs",
        "bookmarks",
        "input-history",
        "suggestions"
      ]);
      expect(storedSettings.sources.history).toBe(false);
    } finally {
      globalThis.chrome = originalChrome;
    }
  });

  it("does not rewrite settings during ensureSettings normalization", async () => {
    const originalChrome = globalThis.chrome;
    let setCalls = 0;

    globalThis.chrome = {
      storage: {
        local: {
          async get(key: string) {
            return {
              [key]: {
                sources: {
                  history: false
                }
              }
            };
          },
          async set() {
            setCalls += 1;
          }
        }
      }
    } as unknown as typeof chrome;

    try {
      const merged = await ensureSettings();

      expect(merged.sources.history).toBe(false);
      expect(merged.resultSourceOrder).toEqual(DEFAULT_SETTINGS.resultSourceOrder);
      expect(setCalls).toBe(0);
    } finally {
      globalThis.chrome = originalChrome;
    }
  });
});
