const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const ROOT = "C:\\OfertaBot";
const AUTH_DIR = path.join(ROOT, "data", "whatsapp-webjs-auth");
const QR_FILE = path.join(ROOT, "data", "whatsapp-webjs-qr.png");
const GROUP_NAME = process.env.WHATSAPP_GROUP_NAME || "RADAR DE OFERTAS";

let clientPromise = null;
let clientRef = null;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createClient() {
  const client = new Client({
    authStrategy: new LocalAuth({
      dataPath: AUTH_DIR
    }),
    puppeteer: {
      headless: false,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage"
      ]
    },
    takeoverOnConflict: false,
    qrMaxRetries: 0,
    deviceName: "Oferta Bot",
    browserName: "Chrome"
  });

  client.on("qr", async qr => {
    try {
      await QRCode.toFile(QR_FILE, qr, {
        width: 520,
        margin: 2
      });

      console.log("[WHATSAPP-DIRECT] QR salvo em:", QR_FILE);
      exec('start "" "' + QR_FILE + '"');
    } catch (error) {
      console.error("[WHATSAPP-DIRECT] erro ao salvar QR:", error.message);
    }
  });

  client.on("authenticated", () => {
    console.log("[WHATSAPP-DIRECT] autenticado.");
  });

  client.on("ready", () => {
    console.log("[WHATSAPP-DIRECT] READY.");
  });

  client.on("auth_failure", error => {
    console.error("[WHATSAPP-DIRECT] AUTH_FAILURE:", error);
    clientPromise = null;
  });

  client.on("disconnected", reason => {
    console.warn("[WHATSAPP-DIRECT] desconectado:", reason);
    clientPromise = null;
  });

  clientRef = client;

  return new Promise((resolve, reject) => {
    client.once("ready", () => resolve(client));

    client.initialize().catch(error => {
      clientPromise = null;
      reject(error);
    });
  });
}

async function getClient() {
  if (!clientPromise) {
    clientPromise = createClient().catch(error => {
      clientPromise = null;
      throw error;
    });
  }

  return clientPromise;
}

async function findGroup(client) {
  const deadline = Date.now() + 30000;
  const wanted = String(GROUP_NAME).trim().toLowerCase();

  while (Date.now() < deadline) {
    const result = await client.pupPage.evaluate(wantedName => {
      const collection = window.require("WAWebCollections").Chat;
      const chats = collection.getModelsArray();

      for (const chat of chats) {
        const isGroup = Boolean(chat?.groupMetadata);
        const id = chat?.id?._serialized || null;
        const name = String(chat?.formattedTitle || chat?.name || "").trim();

        if (
          isGroup &&
          id &&
          name.toLowerCase() === String(wantedName).toLowerCase()
        ) {
          return {
            id,
            name
          };
        }
      }

      return null;
    }, wanted);

    if (result?.id) {
      console.log("[WHATSAPP-DIRECT] grupo encontrado:", result.name, result.id);
      return {
        id: {
          _serialized: result.id
        },
        name: result.name,
        isGroup: true
      };
    }

    await sleep(1000);
  }

  throw new Error("Grupo não encontrado: " + GROUP_NAME);
}

async function getGroup(client) {
  return findGroup(client);
}

function validateImage(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error("Imagem não encontrada: " + filePath);
  }

  const stat = fs.statSync(filePath);

  if (!stat.isFile() || stat.size < 1000) {
    throw new Error("Imagem inválida ou vazia: " + filePath);
  }
}

async function sendImageDirect(filePath, caption) {
  validateImage(filePath);

  const client = await getClient();
  const group = await getGroup(client);
  const media = MessageMedia.fromFilePath(filePath);

  if (!String(media.mimetype || "").startsWith("image/")) {
    throw new Error("A mídia preparada não é uma imagem.");
  }

  const sentModel = await client.pupPage.evaluate(
    async ({ chatId, mediaInfo, captionText }) => {
      const chat = window
        .require("WAWebCollections")
        .Chat.get(
          window.require("WAWebWidFactory").createWid(chatId)
        );

      if (!chat) {
        throw new Error("WhatsApp não carregou o grupo: " + chatId);
      }

      const msg = await window.WWebJS.sendMessage(
        chat,
        "",
        {
          media: mediaInfo,
          caption: captionText,
          sendMediaAsHd: true,
          waitUntilMsgSent: true,
          linkPreview: false
        }
      );

      return msg ? window.WWebJS.getMessageModel(msg) : null;
    },
    {
      chatId: group.id._serialized,
      mediaInfo: {
        mimetype: media.mimetype,
        data: media.data,
        filename: media.filename,
        filesize: media.filesize
      },
      captionText: String(caption || "").trim()
    }
  );

  const { Message } = require("whatsapp-web.js");
  const sent = sentModel ? new Message(client, sentModel) : null;

  if (!sent) {
    throw new Error("WhatsApp não retornou a mensagem após o envio.");
  }

  // Nesta versão do WhatsApp Web, a serialização de MessageMedia pode
  // não preencher a propriedade calculada hasMedia do objeto externo.
  // O próprio envio acima retornou um Msg real; a confirmação de mídia
  // é feita pelo type/mediaData no runtime do WhatsApp.
  sent.hasMedia = Boolean(
    sentModel?.type === "image" ||
    sentModel?.mimetype?.startsWith("image/") ||
    sentModel?.mediaData ||
    sentModel?.mediaObject
  );

  if (!sent.hasMedia) {
    throw new Error("WhatsApp retornou uma mensagem sem imagem.");
  }

  console.log(
    "[WHATSAPP-DIRECT] publicação direta confirmada:",
    sentModel?.id?.id || "OK"
  );

  return sent;
}

async function verifyMessageMedia(message) {
  if (!message?.hasMedia) {
    throw new Error("A mensagem não possui mídia.");
  }

  const media = await message.downloadMedia();

  if (!media?.data) {
    throw new Error("A mídia da mensagem não pôde ser recuperada do WhatsApp.");
  }

  const bytes = Buffer.from(media.data, "base64");

  if (bytes.length < 1000) {
    throw new Error("A mídia recuperada do WhatsApp está vazia ou inválida.");
  }

  return {
    mimetype: media.mimetype || null,
    filename: media.filename || null,
    bytes: bytes.length
  };
}

async function verifyLastMedia(textPart) {
  const client = await getClient();
  const group = await getGroup(client);

  const result = await client.pupPage.evaluate(
    ({ chatId, wantedText }) => {
      const chat = window
        .require("WAWebCollections")
        .Chat.get(
          window.require("WAWebWidFactory").createWid(chatId)
        );

      if (!chat) {
        return null;
      }

      const messages = chat.msgs
        .getModelsArray()
        .filter(message => message?.id?.fromMe)
        .filter(message => !wantedText || String(message.body || "").includes(wantedText))
        .sort((a, b) => (a.t || 0) - (b.t || 0));

      const last = messages[messages.length - 1];

      if (!last) {
        return null;
      }

      return {
        id: last.id?._serialized || null,
        body: last.body || "",
        type: last.type || null,
        hasMedia: Boolean(last.mediaData || last.mediaObject || last.isMedia)
      };
    },
    {
      chatId: group.id._serialized,
      wantedText: String(textPart || "")
    }
  );

  if (!result) {
    return null;
  }

  const message = await client.pupPage.evaluate(
    ({ messageId }) => {
      const msg =
        window.require("WAWebCollections").Msg.get(messageId) ||
        null;

      return msg ? window.WWebJS.getMessageModel(msg) : null;
    },
    { messageId: result.id }
  );

  if (!message) {
    return null;
  }

  return {
    ...message,
    _directVerification: result
  };
}

async function closeClient() {
  if (!clientRef) return;

  try {
    await clientRef.destroy();
  } catch {}

  clientRef = null;
  clientPromise = null;
}

module.exports = {
  sendImageDirect,
  verifyMessageMedia,
  verifyLastMedia,
  getClient,
  getGroup,
  closeClient,
  GROUP_NAME,
  QR_FILE
};
