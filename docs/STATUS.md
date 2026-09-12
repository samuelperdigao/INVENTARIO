# Status do Projeto

## Fluxo de acesso e compartilhamento V1 — implementado na branch em 12/09/2026

- Landing pública em `/`, fluxo de acesso em `/acesso`, dashboard autenticado em `/dashboard` e histórico em `/historico`.
- Cadastro com qualquer e-mail válido, sem criação automática de equipe e com acesso imediato, sem envio de código.
- Recuperação por e-mail, NP pessoal de oito dígitos e confirmação da nova senha. O NP usa hash `scrypt` reforçado pelo segredo da aplicação; cinco falhas bloqueiam a recuperação por quinze minutos e uma troca válida revoga todas as sessões anteriores.
- Migration `0006_recovery_pin`: hash do NP, contador de falhas e instante de bloqueio temporário. A `0005_access_sharing` continua responsável pela participação e autoria do histórico.
- Contas anteriores à `0006` recebem uma etapa autenticada obrigatória para configurar e confirmar o NP no próximo login.
- Participação simplificada: a interface mostra somente seis dígitos; o backend resolve o UUID, registra o usuário e emite token interno de alta entropia exclusivo. Dez falhas em quinze minutos causam bloqueio temporário.
- Histórico dividido em **Meus inventários** e **Inventários da equipe**. Snapshots finalizados continuam imutáveis e podem ser consultados/exportados por usuário autorizado sem token manual.
- Compartilhamento prioriza PDF por Web Share API, validado com `navigator.canShare()`; dispositivos sem suporte recebem download. PDF, XLSX e DOCX permanecem disponíveis.
- SMTP permanece isolado ao envio opcional de anexos de relatório. Cadastro e recuperação não dependem de e-mail transacional.
- Gates executados: lint, typecheck, 13 testes Vitest, 26 testes Pytest, build Next e ciclo Alembic SQLite `upgrade → downgrade 0005 → upgrade 0006` passaram.
- Playwright foi atualizado para o novo login e participação, mas não foi executado neste ambiente porque o download do Chromium expirou novamente. A validação visual continua como limitação de ambiente, não como teste aprovado.
- Pendência externa: aplicar `0006` no PostgreSQL real e executar smoke test publicado. Provedor SMTP só é necessário para envio opcional de relatórios.

## V1 estrutural — concluída localmente em 11/09/2026

- Foi adicionada a migration Alembic `0004_inventory_reports_finalization`: estado `FINISHED`, instante de finalização, snapshot do relatório e índice de histórico.
- `backend/app/reports.py` fornece o modelo consolidado único. Excel (`openpyxl`), PDF (`reportlab`) e Word (`python-docx`) consomem o mesmo modelo; os arquivos não repetem regras de análise.
- A API finaliza somente inventário sincronizado e autorizado, bloqueia mutações posteriores e preserva relatório/exportações. A etapa nova retirou a exigência de token manual para consultar itens finalizados autorizados.
- A sincronização não aceita criar ou alterar o status para `FINISHED`: essa transição existe somente no endpoint protegido de finalização.
- A interface mantém o desenho existente: finalização, downloads e consulta de histórico foram incluídos como controles operacionais mínimos. Inventário finalizado é somente leitura localmente.
- Gates desta alteração: `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test` (10), `pytest backend/tests` (19), `pnpm build`, `pnpm e2e` (3) e `alembic upgrade head` em SQLite temporário passaram. Os dois avisos conhecidos de depreciação do TestClient permanecem sem falha funcional.
- PostgreSQL real/Neon, secrets, domínio HTTPS, CORS final, Render/Vercel, smoke test publicado e validação Android/iOS continuam exclusivamente pendências externas.

## Fase 2.2 - preparacao local concluida; provisionamento externo pendente

- Arquitetura recomendada: Vercel (Next.js), Render (FastAPI) e Neon (PostgreSQL gerenciado), com `app.<dominio>` e `api.<dominio>` sob o mesmo dominio raiz.
- `render.yaml` prepara o backend com Uvicorn em `$PORT`, healthcheck `/healthz` e secrets que nao sao serializados no repositorio. No plano gratuito, Alembic e um gate manual obrigatorio antes de liberar a API, pois o `preDeployCommand` do Render exige compute pago.
- `/healthz` agora confirma uma consulta `SELECT 1` antes de responder 200 e retorna somente indisponibilidade generica se o banco falhar; o endpoint nao expoe URL, credenciais ou detalhes internos.
- Frontend e backend recebem `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` e `Permissions-Policy`; HSTS e habilitado exclusivamente quando `INVENTORY_ENV=production`.
- Nenhuma conta, PostgreSQL, dominio, certificado, variavel de hospedagem, migration real ou URL publica foi criada/alterada neste repositorio. Logo, publicacao, HTTPS, CORS final e smoke test de producao continuam **PENDENTES**.
- Gates locais da preparacao: `pnpm lint`, `pnpm typecheck`, `pnpm test` (10 testes), `pytest backend/tests` (14 testes), `pnpm build` e `pnpm e2e` (3 fluxos) passaram. O primeiro typecheck concorrente ao build falhou por arquivos `.next/types` removidos durante a propria compilacao; reexecutado apos o build, passou.
- Alembic foi aplicado em banco SQLite temporario ate `0003_team_member_role_constraint`; confirmou as tabelas centrais, `users`, `teams`, `team_members`, `auth_sessions` e a constraint `ck_team_members_role`. O arquivo temporario foi removido. Isto e validacao local, nao PostgreSQL real.

## Fase atual

Fase 2.1 — identidade, equipes e endurecimento de infraestrutura. Encerrada e validada localmente em 11/09/2026; a próxima etapa é a Fase 2.2 — infraestrutura real de produção. PostgreSQL real, HTTPS publicado, CORS do domínio definitivo e validação física continuam pendências externas.

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
- Conexão de outro dispositivo por código amigável de seis dígitos, com UUID e token interno resolvidos sem exposição na interface.

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

- Deploy e publicação: exportações, finalização e histórico completo foram concluídos e validados localmente nesta etapa.
- Provisionamento PostgreSQL real, execução de `alembic upgrade head` nele, configuração HTTPS/CORS do ambiente e smoke test contra a infraestrutura publicada.
- Teste em Android físico, Safari/iPhone físico, comportamento PWA real no iOS e validação operacional em ambiente real.

## Problemas conhecidos

- Não há bloqueadores conhecidos para a implementação local da Fase 2.
- O `TestClient` das dependências FastAPI/Starlette emite dois avisos de depreciação durante `pytest`; a suíte passa e não há impacto funcional observado.
- O navegador interno do Codex não concluiu IndexedDB durante a inspeção, mas o Chromium local e os fluxos Playwright concluíram; isso é limitação do ambiente de automação, não uma compatibilidade móvel validada.
- Ainda não há convite de equipe por e-mail, rate limiting distribuído por IP ou auditoria operacional completa. Recuperação por NP tem limite por conta; tentativas de participação também são limitadas.

## Fase 2.1 — concluído localmente

- Registro e login por e-mail/senha, hash `scrypt`, access token assinado de curta duração e sessão renovável revogável em cookie `HttpOnly`.
- Modelo `User → Team → TeamMember → Inventory`, com papéis `ADMIN` e `OPERATOR`; cadastro novo não cria equipe automaticamente.
- Sincronização exige usuário autenticado e token interno; criação central exige equipe e participantes registrados usam token individual. Inventário não autorizado retorna 404 mesmo quando o UUID é conhecido.
- CORS usa origens explícitas e credenciais; em `production` a API recusa SQLite, segredo fraco e origem não HTTPS/curinga.
- Migrations `0002_auth_teams_access` e `0003_team_member_role_constraint` aplicadas com sucesso em SQLite limpo até `head`; o ciclo `downgrade 0001_central_sync → upgrade head` também passou. Inventários antigos permanecem com associação nula e bloqueados no central até associação administrativa planejada.
- Alembic também gerou com sucesso o SQL do dialeto PostgreSQL para `upgrade head`; isso valida a geração, não substitui a execução contra uma instância PostgreSQL real.
- O SQLite local preexistente tinha o schema de `0001_central_sync` criado pelo runtime sem tabela de versão; após confirmar o schema herdado, ele foi marcado em `0001_central_sync` e atualizado pelas migrations aditivas `0002` e `0003` sem recriar tabelas.
- Testes de autenticação, sessão, autorização de equipe, IDOR, papel de operador, idempotência, conflito e tombstone foram adicionados e passam localmente.

## Decisões técnicas

- IndexedDB/Dexie é a fonte primária da operação local e offline; a sincronização central persiste e replica alterações já confirmadas no dispositivo, sem substituir o lançamento local.
- Serwist é aplicado e registrado somente em produção. Next usa webpack porque a integração atual não suporta Turbopack; `allowedDevOrigins` inclui `127.0.0.1` para a validação local de desenvolvimento.
- Lote e vão são texto; a consolidação ocorre apenas no motor Python. Não há mesclagem de lançamentos na interface.
- O motor considera local principal apenas quando o maior local é único e tem pelo menos três vezes a soma dos demais.
- PostgreSQL é o banco de produção. A API não cria schema em PostgreSQL: a migração Alembic deve ser executada antes da inicialização. O SQLite automático existe apenas para desenvolvimento local e para o gate de navegador.
- Conflitos não seguem "última gravação vence" silenciosamente: a comparação usa `syncBaseRevision`, registra ambas as versões e exige decisão explícita no cliente.

## Próxima tarefa exata

FASE 2.2 — provisionar PostgreSQL gerenciado, executar migrations Alembic no PostgreSQL real, definir segredos de produção, configurar domínio/HTTPS e CORS final, publicar frontend/backend e realizar smoke test de autenticação e sincronização. Não iniciar essa fase sem ambiente externo definido.

## Checkpoint Git da Fase 2 local

- Commit de implementação: `7db63cf` (`feat: complete central sync and conflict handling`).
- Branch: `master`.
- Estado final local: Fase 1 e Fase 2.1 de segurança implementadas e validadas pelos gates locais. PostgreSQL real, HTTPS/CORS publicado e validação física continuam pendentes.
- Checkpoint da Fase 2.1: `feat: add authentication teams and protected sync`. O worktree deve permanecer limpo antes da Fase 2.2.
