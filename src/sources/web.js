import axios from "axios";
import * as cheerio from "cheerio";
import { qualityRejectReason, qualityScore } from "./quality.js";

const STORE_HOSTS = [
  /(?:^|\.)amazon\.com\.br$/i,
  /(?:^|\.)kabum\.com\.br$/i,
  /(?:^|\.)magazineluiza\.com\.br$/i,
  /(?:^|\.)magalu\.com\.br$/i,
  /(?:^|\.)shopee\.com\.br$/i,
  /(?:^|\.)mercadolivre\.com\.br$/i
];

const TARGET_STORE_DOMAINS = [
  "amazon.com.br",
  "kabum.com.br",
  "magazineluiza.com.br",
  "magalu.com.br",
  "shopee.com.br",
  "mercadolivre.com.br"
];

const REQUEST_HEADERS = {
  "User-Agent": "OfertaBot/0.3 (+deal-monitor)",
  "Accept": "text/html,application/xhtml+xml,application/json"
};

export async function scanPublicPage(sourceUrl) {
  const { data } = await axios.get(sourceUrl, {
    timeout: 20000,
    headers: REQUEST_HEADERS,
    maxContentLength: 8 * 1024 * 1024
  });

  const $ = cheerio.load(data);
  const nextData = readNextData($);
  const offers = nextData?.props?.pageProps?.serverOffers?.offers || [];

  if (offers.length) {
    const rawCandidates = offers
      .filter(isUsefulOffer)
      .filter(offer => isTargetStoreDomain(offer.storeDomain));

    const qualityCandidates = rawCandidates
      .map(offer => ({ offer, rejectReason: qualityRejectReason(offer) }))
      .filter(item => !item.rejectReason)
      .map(item => item.offer)
      .sort((a, b) => qualityScore(b) - qualityScore(a))
      .slice(0, 30);

    const rejected = rawCandidates.length - qualityCandidates.length;
    console.log("[QUALIDADE]", sourceUrl, "=>", rawCandidates.length, "válidos de loja;", rejected, "rejeitados por qualidade");

    const candidates = qualityCandidates.map(offer => ({
      title: offer.offerTitle,
      productId: String(offer.offerId),
      imageUrl: makeOfferImageUrl(offer.offerPhoto),
      promobitUrl: new URL(
        "/oferta/" + offer.offerSlug + "/",
        sourceUrl
      ).toString(),
      storeName: offer.storeName || "",
      storeDomain: offer.storeDomain || "",
      price: offer.offerPrice ?? null,
      oldPrice: offer.offerOldPrice ?? null,
      discount: offer.offerDiscontPercentage ?? 0,
      publishedAt: offer.offerPublished || null,
      likes: offer.offerLikes ?? 0,
      engagementScore: offer.offerEngagementScore ?? 0,
      clicks: offer.offerClicks ?? 0,
      comments: offer.offerComments ?? 0,
      highlight: Boolean(offer.offerIsHighlight),
      category: offer.categoryName || "",
      source: sourceUrl
    }));

    const uniqueCandidates = dedupe(candidates).slice(0, 30);
    const resolved = await mapWithConcurrency(uniqueCandidates, 6, async deal => {
      const retailerUrl = await resolvePromobitOffer(deal.productId);
      if (!retailerUrl) return null;
      const finalUrl = await resolveExternalUrl(retailerUrl);
      if (!isSupportedStore(finalUrl)) return null;
      const imageUrl = await resolveHigherResolutionImageUrl(deal.imageUrl);
      return {
        title: deal.title, productId: deal.productId, imageUrl, url: finalUrl,
        source: deal.source, storeName: deal.storeName, storeDomain: deal.storeDomain,
        price: deal.price, oldPrice: deal.oldPrice, discount: deal.discount, publishedAt: deal.publishedAt,
        likes: deal.likes, engagementScore: deal.engagementScore, clicks: deal.clicks, comments: deal.comments,
        highlight: deal.highlight, category: deal.category
      };
    });

    return resolved.filter(Boolean);
  }

  return scanLegacyJsonLd($, sourceUrl);
}

function makeOfferImageUrl(offerPhoto) {
  const value = String(offerPhoto || "").trim();

  if (!value) return null;

  if (/^https?:\/\//i.test(value)) return value;

  const cleanPath = value.replace(/^\/+/, "");

  return "https://i.promobit.com.br/180/" + cleanPath;
}

async function resolveHigherResolutionImageUrl(imageUrl) {
  if (!imageUrl || !/\/180\//i.test(imageUrl)) return imageUrl || null;

  const highResolutionUrl = imageUrl.replace(/\/180\//i, "/600/");

  try {
    const response = await axios.head(highResolutionUrl, {
      timeout: 2000,
      maxRedirects: 3,
      validateStatus: status => status >= 200 && status < 400,
      headers: {
        "User-Agent": REQUEST_HEADERS["User-Agent"],
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
      }
    });

    return response.status >= 200 && response.status < 400
      ? highResolutionUrl
      : imageUrl;
  } catch {
    return imageUrl;
  }
}

function readNextData($) {
  const raw = $("#__NEXT_DATA__").text();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isUsefulOffer(offer) {
  if (!offer?.offerId || !offer?.offerTitle || !offer?.storeDomain) return false;
  if (offer.offerStatusName && !["APPROVED", "TOP_OFFER"].includes(offer.offerStatusName)) {
    return false;
  }
  return true;
}

function isTargetStoreDomain(domain) {
  const normalized = String(domain || "").toLowerCase().replace(/^www\./, "");
  return TARGET_STORE_DOMAINS.includes(normalized);
}

async function resolvePromobitOffer(productId) {
  try {
    const { data } = await axios.get(
      "https://www.promobit.com.br/Redirect/to/" + encodeURIComponent(productId) + "/",
      {
        timeout: 10000,
        headers: REQUEST_HEADERS,
        maxContentLength: 512 * 1024
      }
    );

    const html = String(data);
    const match =
      html.match(/\bl\s*=\s*['"]([^'"]+)['"]/i) ||
      html.match(/location\.href\s*=\s*['"]([^'"]+)['"]/i);

    if (!match?.[1]) return null;
    return decodeEscapedUrl(match[1]);
  } catch {
    return null;
  }
}

async function resolveExternalUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (isSupportedStore(parsed.toString())) return parsed.toString();
    const response = await axios.get(url, { timeout: 8000, maxRedirects: 6, validateStatus: status => status >= 200 && status < 400, responseType: "text", maxContentLength: 256 * 1024, headers: REQUEST_HEADERS });
    return response.request?.res?.responseUrl || null;
  } catch (error) {
    return error?.request?.res?.responseUrl || null;
  }
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length); let nextIndex = 0;
  async function runWorker() { while (true) { const index = nextIndex++; if (index >= items.length) return; try { results[index] = await worker(items[index], index); } catch (error) { console.warn("[RESOLUÇÃO] candidato falhou:", error.message); results[index] = null; } } }
  await Promise.all(Array.from({length: Math.min(Math.max(1, concurrency), items.length)}, () => runWorker()));
  return results;
}

function decodeEscapedUrl(value) {
  return String(value)
    .replace(/\\u002f/gi, "/")
    .replace(/\\u003a/gi, ":")
    .replace(/&amp;/gi, "&");
}

function isSupportedStore(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return STORE_HOSTS.some(pattern => pattern.test(hostname));
  } catch {
    return false;
  }
}

async function scanLegacyJsonLd($, sourceUrl) {
  const deals = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw.includes("ItemList")) return;

    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      return;
    }

    for (const entry of json.itemListElement || []) {
      const item = entry?.item;
      const offer = Array.isArray(item?.offers) ? item.offers[0] : item?.offers;
      if (!item?.name || !item?.sku || !offer) continue;

      const storeDomain = offer.seller?.url || "";
      deals.push({
        title: String(item.name).replace(/\s+/g, " ").trim(),
        productId: String(item.sku),
        imageUrl: Array.isArray(item.image) ? item.image[0] : (item.image || null),
        promobitUrl: new URL(offer.url || "/", sourceUrl).toString(),
        storeName: offer.seller?.name || "",
        price: offer.price ?? offer.lowPrice ?? null,
        source: sourceUrl,
        storeDomain
      });
    }
  });

  const resolved = [];
  for (const deal of dedupe(deals)) {
    const retailerUrl = await resolvePromobitOffer(deal.productId);
    if (!retailerUrl) continue;

    const finalUrl = await resolveExternalUrl(retailerUrl);
    if (!isSupportedStore(finalUrl)) continue;

    resolved.push({
      ...deal,
      url: finalUrl
    });
  }

  return resolved;
}

function dedupe(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = String(item.productId || item.promobitUrl || "").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
