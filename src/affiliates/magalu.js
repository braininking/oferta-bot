import { config } from "../config.js";

export function isMagalu(url) {
  return /(magazineluiza\.com\.br|magalu\.com\.br)/i.test(url);
}

export function convertMagalu(url) {
  if (!config.magaluAffiliateTemplate) return null;
  return config.magaluAffiliateTemplate
    .replaceAll("{url}", encodeURIComponent(url));
}
