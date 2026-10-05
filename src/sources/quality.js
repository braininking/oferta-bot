const BLACKLIST_PATTERNS = [
  /\bassine\b/i,
  /\bseja\s+prime\b/i,
  /\bteste\s+gr[aá]tis\b/i,
  /\bganhe\s+r\$\b/i,
  /\bp[aá]gina\s+de\s+cupons?\b/i,
  /\bcupom\b/i,
  /\broleta\s+de\s+cupons?\b/i,
  /\bclube\s+de\s+vantagens?\b/i,
  /\bassinat(?:ura|uras)\b/i,
  /\bplano\s+(?:de\s+)?internet\b/i,
  /\bfibra\b/i,
  /\bm[eê]s\b.*\b(?:internet|plano)\b/i,
  /\bcashback\b/i
];

const LANDING_PAGE_PATTERNS = [
  /\bat[eé]\s+\d+\s*%\s*off\s+na\s+\w+\s+em\s+/i,
  /\bat[eé]\s+\d+\s*%\s*de\s+economia\s+para\s+voc[eê]\b/i,
  /\b\w+\s+vem\s+a[ií]\b/i,
  /\b(?:ofertas?|promo[cç][oõ]es?)\s+(?:de|em)\s+.+\s+e\s+muito\s+mais\b/i,
  /\b(?:ofertas?|promo[cç][oõ]es?)\s+da\s+(?:amazon|shopee|magalu|kabum|mercado\s+livre)\b/i,
  /\b(?:ofertas?|promo[cç][oõ]es?)\s+(?:em|na|no)\s+.+\s+e\s+muito\s+mais\b/i
];

export const MIN_LIKES = 2;
export const MIN_ENGAGEMENT_SCORE = 20;
export const MAX_FRESH_HOURS = 72;

export function qualityRejectReason(offer) {
  const title = String(offer?.offerTitle || "").replace(/\s+/g, " ").trim();

  const text = [
    title,
    offer?.offerCta,
    offer?.offerTags?.join?.(" ")
  ]
    .filter(Boolean)
    .join(" ");

  if (BLACKLIST_PATTERNS.some(pattern => pattern.test(text))) {
    return "blacklist";
  }

  if (LANDING_PAGE_PATTERNS.some(pattern => pattern.test(text))) {
    return "landing_page";
  }

  if (!isProductLikeTitle(title)) {
    return "titulo_generico";
  }

  const price = Number(offer?.offerPrice || 0);

  if (!(price > 0)) {
    return "sem_preco";
  }

  const publishedAt = Date.parse(String(offer?.offerPublished || ""));

  if (Number.isFinite(publishedAt)) {
    const ageHours = (Date.now() - publishedAt) / 3600000;

    if (ageHours > MAX_FRESH_HOURS) {
      return "antiga";
    }
  }

  const likes = Number(offer?.offerLikes || 0);
  const score = Number(offer?.offerEngagementScore || 0);
  const discount = Number(offer?.offerDiscontPercentage || 0);
  const oldPrice = Number(offer?.offerOldPrice || 0);
  const highlight = Boolean(offer?.offerIsHighlight);
  const status = String(offer?.offerStatusName || "").toUpperCase();

  const realDiscount =
    oldPrice > price * 1.02 ||
    discount >= 5;

  if (
    realDiscount ||
    highlight ||
    status === "TOP_OFFER" ||
    likes >= MIN_LIKES ||
    score >= MIN_ENGAGEMENT_SCORE
  ) {
    return null;
  }

  return "baixa_forca_da_oferta";
}

function isProductLikeTitle(title) {
  const value = String(title || "").trim();

  if (!value) return false;

  const words = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);

  if (words.length < 4) return false;

  if (/\b(amazon|shopee|magalu|kabum|mercado livre)\b/i.test(value) &&
      /\b(?:ofertas?|promocoes?)\b/i.test(value)) {
    return false;
  }

  return true;
}

export function qualityScore(offer) {
  const likes = Number(offer?.offerLikes || 0);
  const score = Number(offer?.offerEngagementScore || 0);
  const clicks = Number(offer?.offerClicks || 0);
  const discount = Number(offer?.offerDiscontPercentage || 0);
  const highlight = offer?.offerIsHighlight ? 100 : 0;
  const topOffer = offer?.offerStatusName === "TOP_OFFER" ? 80 : 0;

  return highlight + topOffer +
    Math.min(likes * 12, 180) +
    Math.min(score, 180) +
    Math.min(clicks / 20, 100) +
    Math.min(discount * 2, 100);
}
