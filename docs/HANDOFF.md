# Handoff

## Checkpoint — acesso, participação e compartilhamento

A branch `feat/fluxo-acesso-compartilhamento-v1` contém a nova entrada pública e o fluxo operacional autenticado. As rotas são `/` (landing), `/acesso`, `/dashboard`, `/historico`, `/historico/[inventoryId]` e `/inventarios/[inventoryId]`.

O cadastro aceita qualquer e-mail válido, não cria equipe e libera a conta imediatamente. O NP pessoal de oito dígitos é informado e confirmado no cadastro, fica somente como hash protegido e permite recuperar a senha sem envio de código. Cinco erros bloqueiam a recuperação por quinze minutos; uma troca válida revoga sessões anteriores. A migration `0006_recovery_pin` adiciona o novo segredo e os controles de tentativas.

O primeiro sync de um inventário novo ainda exige equipe e gera o código amigável. Um participante autenticado envia os seis dígitos a `POST /api/v1/inventories/join`; o backend registra sua entrada e devolve UUID e token opaco somente para uso interno do cliente. Ao finalizar, o código é removido. Relatório, exportação e e-mail de inventário finalizado autorizam por criador, equipe ou participante sem solicitar token manual.

O envio de relatórios está implementado por SMTP. Cadastro e recuperação não usam SMTP. `console` existe somente para desenvolvimento e testes; produção ainda exige configuração protegida caso o envio opcional de relatórios permaneça habilitado.

Validações locais após a troca para NP: lint, typecheck, 13 Vitest, 26 Pytest, build Next e ciclo Alembic SQLite até `0006` passaram. Os três testes Playwright foram adaptados, mas o Chromium não pôde ser baixado neste ambiente por timeout; executar `pnpm exec playwright install chromium` e `pnpm e2e` em ambiente com o navegador disponível.

## V1 estrutural — checkpoint local de relatório e encerramento

Esta etapa acrescentou a parte estrutural restante da V1 sem redesenhar o frontend: modelo consolidado único, Excel/PDF/Word, finalização central e histórico. A migration `0004_inventory_reports_finalization` acrescenta `finalized_at` e `report_snapshot` a `inventories`.

O fluxo é: sincronizar inventário aberto → `POST /api/v1/inventories/{id}/finalize` com a revisão central → servidor analisa lançamentos ativos e salva snapshot → inventário passa a `FINISHED` e rejeita novas mutações. A sincronização não pode criar nem alterar esse estado: a transição é exclusiva do endpoint protegido. Não há regra de reabertura; não a implemente sem aprovação.

Arquivos novos principais: `backend/app/reports.py`, migration `0004`, `components/finalization-panel.tsx`, `components/history-panel.tsx`, `backend/tests/test_reports.py` e `backend/tests/test_finalization_api.py`. O frontend só recebe controles operacionais; não houve alteração estética ampla.

Gates locais: lint, TypeScript, Vitest (10), Pytest (19), build, Playwright (3) e Alembic SQLite temporário até `0004` passaram. Isto não valida PostgreSQL real, HTTPS, CORS publicado, provedores, Android ou Safari/iOS.

Próxima tarefa: validação publicada — provisionar Neon, aplicar `alembic upgrade head`, configurar secrets, Render/Vercel e os subdomínios HTTPS; executar smoke test real. Depois, validar Android/iOS e só então iniciar refinamento visual.

## Fase 2.2 - estado de preparacao

Foi adicionada somente a preparacao versionada para a publicacao: `render.yaml`, instrucoes de Vercel/Render/Neon, headers defensivos e healthcheck que verifica a conexao SQL. A escolha recomendada e Vercel para o frontend, Render para o FastAPI e Neon para PostgreSQL. O backend deve receber `https://api.<dominio>` e o frontend `https://app.<dominio>` para que o cookie `SameSite=Strict` siga funcional entre subdominios sem ser alterado para uma politica menos restritiva.

Nada externo foi provisionado. A proxima pessoa deve primeiro obter autorizacao para usar as contas, criar recursos gratuitos e configurar DNS; depois informar somente as URLs finais (nunca secrets) e executar o roteiro do README. O primeiro gate externo e `alembic upgrade head` no PostgreSQL real, seguido de `GET /healthz` com 200.

Os gates locais passaram: lint, typecheck, 10 testes Vitest, 14 Pytest, build de producao e 3 fluxos Playwright. Alembic subiu um SQLite temporario ate `0003_team_member_role_constraint`, com todas as tabelas de identidade/equipe/sincronizacao e a constraint de papel presentes; o arquivo temporario foi removido. Isso nao e evidencia de PostgreSQL, TLS, CORS publicado ou smoke test externo.

## Estado atual

Fase 1 está concluída e preservada. A Fase 2.1 acrescentou identidade, equipes e proteção de acesso à sincronização, tudo validado localmente. PostgreSQL real, HTTPS publicado, CORS do domínio definitivo e dispositivos físicos ainda precisam de validação antes de exposição pública.

## Arquitetura implementada

- Next.js 16/TypeScript na raiz, com componentes mobile-first.
- Dexie sobre IndexedDB como fonte de verdade local.
- Serwist gera o shell offline apenas em build de produção.
- FastAPI em `backend/`, com SQLAlchemy, Alembic e persistência central para inventários, lançamentos, eventos e conflitos.
- Identidade local com senha `scrypt`, bearer token curto e sessão opaca revogável em cookie `HttpOnly`; a sessão é renovada sem persistir segredo no IndexedDB.
- Equipes com membros `ADMIN` e `OPERATOR`; `inventories.team_id` protege a sincronização contra IDOR e mantém `owner_user_id` para rastrear a publicação inicial.
- Motor Python em `backend/app/engine.py`, separado do contrato HTTP.

## Principais arquivos e módulos

- `app/page.tsx` e `app/inventarios/[inventoryId]/page.tsx`: rotas.
- `components/inventory-home.tsx`, `inventory-screen.tsx`, `entry-form.tsx`, `entry-list.tsx`, `analysis-panel.tsx`: fluxo operacional.
- `lib/models.ts`, `db.ts`, `inventory-repository.ts`, `grouping.ts`, `analysis-client.ts`: modelo, IndexedDB, ordenação e API.
- `app/sw.ts` e `next.config.mjs`: PWA/Serwist e configuração Next.
- `backend/app/schemas.py`, `main.py`, `engine.py`: contrato, HTTP e regras puras.
- `backend/app/database.py`, `persistence.py`, `sync_service.py`: conexão SQLAlchemy, modelos relacionais e protocolo de sincronização.
- `backend/alembic/versions/0001_central_sync.py`, `0002_auth_teams_access.py` e `0003_team_member_role_constraint.py`: migrations centrais, de acesso e de restrição de papéis para PostgreSQL/SQLite.
- `lib/sync-client.ts` e `components/sync-panel.tsx`: cliente IndexedDB, cursor, conflitos e controles operacionais de sincronização.
- `lib/auth-client.ts` e `components/auth-panel.tsx`: sessão no navegador sem persistir bearer token, criação/login de conta e escolha da equipe para sincronização.
- `backend/app/auth_service.py` e `config.py`: hash de senha, tokens, sessão revogável, validação de produção e autorização por equipe.
- `tests/` e `e2e/`: testes unitários e fluxo de navegador.

## Funcionalidades concluídas

- Inventários locais com data automática e sufixo visual por dia.
- Lançamentos individuais, edição, exclusão confirmada com tombstone, agrupamento EF/DE/vão e ordenação natural.
- Persistência IndexedDB e lançamento sem rede.
- Análise online, cache por revisão e leitura de cache possivelmente desatualizado quando offline.
- Sincronização manual segura entre dispositivos: dados pendentes são enviados depois de preservados no IndexedDB; alterações centrais são buscadas por cursor.
- Repetição de envio não duplica entidades; IDs e revisões já aceitos são reconhecidos de modo idempotente.
- Conflitos de edição preservam o payload local e o central, são registrados no banco e exigem que o operador mantenha uma das versões.
- Outro dispositivo conecta o inventário com seis dígitos; UUID e token interno não aparecem no fluxo normal.

## Motor de análise

- Local único: `OK`.
- Mais de um local: marcador `FRAGMENTADO`.
- Maior concentração única e pelo menos 3× os demais: local principal confiável.
- Divergência 1: `PEÇA_SOLTEIRA`; maior: `GRUPO_DESLOCADO`.
- Empates e distribuições sem confiança: `DISTRIBUIÇÃO_AMBÍGUA`.

## Persistência offline

`Inventory` e `InventoryEntry` usam UUIDv7, timestamps, revisão, `syncBaseRevision`, `syncStatus` e tombstone. Inclusão, edição e exclusão usam transação Dexie. A API nunca participa do lançamento local: ela só replica alterações pendentes quando o operador sincroniza. O código de acesso por inventário fica no IndexedDB; o banco central conserva somente seu hash.

## Testes existentes

- Vitest: 10 testes para formulário, erro de armazenamento, IndexedDB, cache, agrupamento, edição, exclusão e aplicação/decisão de conflitos de sincronização.
- Pytest: 13 testes para contrato HTTP, motor, autenticação, sessão HttpOnly, equipe, IDOR, papéis, idempotência, conflitos e tombstones.
- Playwright: 3 fluxos para recarga offline, análise online/cache offline e sincronização entre dois contextos de navegador.

## Comandos importantes

```powershell
pnpm install --frozen-lockfile
pnpm dev
backend/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir backend --reload --port 8000
backend/.venv/Scripts/python.exe -m alembic -c backend/alembic.ini upgrade head
pnpm lint
pnpm typecheck
pnpm test
backend/.venv/Scripts/python.exe -m pytest backend/tests
pnpm build
pnpm e2e
```

## Como executar o projeto

O frontend de desenvolvimento fica em `http://localhost:3000`. Para solicitar análise nova ou sincronizar, execute também o FastAPI em `http://localhost:8000`. Não há variável obrigatória para desenvolvimento: as duas URLs públicas usam esse endereço por padrão. Em produção, defina `INVENTORY_DATABASE_URL` como `postgresql+psycopg://…`, execute `alembic upgrade head` e configure `INVENTORY_CORS_ORIGINS` com o domínio HTTPS publicado. Para PWA/offline, use `pnpm build` e `pnpm start`.

## Decisões técnicas importantes

- PostgreSQL é o destino de produção; SQLite é estritamente fallback local e de testes. O FastAPI só cria tabelas automaticamente em SQLite.
- O cabeçalho `X-Inventory-Sync-Token` é obrigatório para cada inventário central e é comparado pelo hash. Não há endpoint que enumere inventários.
- `syncBaseRevision` impede que duas edições derivadas da mesma versão se sobrescrevam. O servidor registra o conflito e a interface oferece manter a versão local ou central.
- Serwist é envolvido somente com `NODE_ENV=production`; desenvolvimento não registra service worker para não interferir no HMR.
- `allowedDevOrigins` permite `127.0.0.1`, usado pelos testes de navegador em desenvolvimento.

## Problemas conhecidos

Persistem dois avisos de depreciação de dependências ao usar `pytest`. A automação interna do Codex não é evidência de suporte IndexedDB móvel; Chromium local passou. Ainda não há prova de migração contra um PostgreSQL real, de HTTPS publicado ou de compatibilidade em Android/Safari físicos.

## Pendências

- Teste em Android físico.
- Teste Safari/iPhone físico e PWA iOS real.
- Validação operacional em ambiente real.
- FASE 2.2 — Infraestrutura real de produção: provisionar PostgreSQL gerenciado; executar `alembic upgrade head` no PostgreSQL real; definir segredos de produção; configurar domínio/HTTPS e CORS final; publicar frontend/backend; realizar smoke test; e validar autenticação e sincronização no ambiente publicado.
- A validação local cobriu SQLite e geração de SQL PostgreSQL, mas não existe PostgreSQL, Docker, domínio, certificado ou conta de deploy disponível neste host. Não marcar nenhum desses itens como validado antes da execução no ambiente real.
- Definir procedimento administrativo para associar inventários herdados que ficaram com `team_id` nulo; eles são deliberadamente inacessíveis até esse backfill seguro.
- Provisionamento e validação real da infraestrutura publicada; exportações, finalização e histórico foram concluídos localmente neste checkpoint.

## Próxima tarefa exata

Iniciar exclusivamente a **FASE 2.2 — Infraestrutura real de produção**: provisionar PostgreSQL gerenciado, executar as migrations Alembic no PostgreSQL real, definir segredos de produção, configurar domínio/HTTPS e CORS final, publicar frontend/backend e fazer smoke test de autenticação e sincronização. Não implementar funcionalidades operacionais nessa etapa.

## Checkpoint Git da Fase 2 local

- Commit de implementação: `7db63cf` (`feat: complete central sync and conflict handling`).
- Branch: `master`.
- Estado final: Fase 1 e Fase 2.1 de segurança implementadas e validadas localmente. PostgreSQL real, HTTPS/CORS publicado, Android físico e Safari/iOS físico permanecem pendentes.
- Checkpoint local da Fase 2.1: `feat: add authentication teams and protected sync`. Confirme `git status` limpo antes de começar a Fase 2.2.

## Arquivos que a próxima conversa deve ler

1. `AGENTS.md`
2. `docs/ESPECIFICACAO_INVENTARIO_V1.md`
3. `docs/STATUS.md`
4. `docs/REGRAS_NEGOCIO.md`
5. `docs/HANDOFF.md`
6. `README.md`
