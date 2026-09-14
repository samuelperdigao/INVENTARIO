# Instruções do repositório

## Operação

- Execute comandos de terminal pelo RTK quando houver filtro compatível.
- Leia este arquivo e os documentos apontados em `README.md` antes de alterar comportamento.
- Trate `main` e a versão publicada como baseline estável.
- Trabalhe em branch própria, mantenha commits pequenos e não reescreva o histórico da `main`.
- Não altere Neon, Render ou Vercel para tarefas locais de manutenção.
- Antes de integrar, execute todos os gates do `README.md` e registre limitações reais em `docs/STATUS.md`.

## Regras técnicas obrigatórias

- O frontend Next.js/TypeScript fica na raiz; a API FastAPI fica em `backend/`.
- IndexedDB é a fonte primária da operação local e offline. Lançar, editar e excluir nunca pode depender da rede.
- A sincronização central replica alterações já preservadas localmente e deve manter cursor, revisão, idempotência, tombstones e conflitos.
- Lançamentos individuais não são mesclados na interface. A consolidação pertence ao motor Python e a `backend/app/reports.py`.
- Alterações de schema exigem nova migration Alembic. Nunca reescreva uma migration aplicada em produção.
- Nunca exponha UUID, token interno, bearer token, NP, senha ou segredo de infraestrutura na interface, documentação ou logs.
- Não altere contratos de API, regras de negócio, autenticação, autorização ou finalização sem cobertura de testes e solicitação compatível.
- A finalização da V1 é irreversível. Não implemente reabertura implicitamente.

## Desenvolvimento e produção

- Desenvolvimento: frontend em `http://localhost:3000` e API em `http://localhost:8000`.
- Produção: frontend na Vercel, API no Render e PostgreSQL no Neon.
- O frontend usa `/backend-api` como proxy same-origin quando URLs públicas não forem fornecidas.
- Secrets de produção existem somente nos provedores. `.env.example` contém apenas placeholders.
- O service worker é validado com `pnpm build` e `pnpm start`; desenvolvimento não registra o worker.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
