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
  const normalizedStore = String(store || "").toLowerCase().trim();
  const normalizedProductId = String(productId || "").trim();
  const normalizedTitle = String(title || "").toLowerCase().replace(/\s+/g, " ").trim();
  const normalizedUrl = normalizeUrl(url);

  // Quando temos um identificador estável do produto, ele é a identidade principal.
  // Isso evita publicar o mesmo produto novamente só porque o Promobit criou outra oferta.
  const base = normalizedProductId
    ? [normalizedStore, normalizedProductId].join("|")
    : [normalizedStore, normalizedTitle, normalizedUrl].join("|");

  let hash = 2166136261;
  for (let i = 0; i < base.length; i++) {
    hash ^= base.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16);
}

function normalizeUrl(url) {
  let normalizedUrl = String(url || "").trim();

  try {
    const parsed = new URL(normalizedUrl);
    parsed.hash = "";

    const removableParams = [
      "utm_source", "utm_medium", "utm_campaign", "utm_term",
      "utm_content", "gclid", "fbclid", "ref", "ref_", "tag",
      "qid", "spm", "psc", "sr", "dib", "dib_tag"
    ];

    for (const param of removableParams) parsed.searchParams.delete(param);
    parsed.searchParams.sort();

    return parsed.toString().replace(/\/$/, "");
  } catch {
    return normalizedUrl.replace(/\/$/, "");
  }
}

export function hasPublished(fingerprint) {
  return Boolean(state.published[fingerprint]);
}

export async function markPublished(fingerprint, metadata = {}) {
  state.published[fingerprint] = {
    ...metadata,
    publishedAt: new Date().toISOString()
  };
  await saveHistory();
}
