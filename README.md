# Inventário offline

Aplicação mobile-first para registrar inventários físicos sem rede e solicitar uma análise determinística ao FastAPI quando estiver online.

## Escopo desta entrega

Inclui criação e reabertura de inventários locais, lançamentos individuais, edição, exclusão com tombstone, ordenação operacional, cache do último relatório e o motor de análise. Sincronização, PostgreSQL, exportações, finalização, histórico completo e publicação não foram implementados.

## Requisitos

- Node.js 20+ e pnpm
- Python 3.12+

## Executar localmente

```powershell
pnpm install --frozen-lockfile
pnpm dev

python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
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
- `backend/app/main.py`: contrato FastAPI que valida e delega ao motor.

Consulte [regras de negócio](docs/REGRAS_NEGOCIO.md) e [status](docs/STATUS.md).
