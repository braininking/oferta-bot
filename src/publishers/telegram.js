import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import axios from 'axios';
import sharp from 'sharp';

export function createTelegramPublisher(client, targetChannel) {
  if (!client || !targetChannel) throw new Error("Telegram não configurado.");

  return {
    async publish(deal) {
      if (!deal?.affiliateUrl) throw new Error("Oferta sem link de afiliado.");
      if (!deal.imageUrl) throw new Error("Oferta sem imagem. Publicação bloqueada para evitar post sem foto.");

      const priceLine = deal.price != null
        ? "💰 R$ " + Number(deal.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })
        : "";
      const oldPriceLine = deal.oldPrice != null && Number(deal.oldPrice) > Number(deal.price || 0)
        ? "De: R$ " + Number(deal.oldPrice).toLocaleString("pt-BR", { minimumFractionDigits: 2 })
        : "";

      const message = [
        "🔥", "", deal.title, oldPriceLine, priceLine,
        deal.discount > 0 ? "🏷️ " + Number(deal.discount).toFixed(0) + "% OFF" : "",
        "", "🛒 Comprar:", deal.affiliateUrl, "",
        "⚠️ Oferta válida enquanto durarem os estoques. Preço, estoque e condições podem mudar."
      ].filter(Boolean).join("\n");

      let imagePath = null;
      try {
        imagePath = await downloadImageToTemp(deal.imageUrl);
        let lastError = null;

        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            await client.sendFile(targetChannel, {
              file: imagePath,
              caption: message,
              forceDocument: false
            });
            console.log("[TELEGRAM] oferta publicada com imagem local.");
            return;
          } catch (error) {
            lastError = error;
            console.warn("[TELEGRAM] tentativa", attempt, "falhou:", error.message);
            if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          }
        }

        throw new Error("Falha ao publicar imagem no Telegram: " + (lastError?.message || "erro desconhecido"));
      } finally {
        if (imagePath) await fs.rm(imagePath, { force: true }).catch(() => {});
      }
    }
  };
}

function withTimeout(promise, milliseconds, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + " excedeu " + milliseconds + "ms")), milliseconds))
  ]);
}

async function downloadImageToTemp(url) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 12000,
    maxContentLength: 8 * 1024 * 1024,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36",
      "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "Referer": "https://www.promobit.com.br/"
    }
  });

  const contentType = String(response.headers["content-type"] || "").toLowerCase();
  const buffer = Buffer.from(response.data);

  if (!contentType.startsWith("image/") || buffer.length < 100) {
    throw new Error("A URL da oferta não retornou uma imagem válida.");
  }

  // O GramJS só identifica .jpg/.jpeg/.png como foto. Muitas imagens do Promobit chegam em WebP/AVIF;
  // convertemos tudo para JPEG para garantir que o Telegram publique como FOTO (e mantenha a legenda).
  const filePath = path.join(
    os.tmpdir(),
    "oferta-bot-" + Date.now() + "-" + Math.random().toString(16).slice(2) + ".jpg"
  );

  await sharp(buffer)
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(filePath);

  return filePath;
}
