import axios from "axios";
import * as cheerio from "cheerio";

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
  "User-Agent": "OfertaBot/0.2 (+deal-monitor)",
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
    const candidates = offers
      .filter(isUsefulOffer)
      .filter(offer => isTargetStoreDomain(offer.storeDomain))
      .slice(0, 30)
      .map(offer => ({
        title: offer.offerTitle,
        productId: String(offer.offerId),
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
        source: sourceUrl
      }));

    const resolved = [];
    for (const deal of dedupe(candidates)) {
      const retailerUrl = await resolvePromobitOffer(deal.productId);
      if (!retailerUrl) continue;

      const finalUrl = await resolveExternalUrl(retailerUrl);
      if (!isSupportedStore(finalUrl)) continue;

      resolved.push({
        title: deal.title,
        productId: deal.productId,
        url: finalUrl,
        source: deal.source,
        storeName: deal.storeName,
        storeDomain: deal.storeDomain,
        price: deal.price,
        oldPrice: deal.oldPrice,
        discount: deal.discount,
        publishedAt: deal.publishedAt
      });
    }

    return resolved;
  }

  return scanLegacyJsonLd($, sourceUrl);
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

    const response = await axios.get(url, {
      timeout: 8000,
      maxRedirects: 6,
      validateStatus: status => status >= 200 && status < 400,
      responseType: "text",
      maxContentLength: 256 * 1024,
      headers: REQUEST_HEADERS
    });

    return response.request?.res?.responseUrl || response.config?.url || url;
  } catch (error) {
    return error?.request?.res?.responseUrl || null;
  }
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
