export function createTelegramPublisher(client, targetChannel) {
  if (!client || !targetChannel) throw new Error("Telegram não configurado.");

  return {
    async publish(deal) {
      if (!deal?.affiliateUrl) throw new Error("Oferta sem link de afiliado.");

      const priceLine = deal.price != null
        ? "💰 R$ " + Number(deal.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })
        : "";

      const oldPriceLine = deal.oldPrice != null && Number(deal.oldPrice) > Number(deal.price || 0)
        ? "De: R$ " + Number(deal.oldPrice).toLocaleString("pt-BR", { minimumFractionDigits: 2 })
        : "";

      const message = [
        "🔥 OFERTA ENCONTRADA",
        "",
        deal.title,
        oldPriceLine,
        priceLine,
        deal.discount > 0 ? "🏷️ " + Number(deal.discount).toFixed(0) + "% OFF" : "",
        "",
        "🛒 Comprar:",
        deal.affiliateUrl,
        "",
        "⚠️ Oferta válida enquanto durarem os estoques. Preço, estoque e condições podem mudar."
      ].filter(Boolean).join("\n");

      await client.sendMessage(targetChannel, { message });
    }
  };
}
