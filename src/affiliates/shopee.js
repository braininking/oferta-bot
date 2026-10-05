import { config } from "../config.js";

export function isShopee(url) {
  return /(?:shopee\.com\.br|s\.shopee\.com\.br)/i.test(url);
}

export function convertShopee(url) {
  if (!config.shopeeAffiliateTemplate) return null;
  return config.shopeeAffiliateTemplate
    .replaceAll("{url}", encodeURIComponent(url));
}
