import type { QueryClassification } from "./types.js";

const EXPLICIT_PROTOCOL_RE = /^[a-z][a-z\d+.-]*:\/\//i;

export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function looksLikeUrl(input: unknown): boolean {
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

export function hasExplicitProtocol(input: unknown): boolean {
  return EXPLICIT_PROTOCOL_RE.test(String(input ?? "").trim());
}

export function stripUrlPrefix(input: unknown): string {
  return String(input ?? "")
    .trim()
    .replace(EXPLICIT_PROTOCOL_RE, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "");
}

export function stripPrefixAndTrim(input: unknown): string {
  return stripUrlPrefix(input).trim();
}

export function looksLikeOrigin(input: unknown): boolean {
  const raw = String(input ?? "").trim();

  if (!raw || !looksLikeUrl(raw) || hasExplicitProtocol(raw) || /[?#]/.test(raw)) {
    return false;
  }

  try {
    const url = new URL(normalizeUrlCandidate(raw));
    return url.pathname === "/" && !url.search && !url.hash;
  } catch {
    return false;
  }
}

export function classifyQueryInput(input: unknown): QueryClassification {
  const raw = String(input ?? "").trim();

  if (!raw) {
    return "empty";
  }

  if (!looksLikeUrl(raw)) {
    return "search";
  }

  if (hasDeepUrlPart(raw)) {
    return hasExplicitProtocol(raw) ? "deep-url" : "deep-url";
  }

  if (looksLikeOrigin(raw)) {
    return "origin-like";
  }

  return "url-like";
}

export function normalizeUrlCandidate(input: unknown): string {
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

export function normalizeComparableUrl(input: unknown): string {
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

export function fuzzyScore(query: unknown, ...candidates: unknown[]): number {
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

function subsequenceScore(query: string, target: string): number {
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

export function getFaviconUrl(url: unknown, explicitUrl = ""): string {
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

function isFaviconUnsupported(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return FAVICON_UNSUPPORTED_PROTOCOLS.has(protocol);
  } catch {
    return true;
  }
}

function isBrowserIconUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return FAVICON_UNSUPPORTED_PROTOCOLS.has(protocol);
  } catch {
    return false;
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function hasDeepUrlPart(input: string): boolean {
  try {
    const url = new URL(normalizeUrlCandidate(input));
    return url.pathname !== "/" || Boolean(url.search) || Boolean(url.hash);
  } catch {
    return false;
  }
}
