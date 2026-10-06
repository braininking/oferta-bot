import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { config } from "./config.js";
import { startTelegram } from "./telegram.js";

const require = createRequire(import.meta.url);
const { sendImageDirect, closeClient } = require("./whatsapp-direct.cjs");

const ROOT = path.resolve(process.cwd());
const STATE_FILE = path.join(ROOT, "data", "whatsapp-bridge-state.json");
const LOCK_FILE = path.join(ROOT, "data", "whatsapp-bridge.lock");
const MEDIA_DIR = path.join(ROOT, "data", "whatsapp-media");

const POLL_MS = 30000;
const LOOKBACK_MESSAGES = 100;
const GROUP_NAME = process.env.WHATSAPP_GROUP_NAME || "RADAR DE OFERTAS";

let state = {
  sentMessageIds: [],
  sentOfferKeys: []
};

let lockHandle = null;

async function acquireLock() {
  await fs.mkdir(path.dirname(LOCK_FILE), { recursive: true });

  try {
    lockHandle = await fs.open(LOCK_FILE, "wx");
    await lockHandle.writeFile(
      JSON.stringify({
        pid: process.pid,
        startedAt: new Date().toISOString()
      }),
      "utf8"
    );
  } catch (error) {
    if (error.code !== "EEXIST") {
      throw error;
    }

    try {
      const raw = await fs.readFile(LOCK_FILE, "utf8");
      const existing = JSON.parse(raw);

      if (existing?.pid) {
        try {
          process.kill(Number(existing.pid), 0);
          console.error(
            "[BRIDGE] já existe uma ponte ativa. PID:",
            existing.pid
          );
          process.exit(0);
        } catch {}
      }

      await fs.rm(LOCK_FILE, { force: true });
    } catch {}

    lockHandle = await fs.open(LOCK_FILE, "wx");

    await lockHandle.writeFile(
      JSON.stringify({
        pid: process.pid,
        startedAt: new Date().toISOString()
      }),
      "utf8"
    );
  }
}

async function releaseLock() {
  try {
    if (lockHandle) {
      await lockHandle.close();
      lockHandle = null;
    }
  } catch {}

  await fs.rm(LOCK_FILE, { force: true }).catch(() => {});
}

async function loadState() {
  try {
    state = JSON.parse(await fs.readFile(STATE_FILE, "utf8"));

    if (!Array.isArray(state.sentMessageIds)) {
      state.sentMessageIds = [];
    }

    if (!Array.isArray(state.sentOfferKeys)) {
      state.sentOfferKeys = [];
    }

    state.sentOfferKeys = state.sentOfferKeys.map(normalizeOfferKey);

    await saveState();
  } catch {
    state = {
      sentMessageIds: [],
      sentOfferKeys: []
    };

    await saveState();
  }
}

async function saveState() {
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });

  const temp = STATE_FILE + ".tmp";

  await fs.writeFile(
    temp,
    JSON.stringify(
      {
        sentMessageIds: state.sentMessageIds.slice(-2000),
        sentOfferKeys: state.sentOfferKeys.slice(-2000)
      },
      null,
      2
    ),
    "utf8"
  );

  await fs.rename(temp, STATE_FILE);
}

function shouldMirror(text) {
  const value = String(text || "").trim();
  return /^🔥(?:\s|$)/u.test(value) && /🛒\s*Comprar:/i.test(value) && /https?:\/\/\S+/i.test(value);
}

function whatsappCaption(text) {
  return String(text || "").trim().replace(/\s*✅ PUBLICAÇÃO DIRETA NO WHATSAPP — FOTO REAL DO PRODUTO\.?\s*$/u, "").trim();
}

function extractCommerceUrl(text) {
  const urls = String(text || "").match(/https?:\/\/[^\s]+/g) || [];

  return (
    urls
      .map(url => url.replace(/[)>.,]+$/, ""))
      .find(url => !/t\.me\//i.test(url)) || null
  );
}

function extractOfferTitle(text) {
  const value = String(text || "").replace(/^🔥\s*/u, "").trim();
  const match = value.match(/^([\s\S]*?)\n+\s*(?:De:|💰|R\$|🏷️|🛒\s*Comprar:)/i);
  return match?.[1]?.replace(/\s+/g, " ").trim() || "";
}

function offerKey(text) {
  const urls = String(text || "").match(/https?:\/\/[^\s]+/g) || [];
  const commerceUrl = urls.find(url => !/t\.me\//i.test(url));

  if (commerceUrl) {
    const clean = commerceUrl.replace(/[)>.,]+$/, "");

    const amazonAsin = clean.match(
      /(?:\/dp\/|\/gp\/product\/|\/gp\/aw\/d\/)([A-Z0-9]{10})(?:[/?]|$)/i
    );

    if (amazonAsin) {
      return "amazon:" + amazonAsin[1].toUpperCase();
    }

    return clean
      .split("?")[0]
      .replace(/\/$/, "")
      .toLowerCase();
  }

  return normalizeTitle(extractOfferTitle(text) || text);
}

function normalizeOfferKey(key) {
  const value = String(key || "").trim().toLowerCase();

  const amazonAsin = value.match(
    /(?:amazon:|.*\/dp\/|.*\/gp\/product\/|.*\/gp\/aw\/d\/)([a-z0-9]{10})(?:[/?]|$)/i
  );

  if (amazonAsin) {
    return "amazon:" + amazonAsin[1].toUpperCase();
  }

  return value;
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isImageBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 100) {
    return false;
  }

  const png =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;

  const jpg =
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;

  const webp =
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer.toString("ascii", 8, 12) === "WEBP";

  return png || jpg || webp;
}

async function downloadTelegramImage(client, message) {
  if (!message?.media) {
    return null;
  }

  try {
    const buffer = await Promise.race([
      client.downloadMedia(message, {
        thumb: undefined
      }),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("downloadMedia expirou")),
          15000
        )
      )
    ]);

    if (!isImageBuffer(buffer)) {
      return null;
    }

    await fs.mkdir(MEDIA_DIR, { recursive: true });

    const filePath = path.join(
      MEDIA_DIR,
      "telegram-" + String(message.id) + ".jpg"
    );

    await fs.writeFile(filePath, buffer);

    return filePath;
  } catch (error) {
    console.warn(
      "[IMAGEM] download do Telegram falhou:",
      error.message
    );

    return null;
  }
}

async function cleanupMedia(filePath) {
  if (!filePath) return;

  await fs.rm(filePath, { force: true }).catch(() => {});
}

function alreadySent(messageId, key) {
  return (
    state.sentMessageIds.includes(messageId) ||
    state.sentOfferKeys.includes(normalizeOfferKey(key))
  );
}

function rememberSent(messageId, key) {
  if (messageId && !state.sentMessageIds.includes(messageId)) {
    state.sentMessageIds.push(messageId);
  }

  const normalized = normalizeOfferKey(key);

  if (normalized && !state.sentOfferKeys.includes(normalized)) {
    state.sentOfferKeys.push(normalized);
  }
}

async function syncOnce(telegramClient) {
  const messages = [];

  for await (const message of telegramClient.iterMessages(
    config.telegramTargetChannel,
    {
      limit: LOOKBACK_MESSAGES
    }
  )) {
    messages.push(message);
  }

  messages.reverse();

  for (const message of messages) {
    const text = message?.message || "";
    const id = String(message?.id || "");

    if (!id || !shouldMirror(text)) {
      continue;
    }

    const key = offerKey(text);

    if (alreadySent(id, key)) {
      continue;
    }

    const imagePath = await downloadTelegramImage(
      telegramClient,
      message
    );

    if (!imagePath) {
      console.warn(
        "[BRIDGE] oferta",
        id,
        "ficou pendente: sem foto real."
      );
      continue;
    }

    let delivered = false;
    let lastError = null;

    try {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const sent = await sendImageDirect(
            imagePath,
            whatsappCaption(text)
          );

          if (!sent?.hasMedia) {
            throw new Error(
              "WhatsApp não confirmou a mídia."
            );
          }

          delivered = true;

          console.log(
            "[BRIDGE] publicada diretamente no WhatsApp:",
            id,
            "(foto + legenda)"
          );

          break;
        } catch (error) {
          lastError = error;

          console.warn(
            "[BRIDGE] tentativa",
            attempt,
            "falhou para",
            id,
            ":",
            error.message
          );

          if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }

      if (!delivered) {
        throw new Error(
          "Falha ao publicar mídia no WhatsApp: " +
          (lastError?.message || "erro desconhecido")
        );
      }

      rememberSent(id, key);
      await saveState();
    } catch (error) {
      console.error(
        "[BRIDGE] oferta",
        id,
        "não foi marcada como enviada:",
        error.message
      );
    } finally {
      await cleanupMedia(imagePath);
    }
  }
}

async function main() {
  await acquireLock();
  await loadState();

  const telegram = await startTelegram();

  if (!telegram?.client) {
    throw new Error("Telegram não configurado.");
  }

  console.log("[BRIDGE] modo direto Telegram -> WhatsApp.");
  console.log("[BRIDGE] grupo:", GROUP_NAME);
  console.log("[BRIDGE] imagem obrigatória: SIM");
  console.log("[BRIDGE] polling:", POLL_MS, "ms");

  let running = false;

  const tick = async () => {
    if (running) return;

    running = true;

    try {
      await syncOnce(telegram.client);
    } catch (error) {
      console.error(
        "[BRIDGE] sincronização falhou:",
        error.message
      );
    } finally {
      running = false;
    }
  };

  await tick();

  const timer = setInterval(tick, POLL_MS);

  const shutdown = async signal => {
    clearInterval(timer);

    console.log("[BRIDGE] encerrando:", signal);

    try {
      await telegram.client.disconnect();
    } catch {}

    await closeClient();
    await releaseLock();

    process.exit(0);
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  setInterval(() => {
    console.log(
      "[BRIDGE] heartbeat",
      new Date().toISOString()
    );
  }, 300000);
}

main().catch(async error => {
  console.error("[BRIDGE] falha fatal:", error.message);

  await closeClient();
  await releaseLock();

  process.exit(1);
});
