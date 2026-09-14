# Status do projeto

Atualizado em 14/09/2026.

## Produção

- `main` é a baseline estável.
- Frontend ativo na Vercel: `https://inventario-lpe.vercel.app`.
- API ativa no Render: `https://inventory-api-6o8h.onrender.com`.
- PostgreSQL ativo no Neon.
- Migration `0007_recovery_pin` registrada como aplicada no ambiente principal.
- O workflow `Production Smoke` da `main` em `acc1cff` concluiu com sucesso.

## Funcionalidades concluídas

- Operação local e offline com IndexedDB.
- Autenticação, sessão renovável e recuperação por NP de oito dígitos.
- Inventário individual sem equipe obrigatória.
- Equipes com papéis `ADMIN` e `OPERATOR`.
- Participação em inventário aberto por código de seis dígitos.
- Camada opcional nos lançamentos; quando informada, aceita A1 a A10.
- Lote numérico, autoria e confirmação de duplicidade.
- Sincronização incremental, idempotência, tombstones e conflitos.
- Análise determinística de lotes com apresentação operacional para o operador.
- Finalização central irreversível, histórico e exportações PDF, Excel e Word.
- Exportação `.xls` BIFF8 gerada diretamente no backend e apresentada como padrão para os computadores antigos da equipe.
- Exportação `.xlsx` moderna preservada, com fonte única de dados, quatro abas na ordem oficial e contratos binários de MIME, nome e tamanho.
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

## Pendências

- Publicar o branch e repetir o teste funcional de volume com 100 lançamentos no aplicativo publicado.
- Fazer conferência visual final dos arquivos em Excel antigo, Excel moderno, PDF e Word no ambiente da equipe.
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
