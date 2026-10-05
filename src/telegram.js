import input from "input";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import { config } from "./config.js";
import { prepareDeal, finalizeDeal } from "./core/processor.js";
import { createTelegramPublisher } from "./publishers/telegram.js";

export async function startTelegram() {
  if (!config.telegramApiId || !config.telegramApiHash || !config.telegramTargetChannel) {
    console.log("[TELEGRAM] não configurado; modo garimpo continua disponível.");
    return null;
  }

  const client = new TelegramClient(
    new StringSession(config.telegramSession),
    config.telegramApiId,
    config.telegramApiHash,
    { connectionRetries: 10 }
  );

  await client.start({
    phoneNumber: async () => input.text("Número do Telegram: "),
    password: async () => input.text("Senha 2FA: "),
    phoneCode: async () => input.text("Código recebido no Telegram: "),
    onError: error => console.error("[TELEGRAM]", error?.message || error)
  });

  console.log("[TELEGRAM] conectado.");

  const publisher = createTelegramPublisher(client, config.telegramTargetChannel);

  if (config.telegramSourceChannels.length) {
    client.addEventHandler(async event => {
      const text = event.message?.message || "";
      const match = text.match(/https?:\/\/[^\s<>]+/i);
      if (!match) return;

      const prepared = await prepareDeal({
        title: text.slice(0, 180),
        url: match[0].replace(/[),.!?]+$/g, "")
      });

      if (!prepared) return;

      try {
        await publisher.publish(prepared);
        await finalizeDeal(prepared);
        console.log("[TELEGRAM] oferta publicada:", prepared.title);
      } catch (error) {
        console.error("[TELEGRAM] publicação falhou:", error.message);
      }
    }, new NewMessage({ chats: config.telegramSourceChannels }));
  }

  return { client, publisher };
}
