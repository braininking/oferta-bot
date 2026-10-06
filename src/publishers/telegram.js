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
        "🔥",
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

      if (!deal.imageUrl) {
        throw new Error("Oferta sem imagem. Publicação bloqueada para evitar post sem foto.");
      }

      try {
        await client.sendFile(targetChannel, {
          file: deal.imageUrl,
          caption: message,
          forceDocument: false
        });

        console.log("[TELEGRAM] oferta publicada com imagem.");
      } catch (firstError) {
        await new Promise(resolve => setTimeout(resolve, 1000));

        try {
          await client.sendFile(targetChannel, {
            file: deal.imageUrl,
            caption: message,
            forceDocument: false
          });

          console.log("[TELEGRAM] oferta publicada com imagem (segunda tentativa).");
        } catch (secondError) {
          throw new Error(
            "Falha ao publicar imagem no Telegram: " +
            secondError.message +
            " | segunda tentativa: " +
            secondError.message
          );
        }
      }
    }
  };
}
