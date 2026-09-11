# Inventário offline

## Relatório, exportações e finalização

O backend produz um único modelo consolidado a partir dos lançamentos individuais e das regras do motor. Esse mesmo modelo gera Excel, PDF e Word; nenhum formato recalcula classificações.

- `POST /api/v1/inventories/{inventoryId}/finalize`: exige bearer token, equipe, código `X-Inventory-Sync-Token` e a revisão central atual. Gera o snapshot, registra a data/hora e deixa o inventário `FINISHED`.
- `GET /api/v1/inventories/history?teamId=...`: lista finalizados da equipe autenticada.
- `GET /api/v1/inventories/{inventoryId}/report`: devolve o relatório central.
- `GET /api/v1/inventories/{inventoryId}/exports/{xlsx|pdf|docx}`: baixa `Inventario_DD-MM-AAAA.<formato>`.

Relatório e exportações exigem autenticação, autorização de equipe e código de sincronização. A finalização é irreversível na V1; não há reabertura aprovada. Rode a migration `0004_inventory_reports_finalization` com o mesmo comando Alembic antes de iniciar qualquer API publicada.

Aplicação mobile-first para registrar inventários físicos sem rede e solicitar uma análise determinística ao FastAPI quando estiver online.

## Escopo desta entrega

Inclui criação e reabertura de inventários locais, lançamentos individuais, edição, exclusão com tombstone, ordenação operacional, cache do último relatório, motor de análise e sincronização central entre dispositivos. IndexedDB permanece a fonte de verdade de toda operação local: conexão não é exigida para lançar, editar ou excluir.

O backend usa SQLAlchemy e a migração Alembic `0001_central_sync` para inventários, lançamentos, eventos incrementais e conflitos. PostgreSQL é obrigatório em produção; SQLite é apenas conveniência de desenvolvimento local.

Fase 1, Fase 2.1 de segurança e as funcionalidades estruturais da V1 estão implementadas e validadas localmente. PostgreSQL real, HTTPS/CORS do domínio publicado, deploy público e validação em dispositivos físicos permanecem pendentes antes de qualquer exposição pública. A próxima etapa é a validação publicada da infraestrutura preparada.

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

## Publicacao controlada (Fase 2.2)

A arquitetura preparada, ainda **nao provisionada**, e Vercel para o frontend Next.js, Render para a API FastAPI e Neon para PostgreSQL gerenciado. A escolha preserva Git deploy, HTTPS automatico e os componentes tecnicos existentes sem introduzir infraestrutura propria.

Use obrigatoriamente dois subdominios do mesmo dominio raiz:

```text
https://app.seu-dominio.example  -> Vercel
https://api.seu-dominio.example  -> Render
```

Essa topologia e necessaria para o refresh cookie permanecer `Secure`, `HttpOnly` e `SameSite=Strict`. URLs padrao independentes de provedores (por exemplo, `vercel.app` e `onrender.com`) nao sao uma configuracao de producao aprovada para o fluxo de sessao.

### Variaveis de producao

Configure no Render, sem versionar valores:

```text
INVENTORY_ENV=production
INVENTORY_DATABASE_URL=postgresql+psycopg://...?sslmode=require
INVENTORY_AUTH_SECRET=<segredo gerado pelo provedor ou aleatorio com pelo menos 32 caracteres>
INVENTORY_ACCESS_TOKEN_MINUTES=15
INVENTORY_REFRESH_SESSION_DAYS=14
INVENTORY_CORS_ORIGINS=https://app.seu-dominio.example
```

Configure na Vercel **antes do build de producao**:

```text
INVENTORY_ENV=production
NEXT_PUBLIC_ANALYSIS_API_BASE_URL=https://api.seu-dominio.example
NEXT_PUBLIC_SYNC_API_BASE_URL=https://api.seu-dominio.example
```

As duas variaveis `NEXT_PUBLIC_*` sao URLs publicas compiladas no bundle; nunca coloque segredos nelas. O `render.yaml` entrega uma definicao declarativa da API: instala dependencias, inicia Uvicorn em `$PORT` e usa `/healthz` como healthcheck. O primeiro provisionamento ainda pede `INVENTORY_DATABASE_URL` e `INVENTORY_CORS_ORIGINS` no painel, sem grava-las no repositorio.

### Ordem de deploy

1. Criar o projeto Neon e obter a connection string com SSL; cadastra-la apenas como `INVENTORY_DATABASE_URL` no Render.
2. Em terminal confiavel, com a connection string somente no ambiente do processo, executar `backend/.venv/Scripts/python.exe -m alembic -c backend/alembic.ini upgrade head` contra o Neon e confirmar `0004_inventory_reports_finalization (head)`.
3. Criar a Blueprint Render a partir de `render.yaml`, informar os secrets solicitados e aguardar `/healthz` retornar 200.
4. Criar o projeto Vercel apontando para a raiz do repositorio, definir as variaveis acima e publicar o build.
5. Associar `api.seu-dominio.example` ao Render e `app.seu-dominio.example` a Vercel; concluir os registros DNS e aguardar os certificados TLS automaticos.
6. Atualizar `INVENTORY_CORS_ORIGINS` no Render com a URL final da Vercel, redeployar a API e executar os smoke tests abaixo.

O plano `free` do Render e adequado apenas para o primeiro smoke test: a instancia pode hibernar apos inatividade. Nao publicar como operacao continua sem aceitar essa limitacao ou escolher um plano explicitamente autorizado.

### Smoke test publicado

Depois de os dominios responderem por HTTPS, registrar com resultado real: `GET https://api.seu-dominio.example/healthz`; cabecalhos `Strict-Transport-Security`, `X-Content-Type-Options` e `X-Frame-Options`; registro/login/refresh/logout; bloqueio de UUID de outra equipe; criacao offline e sincronizacao em dois contextos; idempotencia, tombstone, edicao, conflito e cursor incremental. Nao marcar estes itens como aprovados ate a execucao no ambiente publicado.

## Sincronização entre dispositivos

No inventário, use **Sincronizar agora** quando houver conexão. O primeiro envio cria o inventário central; reenvios são idempotentes. Em **Conectar este inventário em outro dispositivo**, o criador encontra o ID e o código de sincronização. No segundo dispositivo, informe ambos na tela inicial.

O código é uma credencial: não o publique nem o envie por canal inseguro. Quando duas alterações partem da mesma revisão, o sistema registra as duas versões e pede que o operador escolha qual manter; não aplica "última gravação vence" silenciosamente.

## Conta, equipe e acesso à sincronização

O lançamento operacional continua disponível localmente e offline, mesmo sem conta. Antes da primeira sincronização, crie uma conta e sua equipe na tela inicial. A senha é armazenada no servidor somente como hash `scrypt`; o navegador mantém o token de acesso apenas em memória e renova a sessão com cookie `HttpOnly`.

Para acessar um inventário central, a API exige três verificações: sessão de usuário válida, associação à equipe do inventário e o código de sincronização. Conhecer um UUID ou o código não dá acesso a outra equipe. Responsáveis (`ADMIN`) podem incluir membros; operadores (`OPERATOR`) podem sincronizar, mas não administram integrantes.

A configuração de produção, a ordem de migrations e os smoke tests estão na seção **Publicacao controlada (Fase 2.2)** acima. Em produção, a API recusa SQLite, segredo curto/padrão e CORS com curinga ou HTTP. Publique frontend e API atrás de HTTPS; cookies de renovação ficam `Secure` nesse ambiente.

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
