import axios from "axios";
import * as cheerio from "cheerio";

const PROMOBIT_URL = "https://www.promobit.com.br/";
const REQUEST_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/json"
};

let cache = {
  loadedAt: 0,
  offers: []
};

export async function resolveProductImage({ title, store, productUrl }) {
  const normalizedTitle = normalizeTitle(title);

  if (!normalizedTitle) return null;

  let promobitImage = await findPromobitImage(
    normalizedTitle,
    productUrl,
    false
  );

  if (promobitImage) {
    return promobitImage;
  }

  // A primeira leitura pode ter sido feita segundos antes da oferta entrar
  // na página. Força uma nova captura para pegar ofertas recém-publicadas.
  promobitImage = await findPromobitImage(
    normalizedTitle,
    productUrl,
    true
  );

  if (promobitImage) {
    return promobitImage;
  }

  return findStoreImage(productUrl);
}

async function findPromobitImage(normalizedTitle, productUrl, forceRefresh) {
  try {
    const offers = await getPromobitOffers(forceRefresh);

    const productCode = extractProductCode(productUrl);

    const exactCode = productCode
      ? offers.find(offer => extractProductCode(offer.retailerUrl) === productCode)
      : null;

    if (exactCode?.imageUrl) {
      return exactCode.imageUrl;
    }

    const exactTitle = offers.find(
      offer => normalizeTitle(offer.title) === normalizedTitle
    );

    if (exactTitle?.imageUrl) {
      return exactTitle.imageUrl;
    }

    let best = null;
    let bestScore = 0;

    for (const offer of offers) {
      const score = titleSimilarity(normalizedTitle, normalizeTitle(offer.title));

      if (score > bestScore) {
        bestScore = score;
        best = offer;
      }
    }

    if (best && bestScore >= 0.78) {
      return best.imageUrl || null;
    }

    return null;
  } catch (error) {
    console.error("[IMAGEM] Promobit:", error.message);
    return null;
  }
}

async function getPromobitOffers(forceRefresh = false) {
  const now = Date.now();

  if (
    !forceRefresh &&
    cache.offers.length &&
    now - cache.loadedAt < 60000
  ) {
    return cache.offers;
  }

  const { data } = await axios.get(PROMOBIT_URL, {
    timeout: 15000,
    headers: REQUEST_HEADERS,
    maxContentLength: 10 * 1024 * 1024
  });

  const $ = cheerio.load(data);
  const json = readNextData($);
  const offers = json?.props?.pageProps?.serverOffers?.offers || [];

  cache = {
    loadedAt: now,
    offers: offers
      .filter(offer => offer?.offerTitle && offer?.offerPhoto)
      .map(offer => ({
        title: offer.offerTitle,
        retailerUrl: "",
        imageUrl: makeOfferImageUrl(offer.offerPhoto)
      }))
      .filter(offer => offer.imageUrl)
  };

  return cache.offers;
}

async function findStoreImage(productUrl) {
  if (!productUrl) return null;

  try {
    const response = await axios.get(productUrl, {
      timeout: 12000,
      maxContentLength: 5 * 1024 * 1024,
      maxRedirects: 8,
      validateStatus: status => status >= 200 && status < 400,
      headers: {
        ...REQUEST_HEADERS,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36"
      }
    });

    const html = String(response.data || "");
    const $ = cheerio.load(html);

    const image =
      $("meta[property='og:image']").attr("content") ||
      $("meta[name='twitter:image']").attr("content") ||
      findJsonLdImage(html);

    return normalizeImageUrl(image);
  } catch (error) {
    console.error("[IMAGEM] loja:", error.message);
    return null;
  }
}

function findJsonLdImage(html) {
  const $ = cheerio.load(html);

  for (const element of $("script[type='application/ld+json']").toArray()) {
    try {
      const value = JSON.parse($(element).text());
      const image = findImage(value);

      if (image) {
        return image;
      }
    } catch {}
  }

  return null;
}

function findImage(value) {
  if (!value) return null;

  if (typeof value === "string" && /^https?:\/\//i.test(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const child of value) {
      const result = findImage(child);
      if (result) return result;
    }

    return null;
  }

  if (typeof value === "object") {
    if (typeof value.image === "string") return value.image;

    if (Array.isArray(value.image)) {
      const result = findImage(value.image);

      if (result) return result;
    }

    for (const child of Object.values(value)) {
      const result = findImage(child);

      if (result) return result;
    }
  }

  return null;
}

function extractProductCode(url) {
  const value = String(url || "");

  const amazon = value.match(/(?:\/dp\/|\/gp\/(?:product|aw\/d)\/)([A-Z0-9]{10})(?:[/?]|$)/i);

  if (amazon) {
    return "amazon:" + amazon[1].toUpperCase();
  }

  const ml = value.match(/\b(MLB-\d+)\b/i);

  if (ml) {
    return "mercadolivre:" + ml[1].toUpperCase();
  }

  return null;
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleSimilarity(a, b) {
  const left = new Set(a.split(" ").filter(x => x.length >= 2));
  const right = new Set(b.split(" ").filter(x => x.length >= 2));

  if (!left.size || !right.size) return 0;

  let common = 0;

  for (const token of left) {
    if (right.has(token)) common += 1;
  }

  const union = new Set([...left, ...right]).size;

  return union ? common / union : 0;
}

function makeOfferImageUrl(offerPhoto) {
  const value = String(offerPhoto || "").trim();

  if (!value) return null;

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return "https://i.promobit.com.br/180/" + value.replace(/^\/+/, "");
}

function normalizeImageUrl(url) {
  const value = String(url || "").trim();

  return /^https?:\/\//i.test(value) ? value : null;
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
