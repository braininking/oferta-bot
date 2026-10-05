import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { resolveProductImage } from "./sources/image.js";
import { sendWhatsAppGroupImage } from "./whatsapp.js";
import { startTelegram } from "./telegram.js";
import { connectWhatsApp, getWhatsAppGroupName } from "./whatsapp.js";

const ROOT = path.resolve(process.cwd());
const STATE_FILE = path.join(ROOT, "data", "whatsapp-bridge-state.json");
const POLL_MS = 30000;
const LOOKBACK_MESSAGES = 50;
const groupName = process.env.WHATSAPP_GROUP_NAME || getWhatsAppGroupName();

let state = {
  sentMessageIds: [],
  sentOfferKeys: []
};

async function loadState() {
  try {
    state = JSON.parse(await fs.readFile(STATE_FILE, "utf8"));
    if (!Array.isArray(state.sentMessageIds)) state.sentMessageIds = [];
    if (!Array.isArray(state.sentOfferKeys)) state.sentOfferKeys = [];

    state.sentOfferKeys = state.sentOfferKeys.map(normalizeOfferKey);
    await saveState();
  } catch {
    await saveState();
  }
}

async function saveState() {
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
  const temp = STATE_FILE + ".tmp";
  await fs.writeFile(
    temp,
    JSON.stringify({
      sentMessageIds: state.sentMessageIds.slice(-1000),
      sentOfferKeys: state.sentOfferKeys.slice(-1000)
    }, null, 2),
    "utf8"
  );
  await fs.rename(temp, STATE_FILE);
}

function shouldMirror(text) {
  return String(text || "").trim().startsWith("🔥 OFERTA ENCONTRADA");
}

function offerKey(text) {
  const urls = String(text || "").match(/https?:\/\/[^\s]+/g) || [];
  const commerceUrl = urls.find(url => !/t\.me\//i.test(url));

  if (commerceUrl) {
    const amazonAsin = commerceUrl.match(/(?:\/dp\/|\/gp\/product\/)([A-Z0-9]{10})(?:[/?]|$)/i);

    if (amazonAsin) {
      return "amazon:" + amazonAsin[1].toUpperCase();
    }

    const normalized = commerceUrl
      .split("?")[0]
      .replace(/[)>.,]+$/, "")
      .replace(/\/$/, "")
      .toLowerCase();

    return normalized;
  }

  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function normalizeOfferKey(key) {
  const value = String(key || "").trim().toLowerCase();
  const amazonAsin = value.match(/(?:amazon:)?(?:.*\/dp\/|.*\/gp\/product\/)([a-z0-9]{10})(?:[/?]|$)/i);

  if (amazonAsin) {
    return "amazon:" + amazonAsin[1].toUpperCase();
  }

  return value;
}

function rememberMessage(id, key) {
  if (id && !state.sentMessageIds.includes(id)) {
    state.sentMessageIds.push(id);
  }

  const normalizedKey = normalizeOfferKey(key);

  if (normalizedKey && !state.sentOfferKeys.includes(normalizedKey)) {
    state.sentOfferKeys.push(normalizedKey);
  }
}

async function downloadTelegramImage(client, message) {
  if (!message?.media) return null;

  try {
    const buffer = await client.downloadMedia(message, {});

    if (!buffer || !buffer.length) {
      return null;
    }

    const extension = detectImageExtension(buffer);
    if (!extension) {
      console.warn("[BRIDGE] mídia do Telegram não é uma imagem reconhecida.");
      return null;
    }

    return writeImageBuffer(buffer, "telegram-" + String(message.id || Date.now()), extension);
  } catch (error) {
    console.error("[BRIDGE] não foi possível baixar a imagem do Telegram:", error.message);
    return null;
  }
}

function detectImageExtension(buffer) {
  if (!buffer || buffer.length < 4) return null;

  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return ".png";
  }

  if (
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return ".jpg";
  }

  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return ".webp";
  }

  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46
  ) {
    return ".gif";
  }

  return null;
}

async function writeImageBuffer(buffer, baseName, extension) {
  const mediaDir = path.join(ROOT, "data", "whatsapp-media");
  await fs.mkdir(mediaDir, { recursive: true });

  const filePath = path.join(mediaDir, baseName + extension);

  await fs.writeFile(filePath, buffer);

  return filePath;
}

async function cleanupMedia(filePath) {
  if (!filePath) return;

  try {
    await fs.unlink(filePath);
  } catch {}
}

function extractCommerceUrl(text) {
  const urls = String(text || "").match(/https?:\/\/[^\s]+/g) || [];

  return urls
    .map(url => url.replace(/[)>.,]+$/, ""))
    .find(url => !/t\.me\//i.test(url)) || null;
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#x2f;/gi, "/")
    .replace(/&#47;/g, "/")
    .trim();
}

function extractMetaImage(html) {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["'][^>]*>/i
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtml(match[1]);
    }
  }

  return null;
}

function findJsonLdImage(html) {
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];

  for (const script of scripts) {
    const body = script
      .replace(/^.*?>/s, "")
      .replace(/<\/script>\s*$/i, "")
      .trim();

    try {
      const json = JSON.parse(body);
      const image = findImageInObject(json);

      if (image) {
        return image;
      }
    } catch {}
  }

  return null;
}

function findImageInObject(value) {
  if (!value || typeof value !== "object") return null;

  if (typeof value.image === "string" && /^https?:\/\//i.test(value.image)) {
    return value.image;
  }

  if (Array.isArray(value.image)) {
    const image = value.image.find(item => typeof item === "string" && /^https?:\/\//i.test(item));
    if (image) return image;
  }

  for (const child of Object.values(value)) {
    const found = findImageInObject(child);
    if (found) return found;
  }

  return null;
}

async function findProductPageImage(productUrl) {
  try {
    const response = await fetch(productUrl, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml"
      }
    });

    if (!response.ok) {
      return null;
    }

    const html = (await response.text()).slice(0, 4 * 1024 * 1024);

    return extractMetaImage(html) || findJsonLdImage(html);
  } catch (error) {
    console.error("[BRIDGE] não foi possível consultar a página do produto:", error.message);
    return null;
  }
}

async function downloadWebImage(url, messageId) {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
      }
    });

    if (!response.ok) return null;

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.startsWith("image/")) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    const extension = detectImageExtension(buffer);

    if (!extension || buffer.length < 100) {
      return null;
    }

    return writeImageBuffer(buffer, "web-" + messageId, extension);
  } catch (error) {
    console.error("[BRIDGE] falha ao baixar imagem da loja:", error.message);
    return null;
  }
}

function extractOfferTitle(text) {
  const match = String(text || "").match(
    /OFERTA ENCONTRADA\s*\n+([\s\S]*?)\n+\s*(?:De:|R\$|🏷️)/i
  );

  return match?.[1]?.replace(/\s+/g, " ").trim() || "";
}

function isRealImageFile(filePath) {
  return Boolean(filePath);
}

function withTimeout(promise, milliseconds, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(label + " excedeu " + milliseconds + "ms")),
        milliseconds
      )
    )
  ]);
}

async function resolveImagePath(client, message, text) {
  const productUrl = extractCommerceUrl(text);
  const title = extractOfferTitle(text);
  const messageId = String(message.id || Date.now());

  if (title && productUrl) {
    try {
      const resolvedUrl = await withTimeout(
        resolveProductImage({
          title,
          store: productUrl,
          productUrl
        }),
        20000,
        "Busca da foto do produto"
      );

      if (resolvedUrl) {
        const webImage = await withTimeout(
          downloadWebImage(resolvedUrl, messageId),
          12000,
          "Download da foto do produto"
        );

        if (isRealImageFile(webImage)) {
          console.log("[IMAGEM] foto real encontrada pelo Promobit/loja.");
          return webImage;
        }
      }
    } catch (error) {
      console.warn("[IMAGEM] busca principal falhou:", error.message);
    }
  }

  // Último recurso: baixa a mídia original da publicação do Telegram,
  // mas com timeout para nunca travar a fila inteira.
  if (client && message?.media) {
    try {
      const telegramImage = await withTimeout(
        downloadTelegramImage(client, message),
        12000,
        "Download da mídia do Telegram"
      );

      if (isRealImageFile(telegramImage)) {
        console.log("[IMAGEM] foto recuperada da mídia do Telegram.");
        return telegramImage;
      }
    } catch (error) {
      console.warn("[IMAGEM] fallback do Telegram falhou:", error.message);
    }
  }

  return null;
}

async function syncOnce(client) {
  const messages = [];

  for await (const message of client.iterMessages(
    config.telegramTargetChannel,
    { limit: LOOKBACK_MESSAGES }
  )) {
    messages.push(message);
  }

  messages.reverse();

  for (const message of messages) {
    const text = message?.message || "";
    const id = String(message?.id || "");

    if (!id || !shouldMirror(text)) continue;

    const key = offerKey(text);

    if (
      state.sentMessageIds.includes(id) ||
      state.sentOfferKeys.includes(key)
    ) {
      continue;
    }

    try {
      const imagePath = await resolveImagePath(client, message, text);

      if (!imagePath) {
        console.warn(
          "[BRIDGE] oferta sem imagem disponível; ficará pendente para nova tentativa:",
          id
        );
        continue;
      }

      let delivered = false;
      let lastSendError = null;

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          await sendWhatsAppGroupImage(
            null,
            groupName,
            imagePath,
            text
          );

          delivered = true;
          break;
        } catch (error) {
          lastSendError = error;
          console.warn(
            "[BRIDGE] tentativa",
            attempt,
            "de envio com foto falhou:",
            error.message
          );

          if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        }
      }

      if (!delivered) {
        throw new Error(
          "WhatsApp não confirmou o envio com foto: " +
          (lastSendError?.message || "erro desconhecido")
        );
      }

      await cleanupMedia(imagePath);

      rememberMessage(id, key);
      await saveState();

      console.log(
        "[BRIDGE] oferta enviada ao WhatsApp:",
        id,
        "(foto + legenda)"
      );
    } catch (error) {
      console.error("[BRIDGE] falha ao enviar", id, ":", error.message);
      continue;
    }
  }
}

async function main() {
  await loadState();

  const whatsapp = await connectWhatsApp();
  const telegram = await startTelegram();

  if (!telegram?.client) {
    throw new Error("Telegram não configurado.");
  }

  console.log("[BRIDGE] Telegram -> WhatsApp ativo.");
  console.log("[BRIDGE] Grupo:", groupName);
  console.log("[BRIDGE] Consulta a cada", POLL_MS / 1000, "segundos.");

  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;

    try {
      await syncOnce(telegram.client);
    } catch (error) {
      console.error("[BRIDGE] sincronização falhou:", error.message);
    } finally {
      running = false;
    }
  };

  await tick();
  setInterval(tick, POLL_MS);

  setInterval(() => {
    console.log("[BRIDGE] heartbeat", new Date().toISOString());
  }, 300000);
}

main().catch(error => {
  console.error("[BRIDGE] falha fatal:", error.message);
  process.exit(1);
});
