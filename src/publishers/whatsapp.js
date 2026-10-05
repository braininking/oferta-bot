export function createWhatsAppPublisher() {
  return {
    async publish() {
      throw new Error(
        "Publisher WhatsApp ainda não configurado: o projeto precisa de um provedor oficial/compatível para envio a grupos."
      );
    }
  };
}
