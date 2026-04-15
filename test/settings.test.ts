import { describe, expect, it } from "bun:test";

import { DEFAULT_SETTINGS } from "../src/shared/constants.js";
import { mergeSettings } from "../src/shared/settings.js";

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

  it("preserves explicit adaptive history preference", () => {
    expect(mergeSettings({ adaptiveHistoryEnabled: true }).adaptiveHistoryEnabled).toBe(true);
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
});
