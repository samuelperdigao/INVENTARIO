# Handoff

## Estado atual

A Fase 1 está concluída: inventário local offline e análise determinística estão funcionais. O repositório tem o checkpoint Git desta fase; não existe Fase 2 implementada.

## Arquitetura implementada

- Next.js 16/TypeScript na raiz, com componentes mobile-first.
- Dexie sobre IndexedDB como fonte de verdade local.
- Serwist gera o shell offline apenas em build de produção.
- FastAPI em `backend/`, sem banco ou persistência remota.
- Motor Python em `backend/app/engine.py`, separado do contrato HTTP.

## Principais arquivos e módulos

- `app/page.tsx` e `app/inventarios/[inventoryId]/page.tsx`: rotas.
- `components/inventory-home.tsx`, `inventory-screen.tsx`, `entry-form.tsx`, `entry-list.tsx`, `analysis-panel.tsx`: fluxo operacional.
- `lib/models.ts`, `db.ts`, `inventory-repository.ts`, `grouping.ts`, `analysis-client.ts`: modelo, IndexedDB, ordenação e API.
- `app/sw.ts` e `next.config.mjs`: PWA/Serwist e configuração Next.
- `backend/app/schemas.py`, `main.py`, `engine.py`: contrato, HTTP e regras puras.
- `tests/` e `e2e/`: testes unitários e fluxo de navegador.

## Funcionalidades concluídas

- Inventários locais com data automática e sufixo visual por dia.
- Lançamentos individuais, edição, exclusão confirmada com tombstone, agrupamento EF/DE/vão e ordenação natural.
- Persistência IndexedDB e lançamento sem rede.
- Análise online, cache por revisão e leitura de cache possivelmente desatualizado quando offline.

## Motor de análise

- Local único: `OK`.
- Mais de um local: marcador `FRAGMENTADO`.
- Maior concentração única e pelo menos 3× os demais: local principal confiável.
- Divergência 1: `PEÇA_SOLTEIRA`; maior: `GRUPO_DESLOCADO`.
- Empates e distribuições sem confiança: `DISTRIBUIÇÃO_AMBÍGUA`.

## Persistência offline

`Inventory` e `InventoryEntry` usam UUIDv7, timestamps, revisão, `syncStatus` e tombstone. Inclusão, edição e exclusão usam transação Dexie. A API não participa do lançamento e não persiste payloads.

## Testes existentes

- Vitest: 8 testes para formulário, erro de armazenamento, IndexedDB, cache, agrupamento, edição e exclusão.
- Pytest: 8 testes para contrato HTTP e regras `OK`, `19 + 1`, `15 + 5`, `15 + 2 + 3`, empate, `11 + 9` e consolidação.
- Playwright: 2 fluxos para recarga offline do shell e análise online/cache offline.

## Comandos importantes

```powershell
pnpm install --frozen-lockfile
pnpm dev
backend/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir backend --reload --port 8000
pnpm lint
pnpm typecheck
pnpm test
backend/.venv/Scripts/python.exe -m pytest backend/tests
pnpm build
pnpm e2e
```

## Como executar o projeto

O frontend de desenvolvimento fica em `http://localhost:3000`. Para solicitar análise nova, execute também o FastAPI em `http://localhost:8000`. Não há variável obrigatória: `NEXT_PUBLIC_ANALYSIS_API_BASE_URL` usa esse endereço por padrão. Para PWA/offline, use `pnpm build` e `pnpm start`.

## Decisões técnicas importantes

- Não criar PostgreSQL, sincronização ou exportações na Fase 1.
- Serwist é envolvido somente com `NODE_ENV=production`; desenvolvimento não registra service worker para não interferir no HMR.
- `allowedDevOrigins` permite `127.0.0.1`, usado pelos testes de navegador em desenvolvimento.
- PostgreSQL permanece a escolha para o módulo central futuro, mas não é dependência atual.

## Problemas conhecidos

Não há bloqueador da Fase 1. Persistem apenas dois avisos de depreciação de dependências ao usar `pytest`. A automação interna do Codex não é evidência de suporte IndexedDB móvel; Chromium local passou.

## Pendências

- Teste em Android físico.
- Teste Safari/iPhone físico e PWA iOS real.
- Validação operacional em ambiente real.
- Todas as capacidades planejadas para Fase 2 em diante.

## Próxima tarefa exata

Próxima fase:
Implementar backend central, banco de dados e sincronização confiável entre IndexedDB e servidor, preservando funcionamento offline e preparando uso em múltiplos dispositivos.

Ainda não executar essa tarefa.

## Arquivos que a próxima conversa deve ler

1. `AGENTS.md`
2. `docs/ESPECIFICACAO_INVENTARIO_V1.md`
3. `docs/STATUS.md`
4. `docs/REGRAS_NEGOCIO.md`
5. `docs/HANDOFF.md`
6. `README.md`
