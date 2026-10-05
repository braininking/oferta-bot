import { convertAffiliate } from "../affiliates/index.js";
import { hasPublished, makeFingerprint, markPublished } from "./history.js";

export function normalizeTitle(title) {
  return String(title || "Oferta").replace(/\s+/g, " ").trim().slice(0, 180);
}

export async function prepareDeal(deal) {
  if (!deal?.url) return null;

  const converted = convertAffiliate(deal.url);
  if (!converted) return null;

  const title = normalizeTitle(deal.title);
  const identity = makeProductIdentity(converted.store, deal.productId, deal.url);

  const fingerprint = makeFingerprint({
    store: converted.store,
    productId: identity,
    title,
    url: deal.url
  });

  if (hasPublished(fingerprint)) return null;

  return {
    ...deal,
    title,
    store: converted.store,
    productId: identity,
    affiliateUrl: converted.url,
    fingerprint
  };
}

function makeProductIdentity(store, productId, url) {
  const normalizedStore = String(store || "").toLowerCase();

  if (normalizedStore === "amazon") {
    const match = String(url || "").match(/(?:\/dp\/|\/gp\/product\/)([A-Z0-9]{10})(?:[/?]|$)/i);
    if (match) return "amazon:" + match[1].toUpperCase();
  }

  if (productId) return String(productId).trim();

  return "";
}

export async function finalizeDeal(deal) {
  if (!deal?.fingerprint) throw new Error("Oferta sem fingerprint.");

  await markPublished(deal.fingerprint, {
    store: deal.store,
    productId: deal.productId || null,
    title: deal.title,
    url: deal.affiliateUrl
  });
}
