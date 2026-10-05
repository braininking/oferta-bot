import { config } from "../config.js";

export function isAmazon(url) {
  return /(?:amazon\.com\.br|amzn\.to)/i.test(url);
}

export function convertAmazon(url) {
  try {
    const parsed = new URL(url);
    if (/amzn\.to/i.test(parsed.hostname)) return url;
    parsed.searchParams.set("tag", config.amazonTag);
    return parsed.toString();
  } catch {
    return null;
  }
}
