import cron from "node-cron";
import { config } from "./config.js";
import { startTelegram } from "./telegram.js";
import { connectWhatsApp, sendWhatsAppGroupMessage } from "./whatsapp.js";

const groupJid = process.env.WHATSAPP_GROUP_JID || "";

function shouldMirror(text) {
  return String(text || "").trim().startsWith("🔥 OFERTA ENCONTRADA");
}

async function main() {
  if (!groupJid) {
    throw new Error("Defina WHATSAPP_GROUP_JID depois de descobrir o ID do grupo.");
  }

  const whatsapp = await connectWhatsApp();
  const telegram = await startTelegram();

  if (!telegram?.client) {
    throw new Error("Telegram não configurado.");
  }

  console.log("[BRIDGE] Telegram -> WhatsApp ativo.");
  console.log("[BRIDGE] Grupo:", groupJid);

  const processed = new Set();
  const maxProcessed = 500;

  telegram.client.addEventHandler(async event => {
    try {
      const message = event.message;
      const text = message?.message || "";
      const chatId = message?.chatId?.toString?.() || "";
      const messageId = message?.id;

      if (!shouldMirror(text)) return;
      if (!messageId) return;

      const key = chatId + ":" + messageId;
      if (processed.has(key)) return;

      processed.add(key);
      if (processed.size > maxProcessed) {
        const first = processed.values().next().value;
        processed.delete(first);
      }

      await sendWhatsAppGroupMessage(whatsapp, groupJid, text);
      console.log("[BRIDGE] oferta enviada ao WhatsApp:", messageId);
    } catch (error) {
      console.error("[BRIDGE] falha ao enviar:", error.message);
    }
  }, {});

  // Mantém o processo vivo e permite reinício manual pelo serviço.
  cron.schedule("*/30 * * * *", () => {
    console.log("[BRIDGE] heartbeat", new Date().toISOString());
  });
}

main().catch(error => {
  console.error("[BRIDGE] falha fatal:", error.message);
  process.exit(1);
});
