import cron from "node-cron";
import { config } from "./config.js";
import { loadHistory } from "./core/history.js";
import { scanForNewDeals, finalizeDeal } from "./sources/scanner.js";
import { startTelegram } from "./telegram.js";

let publisher = null;

async function runScan() {
  console.log("\n[SCAN]", new Date().toISOString());

  const deals = await scanForNewDeals();
  console.log("[SCAN] novas ofertas elegíveis:", deals.length);

  if (!publisher) {
    console.log("[SCAN] Telegram não disponível; nenhuma oferta será marcada como publicada.");
    return;
  }

  for (const deal of deals) {
    try {
      await publisher.publish(deal);
      await finalizeDeal(deal);
      console.log("[PUBLICADO]", deal.store, deal.title);
    } catch (error) {
      console.error("[PUBLICAÇÃO] falhou:", error.message);
    }
  }
}

async function main() {
  await loadHistory();

  const telegram = await startTelegram();
  publisher = telegram?.publisher || null;

  await runScan();

  cron.schedule(config.scanCron, () => {
    runScan().catch(error => console.error("[SCAN] erro fatal:", error));
  });

  console.log("[BOT] ativo. Cron:", config.scanCron);
}

main().catch(error => {
  console.error("[BOT] falha:", error);
  process.exit(1);
});
