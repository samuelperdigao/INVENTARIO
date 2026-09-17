# Status do projeto

Atualizado em 17/09/2026.

## Entrega integrada — regra oficial de lotes e importação SAP

Commit integrado: `cbc55dd` na `main`.

- A regra vigente é exatamente 10 dígitos ASCII com prefixo `27` ou `28`, centralizada em `backend/app/lot_rules.py` e `lib/lot-rules.ts`.
- A planilha SAP só alimenta a referência pela coluna com cabeçalho `Lotes`, aceitando apenas trim e diferença de maiúsculas/minúsculas. Cabeçalho ausente, duplicado ou seleção de outra coluna não são aceitos.
- O parser trabalha em memória, limita tamanho/linhas, trata texto, número, formato, notação científica, vazios, inválidos e duplicidades, e persiste somente lotes deduplicados e metadados mínimos.
- A referência continua opcional e informativa: lote físico válido fora do SAP permanece permitido, e falha de importação não altera os lançamentos físicos.
- O campo manual filtra entrada não numérica, limita 10 posições e apresenta a regra imediatamente; a API valida novamente.

### Gates locais desta alteração

- ESLint: aprovado.
- TypeScript: aprovado.
- Vitest: `13 arquivos, 61 testes aprovados`.
- Pytest: `56 testes aprovados`, com 2 avisos de depreciação das dependências FastAPI/Starlette/httpx.
- `compileall` do backend: aprovado.
- Alembic SQLite temporário: `upgrade head`, `downgrade 0007_recovery_pin`, novo `upgrade head` e `current` em `0008_inventory_lot_references (head)` aprovados; nenhuma migration nova foi necessária.
- Build de produção local: aprovado.
- Playwright: `6 cenários aprovados` com backend local, incluindo offline, sincronização, histórico móvel e 100 lançamentos/exportações.

O commit foi integrado e enviado para `origin/main`. Os gates de CI foram
aprovados. Android/iPhone Safari continuam sendo gates físicos pendentes.

## Produção

- `main` é a baseline estável.
- Frontend ativo na Vercel: `https://inventario-lpe.vercel.app`.
- API ativa no Render: `https://inventory-api-6o8h.onrender.com`.
- PostgreSQL ativo no Neon.
- Migration `0008_inventory_lot_references` aplicada na inicialização do deploy do ambiente principal.
- Os workflows `Quality Gates` e `Production Smoke` do commit `cbc55dd` concluíram com sucesso.
- O frontend publicado na Vercel continua respondendo e a rewrite `/backend-api/healthz` respondeu `{"status":"ok"}`.
- O redeploy manual do Render foi concluído com `live` para o commit `adfdc60`, que contém o código funcional do `cbc55dd`.
- O smoke público funcional confirmou a correção: tanto `https://inventory-api-6o8h.onrender.com/api/v1/analysis/preview` quanto a rewrite da Vercel recusam `lot: "123"` com HTTP 422 e aceitam `2712345678` com HTTP 200.
- O health check direto da API e a rewrite `/backend-api/healthz` respondem `{"status":"ok"}`; não houve logs de erro no intervalo do redeploy e da validação.

## Histórico — entrega publicada: referência opcional de lotes SAP

Commit: `9e05c46` na `main` e na branch `feat/referencia-lotes-sap`.
O commit foi publicado no GitHub, validado pelos workflows `Quality Gates` e
`Production Smoke`, e disponibilizado na Vercel e no Render.

- A entrega publicada naquele commit aceitava uma planilha `.xlsx` do SAP, mostrava prévia e seleção manual de coluna quando necessário, normalizava e persistia somente números de lote; a regra atual está registrada na seção de validação local acima.
- A referência é independente dos lançamentos físicos: ausência, divergência, falha de consulta ou operação offline não bloqueiam inclusão, edição ou exclusão local.
- O painel oferece importação, consulta paginada, cache offline, substituição e remoção; inventários finalizados não aceitam alteração da referência.
- Relatórios com referência acrescentam conciliação condicional nos formatos `.xls`, `.xlsx`, PDF e DOCX; sem referência, o contrato anterior é preservado.
- A migration `0008_inventory_lot_references` cria `inventory_references` e `reference_lots` sem alterar os lançamentos existentes.

### Validação local desta entrega

- ESLint: aprovado.
- TypeScript: aprovado.
- Vitest: `12 arquivos, 50 testes aprovados`.
- Pytest: `42 testes aprovados`, com 2 avisos de depreciação das dependências FastAPI/Starlette/httpx.
- `compileall` do backend: aprovado.
- Alembic SQLite temporário: `upgrade head`, `downgrade 0007_recovery_pin`, novo `upgrade head` e `current` em `0008_inventory_lot_references (head)` aprovados.
- Build de produção local: aprovado.
- Playwright: `6 cenários aprovados` com `BACKEND_PROXY_URL=http://127.0.0.1:8000`; os cenários cobrem login, análise, dashboard, histórico, offline, sincronização e exportações.
- Teste backend específico da referência validou parser, normalização, preview, importação, substituição, remoção, IDOR e conciliação nos quatro formatos.

### Limitações e prontidão

- A execução local de `pnpm e2e` deve definir `BACKEND_PROXY_URL` antes do build; o workflow de CI já fornece essa variável.
- A migration foi aplicada no PostgreSQL/Neon durante o deploy; concorrência de produção ainda não foi exercitada nesta etapa.
- Nenhuma validação física nova foi feita em Android ou Safari/iPhone. Chromium local não substitui esses gates.
- A entrega está publicada; as regras específicas de classificação dos lotes continuam pendentes para a próxima etapa.

## Funcionalidades concluídas

- Operação local e offline com IndexedDB.
- Autenticação, sessão renovável e recuperação por NP de oito dígitos.
- Inventário individual sem equipe obrigatória.
- Equipes com papéis `ADMIN` e `OPERATOR`.
- Participação em inventário aberto por código de seis dígitos.
- Camada opcional nos lançamentos; quando informada, aceita A1 a A10.
- Lote oficial de 10 dígitos com prefixo `27`/`28`, autoria e confirmação de duplicidade.
- Sincronização incremental, idempotência, tombstones e conflitos.
- Análise determinística de lotes com apresentação operacional para o operador.
- Finalização central irreversível, histórico e exportações PDF, Excel e Word.
- Referência opcional de lotes SAP com prévia, cache local, conciliação e lançamento físico sempre liberado.
- Exportação `.xls` BIFF8 gerada diretamente no backend e apresentada como padrão para os computadores antigos da equipe.
- Exportação `.xlsx` moderna preservada, com fonte única de dados, quatro abas oficiais sem referência e quinta aba condicional de conciliação, além dos contratos binários de MIME, nome e tamanho.
- Exportações Excel, PDF e Word revisadas para usar resumo, inventário, lotes consolidados e lotes para conferência, com uma linha por lote e sem duplicar a lógica de análise.
- Compartilhamento nativo e links temporários assinados.

## Auditoria de manutenção

Branch: `chore/repository-cleanup`.

- Estrutura de diretórios compatível com o porte atual; nenhuma movimentação ampla necessária.
- Nenhum artefato gerado ou arquivo de ambiente rastreado.
- Nenhuma duplicação exata de arquivo encontrada.
- Cadeia Alembic linear, com upgrade, downgrade até base e novo upgrade aprovados em SQLite temporário.
- Três dependências diretas redundantes removidas: `@eslint/eslintrc`, `@types/jsdom` e `playwright`. Dependências transitivas necessárias permanecem resolvidas.
- `browserslist` transitivo fixado em `4.28.7` por override para eliminar duas vulnerabilidades altas da versão `4.28.6`, sem mudança de API do projeto.
- Configuração de base da API centralizada em `lib/api-config.ts`.
- Padrões de cache, cobertura, IDE, sistema operacional, logs e build adicionados ao `.gitignore`.
- Quality Gates configurados para Pull Requests e pushes na `main`.
- Documentação histórica conflitante consolidada nos documentos oficiais.

## Validação da camada opcional

Branch: `fix/camada-opcional-inventario`.
Pull Request: `#14`.
Quality Gates: execução `34804812322`, run `#23`.

- `pnpm lint`: aprovado.
- `pnpm typecheck`: aprovado.
- Vitest: aprovado.
- `pnpm build`: aprovado.
- Pytest: aprovado.
- Alembic `upgrade head`: aprovado.
- Instalação do Chromium: aprovada.
- Playwright: todos os fluxos de navegador aprovados.
- Nenhuma migration nova necessária; o backend e o banco já aceitam camada nula.

## Gates locais da manutenção anterior

- `pnpm install --frozen-lockfile`: aprovado.
- `pnpm audit --prod`: aprovado sem vulnerabilidades conhecidas.
- `pnpm lint`: aprovado.
- `pnpm typecheck`: aprovado.
- Vitest: 8 arquivos e 22 testes aprovados.
- Pytest: 32 testes aprovados, com 2 avisos de depreciação de dependências.
- Alembic SQLite: upgrade até `0007`, downgrade até base e novo upgrade aprovados.
- `pnpm build`: aprovado após todas as alterações.

## Validação das exportações Excel

Branch: `feat/fluxo-acesso-compartilhamento-v1`.

- `xlwt` gera `.xls` diretamente em BIFF8/OLE, sem conversão no navegador ou dependência do LibreOffice.
- `openpyxl` mantém o `.xlsx` moderno.
- O endpoint `/api/v1/inventories/{id}/export/excel` usa `.xls` por padrão e aceita `?format=xlsx`.
- O teste de volume local cobre 100 registros, 95 lotes, 1.269 peças, 91 lotes OK e 4 lotes para conferência nos quatro formatos.
- Os testes verificam assinatura OLE, ZIP, abas, ausência de filtros e linhas de grade, MIME, `Content-Disposition`, `Content-Length`, totais iguais e download como Blob.
- Word permanece em `.docx`; uma variante `.rtf` ou `.doc` ficou fora desta entrega por não haver geração legada segura na estrutura atual.

## Validação desta entrega

Branch de trabalho: `feat/fluxo-acesso-compartilhamento-v1`.
Commit publicado anteriormente: `7eff966`. Esta continuação adiciona somente
ajustes de impressão BIFF8 e a cobertura correspondente.

- `pnpm lint`: aprovado.
- `pnpm typecheck`: aprovado.
- `pnpm test`: 9 arquivos e 39 testes aprovados.
- `backend/.venv/bin/python -m pytest backend/tests -q`: 36 testes aprovados, com 2 avisos de depreciação de dependências.
- `pnpm build`: aprovado.
- Inspeção estrutural dos quatro arquivos: XLS BIFF8, XLSX, PDF e DOCX válidos; totais e situações visíveis coerentes.
- `.xls`: alturas de linhas com múltiplos locais e escala de impressão legada cobertas pelo teste BIFF8.
- `pnpm exec playwright install chromium`: os três espelhos do CDN retornaram erro, timeout ou ZIP truncado.
- Chrome for Testing `145.0.7632.6` foi instalado pelo artefato oficial direto e respondeu na revisão esperada pelo Playwright.
- `pnpm e2e`: 6 cenários aprovados em 2m23s usando o backend local do runner.
- Produção: frontend público respondeu e a folha de estilos publicada contém os estados `single-piece`, `multiple-pieces`, `distributed` e `conference-table`; API pública expôs `LotPresentation` e `lotsForConference` no OpenAPI.

## Pendências

- Fazer conferência visual em Excel antigo e Excel moderno no ambiente da equipe.
- A conversão visual local do `.xls` não foi repetível: o Calc alfa entrou em loop de CPU e o Calc estável instalado não iniciou sob as restrições de usuário do sandbox. A validação BIFF8 estrutural e os testes de conteúdo continuam aprovados.
- Validar a PWA em Android físico.
- Validar instalação, cache e compartilhamento em Safari/iPhone físico.
- Planejar a separação incremental dos routers de `backend/app/main.py` somente junto de nova evolução funcional e cobertura de contrato.

## Documentos oficiais

- Regras vigentes: `docs/REGRAS_NEGOCIO.md`.
- Arquitetura: `docs/ARQUITETURA.md`.
- Deploy: `docs/DEPLOY.md`.
- Exportações: `docs/EXPORTACOES.md`.
- Especificação histórica: `docs/ESPECIFICACAO_INVENTARIO_V1.md`.
- Decisão de camadas e duplicidade: `docs/CAMADAS_DUPLICIDADE_V2.md`.
