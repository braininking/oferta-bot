import axios from "axios";

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

      if (!deal.imageUrl) {
        throw new Error("Oferta sem imagem. Publicação bloqueada para evitar post sem foto.");
      }

      const image = await downloadImage(deal.imageUrl);

      try {
        await client.sendFile(targetChannel, {
          file: image.buffer,
          caption: message,
          forceDocument: false
        });

        console.log("[TELEGRAM] oferta publicada com imagem.");
      } catch (firstError) {
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
            " | primeira tentativa: " +
            firstError.message
          );
        }
      }
    }
  };
}

async function downloadImage(url) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 15000,
    maxContentLength: 10 * 1024 * 1024,
    headers: {
      "User-Agent": "OfertaBot/0.3 (+deal-monitor)",
      "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
    }
  });

  const contentType = String(response.headers["content-type"] || "").toLowerCase();

  if (!contentType.startsWith("image/")) {
    throw new Error("A URL da imagem retornou conteúdo não-imagem: " + contentType);
  }

  const buffer = Buffer.from(response.data);

  if (buffer.length < 100) {
    throw new Error("Imagem vazia ou inválida.");
  }

  return {
    buffer,
    contentType
  };
}
