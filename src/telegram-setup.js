import "dotenv/config";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import fs from "node:fs/promises";
import input from "input";

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const session = process.env.TELEGRAM_SESSION || "";

const client = new TelegramClient(new StringSession(session), apiId, apiHash, {
  connectionRetries: 10
});

await client.connect();

if (!(await client.checkAuthorization())) {
  await client.start({
    phoneNumber: async () => input.text("Número: "),
    password: async () => input.text("Senha 2FA: "),
    phoneCode: async () => input.text("Código: "),
    onError: err => console.error(err)
  });
}

console.log("\n=== CONFIGURAÇÃO DO CANAL ===");
console.log("A conta conectada é sua conta pessoal do Telegram.");
console.log("Crie ou escolha o canal onde o Oferta Bot publicará as ofertas.");
console.log("Você precisa ser administrador desse canal.");
const target = await input.text("Digite @username do canal (ex.: @ofertabot): ");

if (!target) throw new Error("Canal não informado.");

const me = await client.getMe();
console.log(`Conta conectada: ${me.firstName || ""} ${me.lastName || ""}`);

try {
  const entity = await client.getEntity(target);
  console.log("Canal encontrado:", entity.title || target);
  console.log("ID:", entity.id?.toString?.() || entity.id);

  const envPath = "C:\\OfertaBot\\.env";
  let env = await fs.readFile(envPath, "utf8");
  if (/^TELEGRAM_TARGET_CHANNEL=.*$/m.test(env)) {
    env = env.replace(/^TELEGRAM_TARGET_CHANNEL=.*$/m, `TELEGRAM_TARGET_CHANNEL=${target}`);
  } else {
    env += `\\nTELEGRAM_TARGET_CHANNEL=${target}\\n`;
  }
  await fs.writeFile(envPath, env, "utf8");

  console.log("\n[OK] Canal salvo no .env.");
  console.log("[OK] Próximo passo: testar publicação.");
} finally {
  await client.disconnect();
}
