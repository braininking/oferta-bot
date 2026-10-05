# Oferta Bot — Oracle Cloud

## Objetivo

Executar o bot 24/7 em uma VM Linux da Oracle Cloud Always Free.

## Instância recomendada

- VM.Standard.A1.Flex (Ampere ARM)
- 2 OCPUs
- 12 GB RAM
- Ubuntu Linux ou Oracle Linux
- IP público
- SSH habilitado

O bot não precisa de nenhuma porta de entrada além do SSH para administração. Telegram e as consultas HTTP usam conexões de saída.

## Transferência

Copie todo o projeto para:

/opt/ofertabot

Não copie node_modules. No servidor, o script executa npm ci --omit=dev.

Copie o .env separadamente e mantenha-o somente no servidor.

## Instalação

A partir de /opt/ofertabot:

chmod +x deploy/oracle/install-oracle.sh
sudo bash deploy/oracle/install-oracle.sh

## Verificação

sudo systemctl status ofertabot --no-pager
sudo journalctl -u ofertabot -n 100 --no-pager
sudo journalctl -u ofertabot -f

## Observação

A VM Always Free precisa permanecer ativa e em uso. A Oracle informa que instâncias Always Free consideradas ociosas por 7 dias podem ser recuperadas.
