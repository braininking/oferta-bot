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

    // Ordena por potencial comercial antes da diversidade de lojas.
    fresh.sort((a, b) => marketingScore(b) - marketingScore(a));

    // Prioriza diversidade de lojas: evita que Amazon ocupe todas as vagas
    // quando outras plataformas suportadas também possuem ofertas elegíveis.
    const selected = [];
    const selectedStores = new Set();

    for (const deal of fresh) {
      const store = String(deal.store || "").toLowerCase();
      if (!store || selectedStores.has(store)) continue;

      selected.push(deal);
      selectedStores.add(store);

      if (selected.length >= limit) return selected;
    }

    // Se não houver lojas diferentes suficientes, completa com as melhores
    // ofertas restantes sem alterar a ordenação original.
    for (const deal of fresh) {
      if (selected.length >= limit) break;
      if (selected.includes(deal)) continue;
      selected.push(deal);
    }

    return selected;
  } finally {
    scanning = false;
  }
}

function marketingScore(deal) {
  const title = String(deal?.title || "").toLowerCase();
  const category = String(deal?.category || "").toLowerCase();

  const visualHighTicket = [
    "smartphone", "celular", "iphone", "galaxy", "samsung",
    "placa de vídeo", "placa de video", "rtx", "radeon", "gpu",
    "ps5", "playstation", "xbox", "nintendo", "switch",
    "smart tv", "televisão", "televisao", "tv",
    "notebook", "monitor", "processador", "ryzen", "core i",
    "ssd", "memória", "memoria", "headset", "teclado", "mouse"
  ];

  const categoryBoost = visualHighTicket.some(term =>
    title.includes(term) || category.includes(term)
  ) ? 120 : 0;

  const price = Number(deal?.price || 0);
  const discount = Number(deal?.discount || 0);
  const engagement = Number(deal?.engagementScore || 0);
  const likes = Number(deal?.likes || 0);
  const clicks = Number(deal?.clicks || 0);
  const highlightBoost = deal?.highlight ? 80 : 0;

  const priceBoost =
    price >= 300 ? 80 :
    price >= 150 ? 45 :
    price >= 80 ? 20 : 0;

  return categoryBoost +
    highlightBoost +
    Math.min(discount * 3, 120) +
    Math.min(engagement, 100) +
    Math.min(likes * 5, 50) +
    Math.min(clicks / 10, 50) +
    priceBoost;
}

export { finalizeDeal };
