import { config } from "../config.js";

export function isMagalu(url) {
  return /(magazineluiza\.com\.br|magalu\.com\.br)/i.test(url);
}

export function convertMagalu(url) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(
      /^\/(.+?)\/p\/([a-z0-9]+)(\/[^?]*)?\/?$/i
    );

    if (!match) return null;

    const slug = match[1].replace(/^\/+|\/+$/g, "");
    const code = match[2];
    const suffix = match[3] || "";

    return (
      "https://www.magazinevoce.com.br/" +
      config.magaluPartnerId +
      "/" +
      slug +
      "/p/" +
      code +
      suffix +
      "/"
    );
  } catch {
    return null;
  }
}
