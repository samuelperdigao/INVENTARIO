# Status do projeto

## Entrega validada — animação de carregamento no login

Pull Request [#21](https://github.com/samuelperdigao/INVENTARIO/pull/21), branch
`feat/login-loading-animation`, commit de código `f29f140`.

- O login agora mostra uma tela animada enquanto a autenticação aguarda resposta, com a identidade azul do INVENTÁRIO.
- A mensagem avisa que a primeira conexão após um período sem uso pode demorar um pouco mais.
- O progresso é indeterminado, sem porcentagem simulada; `prefers-reduced-motion` é respeitado.
- Quality Gates do GitHub Actions, run #106: lint, TypeScript, Vitest, build de produção, Pytest, Alembic e Playwright concluídos com sucesso.
- Preview da Vercel concluído com sucesso; a rota `/acesso` carregou no Chrome desktop.
- Mudança somente no frontend; backend, banco, contratos e fluxos de autenticação não foram alterados.

Atualizado em 24/09/2026.

## Registro anterior — refinamento do dashboard desktop

Branch de trabalho: `feat/dashboard-desktop-redesign`, baseada na `main` em
`e9783ac`.

O desktop recebe um cabeçalho mais compacto, ação principal para iniciar
inventário, navegação lateral dimensionada para a altura da tela, inventários
abertos como foco da página e estado vazio compacto. Os quatro atalhos e o
estado vazio anterior continuam nos breakpoints menores; os estilos novos
entram a partir de 1200 px. A participação por código, o histórico, a equipe,
as pendências e a Administração mantêm os mesmos fluxos e acessos.

### Validação local

- ESLint: aprovado.
- TypeScript: aprovado.
- Vitest: 72 testes aprovados.
- Pytest: 63 testes aprovados, com 3 avisos já emitidos pelas dependências e
  configuração Alembic.
- Build de produção: aprovado.
- `git diff --check`: aprovado.
- Playwright local: bloqueado na inicialização do navegador. Os 12 cenários
  falharam antes de executar porque o Chromium não estava instalado; a
  instalação oficial recebeu um arquivo ZIP inválido de 0 MiB. Revalidar pelo
  workflow do GitHub Actions.

Nenhuma alteração foi feita em backend, banco de dados, autenticação,
permissões ou regras operacionais.

## Publicado: administração global

Pull Request `#18` integrado à `main` no commit `641f03d`, em 23/09/2026.
A permissão global, as rotas administrativas, o painel responsivo, os ciclos
operacionais, a auditoria, as versões oficiais de relatórios e a proteção de
pendências offline estão publicados. O procedimento da primeira conta está em
`docs/ADMINISTRACAO.md`.

Quality Gates #98, #99 e #100 passaram. O run #100 foi concluído após repetir
o job de navegador: lint, TypeScript, build, Vitest (`72 testes`), Pytest
(`63 testes`, 3 avisos de dependências), Alembic e Playwright (`12 testes`).
O deploy da Vercel está concluído. A API Render está `live` no commit integrado.

A conexão com o Neon foi restaurada. Um ponto de recuperação foi confirmado
antes da migration, e a revision `0009_system_admin` foi aplicada pelo fluxo
preparado do Neon com o SQL correspondente à migration Alembic. Estado final:
22 inventários, 122 itens e 7 versões de relatórios preservados; tabelas de
administração e auditoria vazias.

Smoke de produção: Render `/healthz` respondeu HTTP 200 e a rewrite da Vercel
`/backend-api/healthz` retornou `{"status":"ok"}`. A conta atual recebe
“Acesso não autorizado” em `/admin`, conforme esperado enquanto não houver
uma primeira conta administrativa. A concessão continua aguardando o e-mail
da conta já cadastrada.

Durante o rollout, uma instância em substituição registrou erro de resolução
Alembic para a revision `0009_system_admin`. A instância nova concluiu o
startup e o deploy ficou `live`; não houve novos logs de erro após a publicação.

Atualizado em 23/09/2026.

## Entrega publicada — inventário vazio e compartilhamento moderno
Commit integrado: `2766981` em `main` e `origin/main`. O push foi concluído e aVercel publicou o frontend automaticamente; o smoke de produção confirmou as
superfícies públicas da Vercel e do Render.
Inventários sem lançamentos agora podem ser finalizados. O fluxo sincroniza
antes da finalização, recarrega a revisão e o token locais atuais e bloqueia a
operação quando há conflito ou quando outro dispositivo já finalizou o
inventário. O relatório vazio é gerado oficialmente com totais zerados.

Inventários vazios também podem ser excluídos pelo criador em fluxo
offline-first: a remoção cria um tombstone local imediato, é sincronizada
posteriormente e só remove os registros relacionados após confirmação central.
Participantes não recebem essa ação, e o servidor rejeita a exclusão quando já
existem lançamentos centrais. Tentativas pendentes são reconciliadas ao abrir o
dashboard; uma tentativa de retry enquanto o dashboard permanece aberto após o
retorno da conexão fica como melhoria posterior.

O compartilhamento nativo inclui o link `.xlsx` no campo de URL e no texto do
aplicativo de e-mail. O endpoint de envio de relatório mantém os anexos e
acrescenta ao corpo links temporários assinados para `.xlsx` e `.docx`. Não
houve alteração de schema ou migration.

### Gates locais desta rodada

- TypeScript: aprovado.
- ESLint: aprovado.
- Vitest: `14 arquivos, 69 testes aprovados`.
- Pytest: `59 testes aprovados`, com 2 avisos de depreciação das dependências FastAPI/Starlette/httpx.
- Build de produção: aprovado, incluindo o service worker.
- Chromium do Playwright: instalado/verificado.
- Playwright completo: `9 cenários aprovados`, incluindo operação offline, sincronização, histórico móvel, finalização/exportações e 100 lançamentos.
- `git diff --check`: aprovado após a atualização desta documentação e antes do commit.
- Quality Gates do commit `2766981`: aprovado no GitHub Actions (`35470279570`).
- Production Smoke do commit `2766981`: aprovado no GitHub Actions (`35470279619`).

### Publicação e limitações

- A validação física em Android real e iPhone/Safari continua pendente; Chromium local não substitui esses gates.
- Concorrência de produção em PostgreSQL/Neon continua sem exercício físico nesta rodada.
- Frontend Vercel `/` e `/acesso`: HTTP 200.
- Rewrite Vercel `/backend-api/healthz`: HTTP 200 com `{"status":"ok"}`.
- API Render `/healthz`: HTTP 200 com `{"status":"ok"}`.
- O retry automático de exclusões pendentes enquanto o dashboard permanece aberto após o retorno da conexão continua como melhoria posterior.

## Entrega em integração — sincronização silenciosa do inventário

Commits integrados: `338f5e7`, `98427ba` e `f541bb1` em `main`/`origin/main`.

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
- Quality Gates do commit `f541bb1`: aprovado no GitHub Actions.
- Production Smoke do commit `f541bb1`: aprovado no GitHub Actions.

O servidor de teste do Playwright passou a compilar o frontend apontando para a API local antes de iniciar. Isso evita que a suíte use acidentalmente o proxy público do Render durante a validação local.

### Limitações e publicação

- A validação física em Android real e iPhone/Safari continua pendente; Chromium local e navegador desktop não substituem esses gates.
- Concorrência de produção em PostgreSQL/Neon continua sem exercício físico nesta rodada; os testes backend seguem usando o ambiente local previsto.
- `main` e `origin/main` estão alinhadas; a implementação funcional está em `f541bb1`.
- Frontend Vercel `/acesso`: HTTP 200.
- Rewrite Vercel `/backend-api/healthz`: HTTP 200 com `{"status":"ok"}`.
- API Render `/healthz`: HTTP 200 com `{"status":"ok"}`.
- Não houve alteração de schema, Render ou Neon nesta rodada.
## Entrega em integração — identidade visual transversalCommits integrados: `caabac0 feat: unificar identidade visual do aplicativo` e `bc46847 docs: registrar identidade visual transversal`.

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
- Pytest: `56 testes aprovados`, c…1425 tokens truncated…droid/iPhone Safari continuam sendo gates físicos pendentes.

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
- Playwright: `6 cenários aprovados` com `BACKEND_PROXY_URL=http://127.0.0.1:8000`; os cenários cobrem login, análise, dashboard, histórico, offline, sincronização e exportações.- Teste backend específico da referência validou parser, normalização, preview, importação, substituição, remoção, IDOR e conciliação nos quatro formatos.
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
- O endpoint `/api/v1/inventories/{id}/export/excel` usa `.xls` por padrão e aceita `?format=xlsx`.- O teste de volume local cobre 100 registros, 95 lotes, 1.269 peças, 91 lotes OK e 4 lotes para conferência nos quatro formatos.- Os testes verificam assinatura OLE, ZIP, abas, ausência de filtros e linhas de grade, MIME, `Content-Disposition`, `Content-Length`, totais iguais e download como Blob.
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
