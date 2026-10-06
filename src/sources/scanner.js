import { config } from "../config.js";
import { scanPublicPage } from "./web.js";
import { prepareDeal, finalizeDeal } from "../core/processor.js";

let scanning = false;

export async function scanForNewDeals() {
  if (scanning) {
    console.log("[GARIMPO] varredura anterior ainda está em andamento; ignorando esta execução.");
    return [];
  }

  scanning = true;
  try {
    const candidates = [];

    for (const url of config.dealSourceUrls) {
      try {
        const found = await scanPublicPage(url);
        candidates.push(...found);
        console.log("[GARIMPO]", url, "=>", found.length, "candidatos válidos");
      } catch (error) {
        console.error("[GARIMPO] erro:", url, error.message);
      }
    }

    const fresh = [];
    const fingerprints = new Set();
    const products = new Set();

    for (const deal of candidates) {
      const prepared = await prepareDeal(deal);
      if (!prepared) continue;

      // Evita que versões repetidas do mesmo produto passem na mesma varredura
      // antes que a primeira publicação seja gravada no histórico.
      const productKey = `${String(prepared.store || "").toLowerCase()}|${String(prepared.productId || "").toLowerCase()}`;
      const titleKey = `${String(prepared.store || "").toLowerCase()}|${String(prepared.titleFingerprint || "")}`;
      const duplicateKey = prepared.productId ? productKey : titleKey;

      if (products.has(duplicateKey)) continue;
      if (fingerprints.has(prepared.fingerprint)) continue;

      fingerprints.add(prepared.fingerprint);
      products.add(duplicateKey);
      fresh.push(prepared);
    }

    const limit = Math.max(0, Number(config.maxDealsPerScan || 3));
    return fresh.slice(0, limit);
  } finally {
    scanning = false;
  }
}

export { finalizeDeal };
