import { config } from "../config.js";

export function isKabum(url) {
  return /kabum\.com\.br/i.test(url);
}

export function convertKabum(url) {
  if (!config.kabumAwinPublisherId) return null;

  try {
    const parsed = new URL(url);
    parsed.hash = "";

    return (
      "https://www.awin1.com/cread.php?" +
      "awinmid=" + encodeURIComponent(config.kabumAwinAdvertiserId) +
      "&awinaffid=" + encodeURIComponent(config.kabumAwinPublisherId) +
      "&ued=" + encodeURIComponent(parsed.toString())
    );
  } catch {
    return null;
  }
}
