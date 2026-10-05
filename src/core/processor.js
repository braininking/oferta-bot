import { convertAffiliate } from "../affiliates/index.js";
import {
  hasAnyPublished,
  hasPublishedProduct,
  makeFingerprint,
  makeProductFingerprint,
  makeTitleFingerprint,
  markPublished
} from "./history.js";

export function normalizeTitle(title) {
  return String(title || "Oferta").replace(/\s+/g, " ").trim().slice(0, 180);
}

export async function prepareDeal(deal) {
  if (!deal?.url) return null;

  const converted = convertAffiliate(deal.url);
  if (!converted) return null;

  const title = normalizeTitle(deal.title);
  const identity = makeProductIdentity(converted.store, deal.productId, deal.url, deal.title);

  const fingerprint = makeFingerprint({
    store: converted.store,
    productId: identity,
    title,
    url: converted.url
  });

  const productFingerprint = makeProductFingerprint({
    store: converted.store,
    productId: identity,
    title
  });

  const titleFingerprint = makeTitleFingerprint({
    store: converted.store,
    title
  });

  if (
    hasAnyPublished([
      fingerprint,
      productFingerprint,
      titleFingerprint
    ]) ||
    hasPublishedProduct({
      store: converted.store,
      productId: identity,
      title
    })
  ) {
    return null;
  }

  return {
    ...deal,
    title,
    store: converted.store,
    productId: identity,
    affiliateUrl: converted.url,
    fingerprint,
    productFingerprint,
    titleFingerprint
  };
}

function makeProductIdentity(store, productId, url, title) {
  const normalizedStore = String(store || "").toLowerCase();
  const sourceUrl = String(url || "");

  if (normalizedStore === "amazon") {
    const match = sourceUrl.match(/(?:\/dp\/|\/gp\/product\/)([A-Z0-9]{10})(?:[/?]|$)/i);
    if (match) return "amazon:" + match[1].toUpperCase();
  }

  if (normalizedStore === "mercadolivre") {
    const match = sourceUrl.match(/\b(MLB-\d+)\b/i);
    if (match) return "mercadolivre:" + match[1].toUpperCase();
  }

  if (normalizedStore === "magalu") {
    const match = sourceUrl.match(/\/p\/([a-z0-9]+)/i);
    if (match) return "magalu:" + match[1].toLowerCase();
  }

  if (normalizedStore === "shopee") {
    const match = sourceUrl.match(/\/product\/([0-9]+)\/([0-9]+)/i);
    if (match) return "shopee:" + match[1] + ":" + match[2];
    const alternate = sourceUrl.match(/i\.([0-9]+)\.([0-9]+)/i);
    if (alternate) return "shopee:" + alternate[1] + ":" + alternate[2];
  }

  if (normalizedStore === "kabum") {
    const parts = new URL(sourceUrl).pathname
      .split("/")
      .filter(Boolean)
      .slice(-3);
    if (parts.length) return "kabum:" + parts.join("/").toLowerCase();
  }

  if (productId) return String(productId).trim();

  return normalizeFallbackTitle(title);
}

function normalizeFallbackTitle(title) {
  return String(title || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function finalizeDeal(deal) {
  if (!deal?.fingerprint) throw new Error("Oferta sem fingerprint.");

  await markPublished(
    [deal.fingerprint, deal.productFingerprint, deal.titleFingerprint],
    {
      store: deal.store,
      productId: deal.productId || null,
      title: deal.title,
      url: deal.affiliateUrl
    }
  );
}
