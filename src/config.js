import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });

export const config = {
  telegramApiId: Number(process.env.TELEGRAM_API_ID || 0),
  telegramApiHash: process.env.TELEGRAM_API_HASH || "",
  telegramSession: process.env.TELEGRAM_SESSION || "",
  telegramTargetChannel: process.env.TELEGRAM_TARGET_CHANNEL || "",
  telegramSourceChannels: (process.env.TELEGRAM_SOURCE_CHANNELS || "")
    .split(",").map(v => v.trim()).filter(Boolean),

  dealSourceUrls: (process.env.DEAL_SOURCE_URLS || "")
    .split(",").map(v => v.trim()).filter(Boolean),

  scanCron: process.env.SCAN_CRON || "*/10 * * * *",
  maxDealsPerScan: Number(process.env.MAX_DEALS_PER_SCAN || 3),

  amazonTag: process.env.AMAZON_TAG || "ofertaradar03-20",

  kabumAwinAdvertiserId: process.env.KABUM_AWIN_ADVERTISER_ID || "17729",
  kabumAwinPublisherId: process.env.KABUM_AWIN_PUBLISHER_ID || "",

  magaluPartnerId: process.env.MAGALU_PARTNER_ID || "magazineoneshotlink",

  shopeeAffiliateTemplate: process.env.SHOPEE_AFFILIATE_TEMPLATE || "",
  mercadoLivreAffiliateTemplate: process.env.MERCADOLIVRE_AFFILIATE_TEMPLATE || "",

  whatsappEnabled: process.env.WHATSAPP_ENABLED === "true",
  whatsappCdpPort: Number(process.env.WHATSAPP_CDP_PORT || 9222),
  whatsappGroupName: process.env.WHATSAPP_GROUP_NAME || "RADAR DE OFERTAS"
};
