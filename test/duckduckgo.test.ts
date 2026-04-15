import { describe, expect, it } from "bun:test";

import { extractDuckDuckGoSuggestionPhrases } from "../src/shared/duckduckgo.js";

describe("extractDuckDuckGoSuggestionPhrases", () => {
  it("parses the object-array response shape", () => {
    const payload = [
      { phrase: "zenbar" },
      { phrase: "zenbar browser" },
      { phrase: "zenbar extension" }
    ];

    expect(extractDuckDuckGoSuggestionPhrases(payload)).toEqual([
      "zenbar",
      "zenbar browser",
      "zenbar extension"
    ]);
  });

  it("parses the type=list tuple response shape", () => {
    const payload = [
      "zenbar",
      ["zenbar", "zenbar browser", "zenbar extension"]
    ];

    expect(extractDuckDuckGoSuggestionPhrases(payload)).toEqual([
      "zenbar",
      "zenbar browser",
      "zenbar extension"
    ]);
  });

  it("drops blanks, non-strings, and duplicates while preserving order", () => {
    const payload = [
      { phrase: "zenbar" },
      { phrase: "" },
      { phrase: " zenbar browser " },
      { phrase: "zenbar" },
      { phrase: null },
      {},
      { phrase: "zenbar browser" }
    ];

    expect(extractDuckDuckGoSuggestionPhrases(payload)).toEqual([
      "zenbar",
      "zenbar browser"
    ]);
  });

  it("returns an empty list for unsupported payloads", () => {
    expect(extractDuckDuckGoSuggestionPhrases(null)).toEqual([]);
    expect(extractDuckDuckGoSuggestionPhrases({})).toEqual([]);
    expect(extractDuckDuckGoSuggestionPhrases(["zenbar"])).toEqual([]);
    expect(extractDuckDuckGoSuggestionPhrases(["zenbar", {}])).toEqual([]);
  });
});
