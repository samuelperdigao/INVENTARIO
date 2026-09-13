# Status do projeto

Atualizado em 13/09/2026.

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
- Camadas A1 a A10, lote numérico, autoria e confirmação de duplicidade.
- Sincronização incremental, idempotência, tombstones e conflitos.
- Análise de lotes fragmentados.
- Finalização central irreversível, histórico e exportações PDF, Excel e Word.
- Compartilhamento nativo e links temporários assinados.

## Auditoria de manutenção

Branch: `chore/repository-cleanup`.

- Estrutura de diretórios compatível com o porte atual; nenhuma movimentação ampla necessária.
- Nenhum artefato gerado ou arquivo de ambiente rastreado.
- Nenhuma duplicação exata de arquivo encontrada.
- Cadeia Alembic linear, com upgrade, downgrade até base e novo upgrade aprovados em SQLite temporário.
- Três dependências diretas redundantes removidas: `@eslint/eslintrc`, `@types/jsdom` e `playwright`. Dependências transitivas necessárias permanecem resolvidas.
- Configuração de base da API centralizada em `lib/api-config.ts`.
- Padrões de cache, cobertura, IDE, sistema operacional, logs e build adicionados ao `.gitignore`.
- Quality Gates configurados para Pull Requests e pushes na `main`.
- Documentação histórica conflitante consolidada nos documentos oficiais.

## Gates locais da manutenção

- `pnpm install --frozen-lockfile`: aprovado.
- `pnpm lint`: aprovado.
- `pnpm typecheck`: aprovado.
- Vitest: 8 arquivos e 22 testes aprovados.
- Pytest: 32 testes aprovados, com 2 avisos de depreciação de dependências.
- Alembic SQLite: upgrade até `0007`, downgrade até base e novo upgrade aprovados.
- `pnpm build`: aprovado na baseline; repetir após a consolidação documental.
- Playwright: código não executado localmente porque o CDN do Chromium expirou repetidamente durante o download. O workflow do Pull Request deve executar os 4 cenários antes do merge.

## Pendências

- Executar os 4 cenários Playwright em ambiente com Chromium disponível.
- Confirmar todos os checks do Pull Request antes de integrar.
- Validar a PWA em Android físico.
- Validar instalação, cache e compartilhamento em Safari/iPhone físico.
- Planejar a separação incremental dos routers de `backend/app/main.py` somente junto de nova evolução funcional e cobertura de contrato.

## Documentos oficiais

- Regras vigentes: `docs/REGRAS_NEGOCIO.md`.
- Arquitetura: `docs/ARQUITETURA.md`.
- Deploy: `docs/DEPLOY.md`.
- Especificação histórica: `docs/ESPECIFICACAO_INVENTARIO_V1.md`.
- Decisão de camadas e duplicidade: `docs/CAMADAS_DUPLICIDADE_V2.md`.
