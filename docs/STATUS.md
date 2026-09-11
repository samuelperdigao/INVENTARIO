# Status do Projeto

## Fase atual

Fase 2 — backend central, persistência e sincronização. Implementada e validada localmente em 11/09/2026; ainda requer PostgreSQL real, HTTPS/CORS, autenticação/autorização e validação física antes de ser considerada pronta para produção.

## Concluído

- Frontend Next.js/TypeScript mobile-first com Dexie/IndexedDB como fonte local.
- Criação e reabertura de inventários, UUIDv7, data local `YYYY-MM-DD`, revisão, `syncStatus` e tombstones.
- Lançamento, edição, exclusão com confirmação e listagem de ocorrências individuais por EF/DE e vão, com ordenação natural.
- Service worker Serwist para shell offline no build de produção.
- FastAPI com prévia de análise pura e API de sincronização persistente, mantendo o motor Python separado do contrato HTTP e da persistência.
- Cache do último relatório por revisão, com identificação de possível desatualização quando só há cache anterior.
- Persistência central SQLAlchemy, com migração Alembic `0001_central_sync` compatível com PostgreSQL; SQLite é permitido somente para desenvolvimento e testes locais.
- API `POST /api/v1/sync` com lote de alterações, cursor incremental, IDs UUID gerados no cliente, idempotência por revisão e tombstones.
- Código de sincronização por inventário, guardado no IndexedDB e persistido no servidor apenas como hash; não há listagem global de inventários.
- Detecção e auditoria de conflitos no servidor e no IndexedDB, com escolha explícita entre versão local e central.
- Conexão de um segundo dispositivo por ID e código de sincronização, preservando o fluxo de lançamento offline.

## Validado

- `pnpm dev` iniciou sem erro em `http://localhost:3000`; `GET /healthz` respondeu em `http://localhost:8000`.
- Validação funcional em Chromium: criação com data automática, EF/DE, retenção de lado/vão, limpeza de lote/quantidade, foco no lote, análise `19 + 1`, edição, confirmação de exclusão, recarga e persistência IndexedDB.
- Motor chamado pelo FastAPI: `19 + 1` resultou em `PEÇA_SOLTEIRA`; `10 + 10`, em `DISTRIBUIÇÃO_AMBÍGUA` sem local principal; `15 + 2 + 3`, em `GRUPO_DESLOCADO` com cinco peças deslocadas.
- Fase 1: lint e checagem de tipos do frontend; 8 testes Vitest; 8 testes Pytest; build de produção com `sw.js`; 2 testes Playwright de fluxo online/offline.
- Inspeção responsiva em viewport 390 × 844 sem corte horizontal.
- Migração Alembic aplicada em banco SQLite temporário e removida após a verificação.
- Sincronização validada em Chromium entre dois contextos de navegador isolados: criação e lançamento local, envio ao FastAPI, conexão por ID+código no segundo contexto e leitura do mesmo lançamento.
- Lint e typecheck do frontend; 10 testes Vitest; 10 testes Pytest; build de produção com `sw.js`; 3 testes Playwright.

## Pendente

- Exportações Excel/PDF/Word, finalização, histórico completo, autenticação, deploy e publicação.
- Provisionamento PostgreSQL real, execução de `alembic upgrade head` nele, configuração HTTPS/CORS do ambiente e smoke test contra a infraestrutura publicada.
- Teste em Android físico, Safari/iPhone físico, comportamento PWA real no iOS e validação operacional em ambiente real.

## Problemas conhecidos

- Não há bloqueadores conhecidos para a implementação local da Fase 2.
- O `TestClient` das dependências FastAPI/Starlette emite dois avisos de depreciação durante `pytest`; a suíte passa e não há impacto funcional observado.
- O navegador interno do Codex não concluiu IndexedDB durante a inspeção, mas o Chromium local e os fluxos Playwright concluíram; isso é limitação do ambiente de automação, não uma compatibilidade móvel validada.
- O código de sincronização é uma credencial de capacidade por inventário, não substitui autenticação de usuários, rate limiting ou gestão de equipe em uma publicação pública.

## Decisões técnicas

- IndexedDB/Dexie é a fonte primária da operação local e offline; a sincronização central persiste e replica alterações já confirmadas no dispositivo, sem substituir o lançamento local.
- Serwist é aplicado e registrado somente em produção. Next usa webpack porque a integração atual não suporta Turbopack; `allowedDevOrigins` inclui `127.0.0.1` para a validação local de desenvolvimento.
- Lote e vão são texto; a consolidação ocorre apenas no motor Python. Não há mesclagem de lançamentos na interface.
- O motor considera local principal apenas quando o maior local é único e tem pelo menos três vezes a soma dos demais.
- PostgreSQL é o banco de produção. A API não cria schema em PostgreSQL: a migração Alembic deve ser executada antes da inicialização. O SQLite automático existe apenas para desenvolvimento local e para o gate de navegador.
- Conflitos não seguem "última gravação vence" silenciosamente: a comparação usa `syncBaseRevision`, registra ambas as versões e exige decisão explícita no cliente.

## Próxima tarefa exata

Provisionar e validar a infraestrutura de produção da Fase 2, incluindo PostgreSQL real, migração Alembic, HTTPS/CORS e autenticação/autorização antes de exposição pública.

## Checkpoint Git da Fase 2 local

- Commit de implementação: `7db63cf` (`feat: complete central sync and conflict handling`).
- Branch: `master`.
- Estado final local: Fase 1 concluída; Fase 2 implementada e validada pelos gates locais. PostgreSQL real, HTTPS/CORS, autenticação/autorização e validação física continuam pendentes.
