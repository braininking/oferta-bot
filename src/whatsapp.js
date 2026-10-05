import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";

const ROOT = path.resolve(process.cwd());
const AUTH_DIR = path.join(ROOT, "data", "whatsapp-auth");

export async function connectWhatsApp({ onQr = null } = {}) {
  await fs.promises.mkdir(AUTH_DIR, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    auth: state,
    markOnlineOnConnect: false,
    syncFullHistory: false
  });

  sock.ev.on("creds.update", saveCreds);

  const connected = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Tempo limite ao conectar ao WhatsApp."));
    }, 120000);

    sock.ev.on("connection.update", async update => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        const qrPath = path.join(ROOT, "data", "whatsapp-qr.png");
        await QRCode.toFile(qrPath, qr, {
          width: 520,
          margin: 2
        });
        console.log("[WHATSAPP] QR Code salvo em:", qrPath);
        if (onQr) onQr(qr);
      }

      if (connection === "open") {
        clearTimeout(timer);
        console.log("[WHATSAPP] conectado.");
        resolve(sock);
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        clearTimeout(timer);

        if (statusCode !== DisconnectReason.loggedOut) {
          reject(new Error("Conexão WhatsApp encerrada; tente novamente."));
        } else {
          reject(new Error("Sessão WhatsApp desconectada. Será necessário parear novamente."));
        }
      }
    });
  });

  return connected;
}

export async function listWhatsAppGroups(sock) {
  const groups = await sock.groupFetchAllParticipating();
  return Object.entries(groups)
    .map(([id, group]) => ({
      id,
      name: group.subject || "",
      participants: group.participants?.length || 0
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export async function sendWhatsAppGroupMessage(sock, groupJid, message) {
  if (!/^\d+-\d+@g\.us$/.test(groupJid)) {
    throw new Error("WHATSAPP_GROUP_JID inválido.");
  }

  if (!message?.trim()) {
    throw new Error("Mensagem WhatsApp vazia.");
  }

  await sock.sendMessage(groupJid, { text: message.trim() });
}
