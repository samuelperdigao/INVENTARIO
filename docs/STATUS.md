# Status do projeto

Atualizado em 19/09/2026.

## Entrega em integração — sincronização silenciosa do inventário

A tela de inventário agora consulta o sync central em segundo plano a cada 10 segundos somente enquanto o inventário está aberto, visível e com conexão. O IndexedDB continua sendo a fonte imediata: lançar, editar e excluir concluem localmente antes de qualquer rede. O sync automático reaproveita uma única requisição em voo por inventário, só atualiza a tela quando há mudança real, preserva foco/rolagem/formulário e para ao sair da tela, ficar offline ou detectar finalização central.

Respostas antigas não sobrescrevem lançamentos feitos durante a requisição. Quando o servidor finaliza enquanto ainda há dados locais pendentes, o dispositivo preserva esses dados, registra o conflito e mostra o inventário em modo somente leitura. O botão `Sincronizar agora` permanece disponível para diagnóstico e ação explícita.

### Gates locais desta rodada

- ESLint: aprovado.
- TypeScript: aprovado.
- Vitest: `14 arquivos, 67 testes aprovados`, incluindo polling, resposta repetida, chamadas concorrentes, edição durante requisição e finalização remota.
- Build de produção: aprovado, incluindo o service worker.
- Playwright completo: `9 cenários aprovados`, incluindo login local, operação offline, sincronização automática entre dois usuários, histórico móvel, finalização/exportações e 100 lançamentos.
- Pytest: `56 testes aprovados`, com 2 avisos de depreciação das dependências FastAPI/Starlette/httpx.
- `git diff --check`: aprovado.
- Verificação visual local: dashboard renderizado no navegador integrado, com conteúdo acessível e sem tela em branco ou overlay de erro visível.

O servidor de teste do Playwright passou a compilar o frontend apontando para a API local antes de iniciar. Isso evita que a suíte use acidentalmente o proxy público do Render durante a validação local.

### Limitações e publicação

- A validação física em Android real e iPhone/Safari continua pendente; Chromium local e navegador desktop não substituem esses gates.
- Concorrência de produção em PostgreSQL/Neon continua sem exercício físico nesta rodada; os testes backend seguem usando o ambiente local previsto.
- A integração na `main`, push e confirmação dos endpoints públicos ocorrerão após a revisão final do branch.

## Entrega em integração — identidade visual transversal

Commits integrados: `caabac0 feat: unificar identidade visual do aplicativo` e `bc46847 docs: registrar identidade visual transversal`.

A direção visual premium agora é compartilhada pelo aplicativo inteiro: dashboard, equipe, histórico, detalhe de relatório e acesso usam o mesmo rail de navegação, tokens navy/ciano, textura de grid, superfícies elevadas, gradientes, estados de foco e tratamento responsivo. O fluxo de inventário mantém o rail específico de cinco etapas por ser uma tela operacional mais profunda, mas passa a compartilhar a mesma identidade, cores, elevação e linguagem visual.

`components/app-rail.tsx` concentra a navegação comum e `app/globals.css` aplica a camada transversal, incluindo a composição de autenticação e a preferência `prefers-reduced-motion`. Não houve alteração de API, backend, IndexedDB/Dexie, autenticação, sincronização, finalização ou exportações.

### Gates locais desta rodada

- ESLint: aprovado.
- TypeScript: aprovado.
- Vitest: `13 arquivos, 61 testes aprovados`.
- Build de produção com proxy local: aprovado.
- Playwright completo: `8 cenários aprovados`.
- Pytest: `56 testes aprovados`, com 2 avisos de depreciação das dependências FastAPI/Starlette/httpx.
- `git diff --check`: aprovado.
- Conferência manual local: dashboard, equipe e histórico sem overflow no viewport móvel; rail comum, hero, cartões, estados e CTAs presentes.

### Publicação confirmada

`main` e `origin/main` estão alinhadas em `bc46847`. A Vercel respondeu HTTP 200 e o CSS público contém `app-rail-kicker`, `app-page-shell`, `control-navy` e `metric-card--records`. O dashboard e o histórico foram conferidos visualmente no domínio público. O proxy `/backend-api/healthz` da Vercel e `https://inventory-api-6o8h.onrender.com/healthz` responderam `{"status":"ok"}`.

A validação física em Android real e iPhone/Safari continua pendente; Chromium local e navegador desktop não substituem esses dispositivos.

## Entrega integrada — terceira passada visual premium

Commit: `af4b55a feat: elevar direcao visual do inventario`.

A tela operacional recebeu uma direção visual mais ousada e profissional, sem alterar o comportamento da operação: rail navy/ciano com textura discreta, cabeçalho de coleta, indicadores com ícones e metadados, referência SAP como zona de decisão, formulário como foco principal e painel escuro para as etapas de sincronização, análise e finalização. A camada continua escopada ao frontend, preserva IndexedDB/Dexie como fonte primária e mantém a preferência `prefers-reduced-motion`.

### Gates locais desta rodada

- ESLint: aprovado.
- TypeScript: aprovado.
- Vitest: `13 arquivos, 61 testes aprovados`.
- Build de produção com proxy local: aprovado.
- Playwright visual: `2 cenários aprovados` nos viewports 390, 430, 768, 1024, 1366, 1440 e 1920px, sem overflow horizontal.
- Playwright completo: `8 cenários aprovados`.
- Pytest: `56 testes aprovados`, com 2 avisos de depreciação das dependências FastAPI/Starlette/httpx.
- `git diff --check`: aprovado.
- Conferência manual local: nova composição visível em mobile e operação sem console com erro.

### Limitações reais

- A validação física em Android real e iPhone/Safari continua pendente; Chromium local não substitui esses dispositivos.
- Publicação confirmada após a integração na `main`: a Vercel respondeu HTTP 200 e o CSS público contém `inventory-header-topline`, `inventory-navy` e `metric-card--records`.
- O health check `/backend-api/healthz` da Vercel e `/healthz` do Render responderam `{"status":"ok"}`; Render e Neon não foram alterados nesta rodada.

## Entrega integrada — refinamento visual operacional

Commit integrado: `0a5a5db` na `main` e enviado para `origin/main`.

O fluxo de inventário recebeu refinamento responsivo para mobile, tablet e desktop, com referência SAP posicionada antes do primeiro lançamento, painel único para sincronização/análise/finalização, estados de carregamento e feedback de salvamento, tela segura para inventário indisponível e cobertura visual operacional. IndexedDB, contratos de API, autenticação, sincronização, finalização irreversível e exportações foram preservados.

### Gates locais desta rodada

- ESLint: aprovado.
- TypeScript: aprovado.
- Vitest: `13 arquivos, 61 testes aprovados`.
- Build de produção local com proxy da API: aprovado.
- Playwright afetado: `5 cenários aprovados`.
- Playwright completo: `8 cenários aprovados`, incluindo offline e 100 lançamentos/exportações.
- Pytest: `56 testes aprovados`, com 2 avisos de depreciação das dependências FastAPI/Starlette/httpx.
- Verificação manual em `pnpm start`: `/acesso` e rota de inventário indisponível sem erros ou avisos no console.
- `git diff --check`: aprovado.

### Publicação e limitações

- Frontend público na Vercel respondeu HTTP 200 em `/acesso`; a folha pública contém o painel operacional e os estados do refinamento.
- A rewrite `/backend-api/healthz` e a API pública no Render responderam `{"status":"ok"}`.
- Não houve alteração de backend; Render e Neon não foram modificados nesta rodada.
- A validação física em Android real e iPhone/Safari continua pendente; Chromium local não substitui esses gates.

## Entrega integrada — segunda passada visual e microinterações

Commit integrado: `ac95ae5` na `main` e enviado para `origin/main`.

A tela operacional recebeu uma segunda camada visual, sem mudança de fluxo ou contrato: entrada escalonada dos blocos, etapa ativa mais evidente, linha de progresso no rail, barras de acento nos indicadores, estados com pontos de status, abertura animada dos painéis de controle, elevação nos cartões e brilho pontual no cabeçalho. A animação continua condicionada à preferência do navegador; `prefers-reduced-motion: reduce` desliga o movimento e mantém os sinais visuais estáticos.

### Gates locais desta rodada

- ESLint: aprovado.
- TypeScript: aprovado.
- Vitest: `13 arquivos, 61 testes aprovados`.
- Build de produção local com proxy da API: aprovado.
- Playwright afetado: `5 cenários aprovados`.
- Playwright completo: `8 cenários aprovados`.
- Pytest: `56 testes aprovados`, com 2 avisos de depreciação das dependências FastAPI/Starlette/httpx.
- `git diff --check`: aprovado.
- Verificação visual no navegador local e no site público: rail, painel único, acentos de cartão e indicadores de status presentes; o navegador usado na conferência sinalizou movimento reduzido.

### Publicação e limites

- O CSS público da Vercel contém `inventory-rail-enter`, `inventory-header-sheen` e `inventory-stage-reveal`.
- O frontend público respondeu e exibiu a nova camada visual no inventário aberto; Render e Neon não foram alterados nesta rodada.
- A validação física em Android real e iPhone/Safari continua pendente; Chromium local e navegador desktop não substituem esses gates.

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
