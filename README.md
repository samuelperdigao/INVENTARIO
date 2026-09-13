# INVENTÁRIO

Aplicação mobile-first para coleta, sincronização, análise e fechamento de inventários físicos da Laminação de Perfis. A operação de campo permanece funcional sem rede; a API centraliza colaboração, histórico e relatórios oficiais.

## Estado atual

- Frontend publicado: [inventario-lpe.vercel.app](https://inventario-lpe.vercel.app)
- Backend publicado: [inventory-api-6o8h.onrender.com](https://inventory-api-6o8h.onrender.com)
- Banco de produção: PostgreSQL no Neon
- Migration atual: `0007_recovery_pin`
- Baseline estável: branch `main`
- Pendências conhecidas: validação em Android e Safari/iPhone físicos

O estado operacional mais recente fica em [`docs/STATUS.md`](docs/STATUS.md).

## Funcionalidades

- Cadastro, login, renovação de sessão e recuperação por NP pessoal de oito dígitos.
- Inventário individual sem equipe obrigatória e colaboração opcional por código de seis dígitos.
- Registro local de lado, vão, camada, lote numérico e quantidade.
- IndexedDB como fonte primária da operação offline.
- Detecção de lotes repetidos com confirmação explícita e identificação do autor.
- Sincronização incremental com cursor, revisões, idempotência, tombstones e resolução de conflitos.
- Análise determinística de lotes fragmentados e peças deslocadas.
- Finalização irreversível na V1, histórico e exportações Excel, PDF e Word.
- Compartilhamento nativo no celular e links temporários assinados para arquivos de escritório.

## Arquitetura

| Área | Tecnologia | Responsabilidade |
|---|---|---|
| Frontend | Next.js 16, React 19, TypeScript | Interface, PWA e coordenação dos fluxos |
| Persistência local | Dexie e IndexedDB | Operação offline e fila de sincronização |
| Backend | FastAPI, Python 3.12 | Autenticação, autorização, sincronização, análise e relatórios |
| Persistência central | SQLAlchemy e PostgreSQL | Estado compartilhado, histórico e auditoria de conflitos |
| Schema | Alembic | Evolução versionada do banco |
| Testes | Vitest, Pytest e Playwright | Unidade, integração e fluxos de navegador |
| Produção | Vercel, Render e Neon | Frontend, API e banco gerenciado |

Detalhes e limites de responsabilidade estão em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## Estrutura do repositório

```text
app/                    rotas e shell do Next.js
components/             componentes de interface
lib/                    clientes HTTP, IndexedDB, modelos e regras locais
tests/                  testes Vitest
e2e/                    cenários Playwright
backend/app/            API, serviços, persistência e motor de análise
backend/alembic/        configuração e migrations
backend/tests/          testes Pytest
docs/                   arquitetura, negócio, deploy e status
.github/workflows/      quality gates e smoke de produção
```

## Requisitos

- Node.js 20+
- pnpm 10, fixado no `package.json`
- Python 3.12+
- Chromium do Playwright para os testes E2E

## Instalação

### Frontend

```bash
corepack enable
pnpm install --frozen-lockfile
```

### Backend no Linux ou macOS

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
```

### Backend no Windows PowerShell

```powershell
py -3.12 -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
```

## Configuração local

O projeto funciona com os valores de desenvolvimento já definidos no código. Para personalizar o ambiente:

```bash
cp .env.example .env.local
```

Variáveis públicas do frontend podem aparecer no bundle e nunca devem conter segredos. Variáveis `INVENTORY_*` sensíveis pertencem somente ao processo da API ou aos provedores.

## Executar localmente

Terminal 1:

```bash
pnpm dev
```

Terminal 2 no Linux ou macOS:

```bash
backend/.venv/bin/python -m alembic -c backend/alembic.ini upgrade head
backend/.venv/bin/python -m uvicorn app.main:app --app-dir backend --reload --port 8000
```

No Windows, substitua `backend/.venv/bin/python` por `backend/.venv/Scripts/python.exe`.

- Aplicação: `http://localhost:3000`
- API: `http://localhost:8000`
- Documentação OpenAPI: `http://localhost:8000/docs`

## Migrations

Toda alteração de schema deve gerar uma nova migration. Não edite migrations já aplicadas em produção.

```bash
backend/.venv/bin/python -m alembic -c backend/alembic.ini current
backend/.venv/bin/python -m alembic -c backend/alembic.ini upgrade head
```

Em produção, execute `upgrade head` de forma manual e auditável antes de liberar uma versão que dependa do novo schema. Consulte [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Quality gates

```bash
pnpm lint
pnpm typecheck
pnpm test
backend/.venv/bin/python -m pytest backend/tests -q
pnpm build
pnpm exec playwright install chromium
pnpm e2e
```

O workflow `Quality Gates` executa os mesmos grupos em Pull Requests e na `main`. O workflow `Production Smoke` verifica as superfícies publicadas após mudanças na `main`.

## Fontes de verdade

- [`docs/REGRAS_NEGOCIO.md`](docs/REGRAS_NEGOCIO.md): comportamento funcional vigente.
- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md): decisões técnicas e fronteiras do sistema.
- [`docs/DEPLOY.md`](docs/DEPLOY.md): configuração e publicação.
- [`docs/STATUS.md`](docs/STATUS.md): estado atual, gates e pendências.
- [`docs/ESPECIFICACAO_INVENTARIO_V1.md`](docs/ESPECIFICACAO_INVENTARIO_V1.md): especificação histórica detalhada.
- [`docs/CAMADAS_DUPLICIDADE_V2.md`](docs/CAMADAS_DUPLICIDADE_V2.md): registro de decisão da evolução de camadas e duplicidade.
