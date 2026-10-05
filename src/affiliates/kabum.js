import { config } from "../config.js";

export function isKabum(url) {
  return /kabum\.com\.br/i.test(url);
}

export function convertKabum(url) {
  if (!config.kabumAwinTemplate) return null;
  return config.kabumAwinTemplate
    .replaceAll("{url}", encodeURIComponent(url));
}
