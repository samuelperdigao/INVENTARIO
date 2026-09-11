# Inventário offline

Aplicação mobile-first para registrar inventários físicos sem rede e solicitar uma análise determinística ao FastAPI quando estiver online.

## Escopo desta entrega

Inclui criação e reabertura de inventários locais, lançamentos individuais, edição, exclusão com tombstone, ordenação operacional, cache do último relatório, motor de análise e sincronização central entre dispositivos. IndexedDB permanece a fonte de verdade de toda operação local: conexão não é exigida para lançar, editar ou excluir.

O backend usa SQLAlchemy e a migração Alembic `0001_central_sync` para inventários, lançamentos, eventos incrementais e conflitos. PostgreSQL é obrigatório em produção; SQLite é apenas conveniência de desenvolvimento local.

Fase 1 e a Fase 2.1 de segurança estão implementadas e validadas localmente. PostgreSQL real, HTTPS/CORS do domínio publicado, deploy público e validação em dispositivos físicos permanecem pendentes antes de qualquer exposição pública. A próxima etapa é a Fase 2.2 — infraestrutura real de produção. Exportações, finalização e histórico completo ainda não foram implementados.

## Requisitos

- Node.js 20+ e pnpm
- Python 3.12+

## Executar localmente

```powershell
pnpm install --frozen-lockfile
pnpm dev

python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
backend/.venv/Scripts/python.exe -m alembic -c backend/alembic.ini upgrade head
backend/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir backend --reload --port 8000
```

Abra `http://localhost:3000`. O frontend inicia nessa porta e o FastAPI responde em `http://localhost:8000`. Nenhum arquivo `.env.local` é exigido para esse fluxo: o frontend usa `http://localhost:8000` como padrão. Crie-o a partir de `.env.example` somente para apontar a análise a outro endereço.

`pnpm dev` atende ao desenvolvimento local. O service worker é propositalmente registrado apenas no build de produção, para que o cache offline não interfira com HMR. Para validar a PWA localmente:

```powershell
pnpm build
pnpm start
```

## Gates

```powershell
pnpm lint
pnpm typecheck
pnpm test
backend/.venv/Scripts/python.exe -m pytest backend/tests
pnpm build
pnpm e2e
```

## Sincronização entre dispositivos

No inventário, use **Sincronizar agora** quando houver conexão. O primeiro envio cria o inventário central; reenvios são idempotentes. Em **Conectar este inventário em outro dispositivo**, o criador encontra o ID e o código de sincronização. No segundo dispositivo, informe ambos na tela inicial.

O código é uma credencial: não o publique nem o envie por canal inseguro. Quando duas alterações partem da mesma revisão, o sistema registra as duas versões e pede que o operador escolha qual manter; não aplica "última gravação vence" silenciosamente.

## Conta, equipe e acesso à sincronização

O lançamento operacional continua disponível localmente e offline, mesmo sem conta. Antes da primeira sincronização, crie uma conta e sua equipe na tela inicial. A senha é armazenada no servidor somente como hash `scrypt`; o navegador mantém o token de acesso apenas em memória e renova a sessão com cookie `HttpOnly`.

Para acessar um inventário central, a API exige três verificações: sessão de usuário válida, associação à equipe do inventário e o código de sincronização. Conhecer um UUID ou o código não dá acesso a outra equipe. Responsáveis (`ADMIN`) podem incluir membros; operadores (`OPERATOR`) podem sincronizar, mas não administram integrantes.

Para produção, defina no ambiente:

```text
INVENTORY_DATABASE_URL=postgresql+psycopg://usuario:senha@host:5432/inventario
INVENTORY_ENV=production
INVENTORY_AUTH_SECRET=segredo-aleatorio-unico-com-pelo-menos-32-caracteres
INVENTORY_ACCESS_TOKEN_MINUTES=15
INVENTORY_REFRESH_SESSION_DAYS=14
INVENTORY_CORS_ORIGINS=https://inventario.exemplo.com
NEXT_PUBLIC_ANALYSIS_API_BASE_URL=https://api.inventario.exemplo.com
NEXT_PUBLIC_SYNC_API_BASE_URL=https://api.inventario.exemplo.com
```

Execute `backend/.venv/Scripts/python.exe -m alembic -c backend/alembic.ini upgrade head` contra o PostgreSQL antes de iniciar a API. Em produção, a API recusa SQLite, segredo curto/padrão e CORS com curinga ou HTTP. Publique frontend e API atrás de HTTPS; cookies de renovação ficam `Secure` nesse ambiente. As variáveis `NEXT_PUBLIC_*` são URLs públicas compiladas no build e não devem carregar segredo.

Inventários criados antes da migration de equipes são preservados, porém ficam sem `team_id` e bloqueados no backend até associação administrativa explícita. Não associe inventários por alteração manual em produção: defina e execute um backfill auditável antes de liberar acesso.

O teste de recarga offline precisa de um build/servidor e do navegador Chromium instalado:

```powershell
pnpm build
pnpm start
pnpm exec playwright install chromium
pnpm e2e
```

## Arquitetura

- `app/`, `components/`, `lib/`: shell Next.js, interface e dados locais Dexie/IndexedDB.
- `app/sw.ts`: service worker Serwist que pré-cacheia o shell para recarga offline. O Next é executado com webpack porque esta integração Serwist ainda não suporta Turbopack; a integração é aplicada somente em produção.
- `backend/app/engine.py`: regras puras de análise, sem HTTP ou persistência.
- `backend/app/main.py`: contrato FastAPI que valida, analisa e sincroniza.
- `backend/app/database.py`, `persistence.py`, `sync_service.py`: PostgreSQL/SQLite local, entidades centrais, cursores, idempotência e conflitos.

Consulte [regras de negócio](docs/REGRAS_NEGOCIO.md) e [status](docs/STATUS.md).
