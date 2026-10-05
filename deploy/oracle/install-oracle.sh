#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/ofertabot"
SERVICE_FILE="/etc/systemd/system/ofertabot.service"

echo "[1/7] Atualizando sistema..."
sudo apt-get update
sudo apt-get install -y ca-certificates curl rsync

echo "[2/7] Instalando Node.js 22 LTS..."
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "[3/7] Criando usuário do bot..."
if ! id ofertabot >/dev/null 2>&1; then
  sudo useradd --system --create-home --home-dir "$APP_DIR" --shell /usr/sbin/nologin ofertabot
fi

echo "[4/7] Preparando diretório..."
sudo mkdir -p "$APP_DIR/data"
sudo chown -R ofertabot:ofertabot "$APP_DIR"

echo "[5/7] Dependências..."
cd "$APP_DIR"
sudo -u ofertabot npm ci --omit=dev

echo "[6/7] Serviço systemd..."
sudo install -m 644 deploy/oracle/ofertabot.service "$SERVICE_FILE"
sudo systemctl daemon-reload
sudo systemctl enable ofertabot

echo "[7/7] Início..."
sudo systemctl restart ofertabot

echo
echo "Oferta Bot instalado."
echo "Status: sudo systemctl status ofertabot --no-pager"
echo "Logs:   sudo journalctl -u ofertabot -f"
