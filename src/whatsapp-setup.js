import readline from "node:readline";
import { connectWhatsApp, listWhatsAppGroups } from "./whatsapp.js";

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log("\n=== CONFIGURAÇÃO DO WHATSAPP ===");
  console.log("Vamos usar código de pareamento em vez de QR Code.");
  console.log("Informe o número do WhatsApp com DDI, somente números.");
  console.log("Exemplo Brasil: 5511999999999");
  console.log("");

  const phoneNumber = process.env.WHATSAPP_PAIRING_NUMBER ||
    await ask("Número do WhatsApp: ");

  if (!phoneNumber) {
    throw new Error("Número do WhatsApp não informado.");
  }

  const sock = await connectWhatsApp({
    pairingPhoneNumber: phoneNumber
  });

  console.log("\n[WHATSAPP] grupos encontrados:");
  const groups = await listWhatsAppGroups(sock);

  if (!groups.length) {
    console.log("Nenhum grupo encontrado nessa conta.");
  } else {
    for (const group of groups) {
      console.log(
        group.id + " | " + group.participants + " participantes | " + group.name
      );
    }
  }

  console.log("\nA sessão foi salva em data/whatsapp-auth.");
  console.log("Não apague essa pasta.");
  process.exit(0);
}

main().catch(error => {
  console.error("[WHATSAPP] falha:", error.message);
  process.exit(1);
});
