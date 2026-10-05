import "dotenv/config";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

const client = new TelegramClient(
  new StringSession(process.env.TELEGRAM_SESSION || ""),
  Number(process.env.TELEGRAM_API_ID),
  process.env.TELEGRAM_API_HASH,
  { connectionRetries: 10 }
);

await client.connect();

if (!(await client.checkAuthorization())) {
  throw new Error("Sessão Telegram não está autenticada.");
}

const target = process.env.TELEGRAM_TARGET_CHANNEL;
const message = [
  "🤖 TESTE DO OFERTA BOT",
  "",
  "✅ Conexão com o canal funcionando.",
  "🔥 RADAR DE OFERTAS está pronto para receber ofertas automáticas.",
  "",
  "⚙️ Próximo passo: ativar o garimpo automático."
].join("\n");

await client.sendMessage(target, { message });
console.log("[OK] Mensagem de teste publicada em", target);

await client.disconnect();
