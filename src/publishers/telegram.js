export function createTelegramPublisher(client, targetChannel) {
  if (!client || !targetChannel) throw new Error("Telegram não configurado.");

  return {
    async publish(deal) {
      if (!deal?.affiliateUrl) throw new Error("Oferta sem link de afiliado.");

      const priceLine = deal.price != null
        ? "💰 R$ " + Number(deal.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })
        : "";

      const message = [
        "🔥 OFERTA ENCONTRADA",
        "",
        deal.title,
        priceLine,
        deal.discount > 0 ? "🏷️ " + Number(deal.discount).toFixed(0) + "% OFF" : "",
        "",
        "🛒 Comprar:",
        deal.affiliateUrl
      ].filter(Boolean).join("\n");

      await client.sendMessage(targetChannel, { message });
    }
  };
}
