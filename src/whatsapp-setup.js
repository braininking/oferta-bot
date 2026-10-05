import { connectWhatsApp, listWhatsAppGroups } from "./whatsapp.js";

async function main() {
  console.log("\n=== CONFIGURAÇÃO DO WHATSAPP ===");
  console.log("A primeira execução exibirá um QR Code no terminal.");
  console.log("No telefone: WhatsApp > Configurações > Aparelhos conectados > Conectar aparelho.");

  const sock = await connectWhatsApp();

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
