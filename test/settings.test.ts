import { describe, expect, it } from "bun:test";

import { DEFAULT_SETTINGS } from "../src/shared/constants.js";
import { mergeSettings } from "../src/shared/settings.js";

describe("mergeSettings", () => {
  it("fills missing nested branches from defaults", () => {
    expect(
      mergeSettings({
        sources: { history: false },
        weights: { tabs: 0.5 }
      })
    ).toEqual({
      ...DEFAULT_SETTINGS,
      sources: {
        ...DEFAULT_SETTINGS.sources,
        history: false
      },
      weights: {
        ...DEFAULT_SETTINGS.weights,
        tabs: 0.5
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

  it("preserves explicit adaptive history preference", () => {
    expect(mergeSettings({ adaptiveHistoryEnabled: true }).adaptiveHistoryEnabled).toBe(true);
  });
});
