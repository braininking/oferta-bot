import { loadHistory } from "./core/history.js";
import { scanForNewDeals, finalizeDeal } from "./sources/scanner.js";
import { startTelegram } from "./telegram.js";

async function main() {
  await loadHistory();

  let telegram = null;

  try {
    telegram = await startTelegram();

    if (!telegram?.publisher) {
      throw new Error("Telegram não configurado. Verifique os GitHub Secrets.");
    }

    console.log("\n[RUN-ONCE]", new Date().toISOString());

    const deals = await scanForNewDeals();
    console.log("[RUN-ONCE] novas ofertas elegíveis:", deals.length);

    for (const deal of deals) {
      try {
        await telegram.publisher.publish(deal);
        await finalizeDeal(deal);
        console.log("[PUBLICADO]", deal.store, deal.title);
      } catch (error) {
        console.error("[PUBLICAÇÃO] falhou:", error.message);
        throw error;
      }
    }
  } finally {
    if (telegram?.client) {
      try {
        await telegram.client.disconnect();
        console.log("[TELEGRAM] desconectado.");
      } catch (error) {
        console.error("[TELEGRAM] erro ao desconectar:", error.message);
      }
    }
  }
}

main().catch(error => {
  console.error("[RUN-ONCE] falha:", error);
  process.exit(1);
});
