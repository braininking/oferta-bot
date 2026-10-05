import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../");
const DATA_DIR = path.join(ROOT, "data");
const FILE = path.join(DATA_DIR, "history.json");
const TEMP_FILE = FILE + ".tmp";

let state = { published: {} };

export async function loadHistory() {
  try {
    state = JSON.parse(await fs.readFile(FILE, "utf8"));
    if (!state || typeof state !== "object") throw new Error("Histórico inválido.");
    if (!state.published || typeof state.published !== "object") state.published = {};
  } catch {
    state = { published: {} };
    await saveHistory();
  }
}

async function saveHistory() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const content = JSON.stringify(state, null, 2);
  await fs.writeFile(TEMP_FILE, content, "utf8");
  await fs.rename(TEMP_FILE, FILE);
}

export function makeFingerprint({ store, productId, title, url }) {
  return hashKey([
    normalizeStore(store),
    normalizeIdentity(productId),
    normalizeTitle(title),
    normalizeUrl(url)
  ]);
}

export function makeProductFingerprint({ store, productId, title }) {
  return hashKey([
    normalizeStore(store),
    normalizeIdentity(productId || normalizeTitle(title))
  ]);
}

export function makeTitleFingerprint({ store, title }) {
  return hashKey([
    normalizeStore(store),
    normalizeTitle(title)
  ]);
}

export function hasPublishedProduct({ store, productId, title }) {
  const normalizedStore = normalizeStore(store);
  const normalizedProductId = normalizeIdentity(productId);
  const normalizedTitle = normalizeTitle(title);

  return Object.values(state.published).some(entry => {
    if (normalizeStore(entry?.store) !== normalizedStore) return false;

    if (
      normalizedProductId &&
      normalizeIdentity(entry?.productId) === normalizedProductId
    ) {
      return true;
    }

    const entryTitle = normalizeTitle(entry?.title);

    if (
      normalizedTitle &&
      entryTitle === normalizedTitle
    ) {
      return true;
    }

    if (
      normalizedTitle &&
      areTitlesLikelySame(normalizedTitle, entryTitle)
    ) {
      return true;
    }

    return false;
  });
}

function areTitlesLikelySame(a, b) {
  const left = new Set(String(a || "").split(" ").filter(token => token.length >= 2));
  const right = new Set(String(b || "").split(" ").filter(token => token.length >= 2));

  if (!left.size || !right.size) return false;

  let common = 0;

  for (const token of left) {
    if (right.has(token)) common += 1;
  }

  const union = new Set([...left, ...right]).size;
  const similarity = union ? common / union : 0;

  return Math.min(left.size, right.size) >= 5 && similarity >= 0.72;
}

function normalizeStore(value) {
  return String(value || "").toLowerCase().trim();
}

function normalizeIdentity(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(amazon|kabum|magalu|shopee|mercado livre)\b/g, " ")
    .replace(/\b(128gb|256gb|512gb|1tb|2tb|4tb)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(url) {
  let normalizedUrl = String(url || "").trim();

  try {
    const parsed = new URL(normalizedUrl);
    parsed.hash = "";

    const removableParams = [
      "utm_source", "utm_medium", "utm_campaign", "utm_term",
      "utm_content", "gclid", "fbclid", "ref", "ref_",
      "tag", "qid", "spm", "psc", "sr", "dib", "dib_tag"
    ];

    for (const param of removableParams) {
      parsed.searchParams.delete(param);
    }

    parsed.searchParams.sort();
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return normalizedUrl.replace(/\/$/, "");
  }
}

function hashKey(parts) {
  const base = parts.join("|");

  let hash = 2166136261;
  for (let i = 0; i < base.length; i += 1) {
    hash ^= base.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16);
}

export function hasPublished(fingerprint) {
  return Boolean(state.published[fingerprint]);
}

export function hasAnyPublished(fingerprints = []) {
  return fingerprints.some(hasPublished);
}

export async function markPublished(fingerprints, metadata = {}) {
  const list = Array.isArray(fingerprints) ? fingerprints : [fingerprints];

  for (const fingerprint of list.filter(Boolean)) {
    state.published[fingerprint] = {
      ...metadata,
      publishedAt: new Date().toISOString()
    };
  }

  await saveHistory();
}

export async function getHistorySnapshot() {
  return JSON.parse(JSON.stringify(state));
}
