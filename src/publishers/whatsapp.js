export function createWhatsAppPublisher(sock, groupJid) {
  if (!sock || !groupJid) {
    throw new Error("WhatsApp não configurado.");
  }

  return {
    async publish(deal) {
      if (!deal?.affiliateUrl) {
        throw new Error("Oferta sem link de afiliado.");
      }

      const price = deal.price != null
        ? "💰 R$ " + Number(deal.price).toLocaleString("pt-BR", {
            minimumFractionDigits: 2
          })
        : "";

      const oldPrice = deal.oldPrice != null && Number(deal.oldPrice) > Number(deal.price || 0)
        ? "De: R$ " + Number(deal.oldPrice).toLocaleString("pt-BR", {
            minimumFractionDigits: 2
          })
        : "";

      const message = [
        "🔥",
        "",
        deal.title,
        oldPrice,
        price,
        deal.discount > 0
          ? "🏷️ " + Number(deal.discount).toFixed(0) + "% OFF"
          : "",
        "",
        "🛒 Comprar:",
        deal.affiliateUrl,
        "",
        "⚠️ Preço e estoque podem mudar."
      ].filter(Boolean).join("\n");

      await sock.sendMessage(groupJid, { text: message });
    }
  };
}
