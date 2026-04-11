export function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function looksLikeUrl(input) {
  const value = String(input ?? "").trim();

  if (!value || /\s/.test(value)) {
    return false;
  }

  if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) {
    return true;
  }

  if (value.startsWith("localhost") || value.startsWith("127.0.0.1")) {
    return true;
  }

  if (value.includes("/") && value.includes(".")) {
    return true;
  }

  return /^[^\s]+\.[^\s]{2,}$/.test(value);
}

export function normalizeUrlCandidate(input) {
  const raw = String(input ?? "").trim();

  if (!raw) {
    return "";
  }

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(raw)
    ? raw
    : `https://${raw}`;

  try {
    return new URL(candidate).href;
  } catch {
    return raw;
  }
}

export function normalizeComparableUrl(input) {
  const value = String(input ?? "").trim();

  if (!value) {
    return "";
  }

  try {
    const url = new URL(normalizeUrlCandidate(value));

    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
      url.port = "";
    }

    if (url.pathname.endsWith("/") && url.pathname !== "/") {
      url.pathname = url.pathname.slice(0, -1);
    }

    url.hash = "";

    return url.href;
  } catch {
    return value.toLowerCase();
  }
}

export function fuzzyScore(query, ...candidates) {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return 0;
  }

  let best = 0;

  for (const candidate of candidates) {
    const target = normalizeText(candidate);

    if (!target) {
      continue;
    }

    let score = 0;

    if (target === normalizedQuery) {
      score += 160;
    }

    if (target.startsWith(normalizedQuery)) {
      score += 132;
    }

    const includesIndex = target.indexOf(normalizedQuery);

    if (includesIndex >= 0) {
      score += 108 - Math.min(includesIndex, 36);
    }

    score += subsequenceScore(normalizedQuery, target);

    best = Math.max(best, score);
  }

  return Math.max(best, 0);
}

function subsequenceScore(query, target) {
  let queryIndex = 0;
  let streak = 0;
  let score = 0;

  for (let index = 0; index < target.length && queryIndex < query.length; index += 1) {
    if (target[index] === query[queryIndex]) {
      streak += 1;
      score += 4 + streak * 1.5;
      queryIndex += 1;
      continue;
    }

    streak = 0;
  }

  if (queryIndex !== query.length) {
    return 0;
  }

  return score;
}

const FAVICON_UNSUPPORTED_PROTOCOLS = new Set([
  "chrome:",
  "chrome-extension:",
  "chrome-untrusted:",
  "edge:",
  "brave:",
  "about:",
  "data:",
  "javascript:"
]);

export function getFaviconUrl(url, explicitUrl = "") {
  if (explicitUrl && !isBrowserIconUrl(explicitUrl)) {
    return explicitUrl;
  }

  const normalizedUrl = normalizeUrlCandidate(url);

  if (!normalizedUrl || isFaviconUnsupported(normalizedUrl)) {
    return "";
  }

  try {
    return chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(normalizedUrl)}&size=32`);
  } catch {
    return "";
  }
}

function isFaviconUnsupported(url) {
  try {
    const { protocol } = new URL(url);
    return FAVICON_UNSUPPORTED_PROTOCOLS.has(protocol);
  } catch {
    return true;
  }
}

function isBrowserIconUrl(url) {
  try {
    const { protocol } = new URL(url);
    return FAVICON_UNSUPPORTED_PROTOCOLS.has(protocol);
  } catch {
    return false;
  }
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
