export function extractDuckDuckGoSuggestionPhrases(payload: unknown): string[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  const rawPhrases = isTupleResponse(payload)
    ? payload[1]
    : payload.map((entry) => (isPhraseEntry(entry) ? entry.phrase : undefined));

  return sanitizePhrases(rawPhrases);
}

function isTupleResponse(payload: unknown[]): payload is [string, unknown[]] {
  return payload.length >= 2 && typeof payload[0] === "string" && Array.isArray(payload[1]);
}

function isPhraseEntry(value: unknown): value is { phrase?: unknown } {
  return typeof value === "object" && value !== null;
}

function sanitizePhrases(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const seen = new Set<string>();
  const phrases: string[] = [];

  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const phrase = value.trim();

    if (!phrase) {
      continue;
    }

    const normalizedPhrase = phrase.toLowerCase();

    if (seen.has(normalizedPhrase)) {
      continue;
    }

    seen.add(normalizedPhrase);
    phrases.push(phrase);
  }

  return phrases;
}
