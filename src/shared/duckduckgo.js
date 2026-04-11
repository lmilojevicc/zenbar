export function extractDuckDuckGoSuggestionPhrases(payload) {
  if (!Array.isArray(payload)) {
    return [];
  }

  const rawPhrases = isTupleResponse(payload)
    ? payload[1]
    : payload.map((entry) => entry?.phrase);

  return sanitizePhrases(rawPhrases);
}

function isTupleResponse(payload) {
  return (
    payload.length >= 2 &&
    typeof payload[0] === "string" &&
    Array.isArray(payload[1])
  );
}

function sanitizePhrases(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  const seen = new Set();
  const phrases = [];

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
