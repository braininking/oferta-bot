import "dotenv/config";
import input from "input";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import fs from "node:fs/promises";

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

if (!apiId || !apiHash) {
  throw new Error("TELEGRAM_API_ID/TELEGRAM_API_HASH não configurados.");
}

const client = new TelegramClient(
  new StringSession(process.env.TELEGRAM_SESSION || ""),
  apiId,
  apiHash,
  { connectionRetries: 10 }
);

await client.start({
  phoneNumber: async () => input.text("Digite seu número do Telegram: "),
  password: async () => input.text("Digite sua senha 2FA (se houver): "),
  phoneCode: async () => input.text("Digite o código recebido no Telegram: "),
  onError: error => console.error("[TELEGRAM]", error)
});

const session = client.session.save();
const envPath = "C:\\OfertaBot\\.env";
let env = await fs.readFile(envPath, "utf8");

if (/^TELEGRAM_SESSION=.*$/m.test(env)) {
  env = env.replace(/^TELEGRAM_SESSION=.*$/m, `TELEGRAM_SESSION=${session}`);
} else {
  env += `\\nTELEGRAM_SESSION=${session}\\n`;
}

await fs.writeFile(envPath, env, "utf8");

console.log("\n[TELEGRAM] CONECTADO COM SUCESSO!");
console.log("[TELEGRAM] Sessão salva no .env.");
console.log("[TELEGRAM] Você pode fechar esta janela.");
await client.disconnect();
