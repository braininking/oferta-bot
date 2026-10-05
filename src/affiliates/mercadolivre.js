import { config } from "../config.js";

export function isMercadoLivre(url) {
  return /(?:mercadolivre\.com\.br|mercadolivre\.com)/i.test(url);
}

export function convertMercadoLivre(url) {
  if (!config.mercadoLivreAffiliateTemplate) return null;
  return config.mercadoLivreAffiliateTemplate
    .replaceAll("{url}", encodeURIComponent(url));
}
