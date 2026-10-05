import { isAmazon, convertAmazon } from "./amazon.js";
import { isKabum, convertKabum } from "./kabum.js";
import { isMagalu, convertMagalu } from "./magalu.js";
import { isShopee, convertShopee } from "./shopee.js";
import { isMercadoLivre, convertMercadoLivre } from "./mercadolivre.js";

export function convertAffiliate(url) {
  if (isAmazon(url)) {
    const converted = convertAmazon(url);
    return converted ? { store: "amazon", url: converted } : null;
  }

  if (isKabum(url)) {
    const converted = convertKabum(url);
    return converted ? { store: "kabum", url: converted } : null;
  }

  if (isMagalu(url)) {
    const converted = convertMagalu(url);
    return converted ? { store: "magalu", url: converted } : null;
  }

  if (isShopee(url)) {
    const converted = convertShopee(url);
    return converted ? { store: "shopee", url: converted } : null;
  }

  if (isMercadoLivre(url)) {
    const converted = convertMercadoLivre(url);
    return converted ? { store: "mercadolivre", url: converted } : null;
  }

  return null;
}
