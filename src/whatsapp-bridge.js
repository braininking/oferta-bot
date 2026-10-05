import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { startTelegram } from "./telegram.js";
import {
  connectWhatsApp,
  sendWhatsAppGroupMessage,
  getWhatsAppGroupName
} from "./whatsapp.js";

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
    return commerceUrl
      .split("?")[0]
      .replace(/[)>.,]+$/, "")
      .replace(/\/$/, "")
      .toLowerCase();
  }

  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function rememberMessage(id, key) {
  if (id && !state.sentMessageIds.includes(id)) {
    state.sentMessageIds.push(id);
  }

  if (key && !state.sentOfferKeys.includes(key)) {
    state.sentOfferKeys.push(key);
  }
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
      await sendWhatsAppGroupMessage(null, groupName, text);
      rememberMessage(id, key);
      await saveState();

      console.log("[BRIDGE] oferta enviada ao WhatsApp:", id);
    } catch (error) {
      console.error("[BRIDGE] falha ao enviar", id, ":", error.message);
      break;
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
