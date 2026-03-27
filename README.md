# MA Beard Style SaaS

Sistema de gestao para barbearia com landing page, assinaturas, agenda, dashboard administrativo e integracao com Supabase, Stripe e Google Calendar.

## Stack

- Frontend: React + Vite
- Backend: Express
- Banco principal: Supabase
- Deploy principal: Fly.io via Docker

## Rodando localmente

Pre-requisitos:

- Node.js 22+

Passos:

1. Instale as dependencias com `npm install`
2. Configure as variaveis de ambiente com base em [.env.example](.env.example)
3. Rode o servidor de desenvolvimento com `npm run dev`

O app sobe com backend Express e frontend Vite servidos pelo mesmo processo.

## Build e producao

- Gerar frontend: `npm run build`
- Subir servidor: `npm run start`

Em producao, o Express serve os arquivos de `dist/` e faz fallback SPA para rotas como `/`, `/booking` e `/admin`.

## Variaveis principais

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `STRIPE_SECRET_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `APP_URL`

## Observacoes

- As migracoes SQL ficam em `supabase/migrations/`
- O diagnostico de schema fica em `supabase/diagnostics/`
- O projeto nao usa mais SQLite local
