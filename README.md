# Oferta Bot

Bot criado do zero para garimpar ofertas, transformar links em links de afiliado e publicar no Telegram.

## Funcionamento

- Busca automaticamente a cada 10 minutos.
- Lê a lista atual de ofertas do Promobit pelo conteúdo público da página.
- Usa o ID da oferta para chegar ao destino real da loja.
- Segue links intermediários como meli.la até o domínio final.
- Aceita somente Amazon, KaBuM, Magalu, Shopee e Mercado Livre.
- Amazon usa a tag `ofertaradar03-20`.
- Outras lojas só são publicadas quando o respectivo template de afiliado estiver configurado.
- O histórico persistente fica em `data/history.json`.
- O mesmo produto não volta a ser publicado quando o Promobit criar outra oferta para ele.
- Uma falha de envio não grava o item como publicado, permitindo tentar novamente.
- O Telegram não imprime a sessão secreta no console.

## Configuração

1. Preencha o `.env`.
2. Rode `npm install`.
3. Rode `npm start`.

Nunca publique `.env` ou `data/history.json` no Git.
