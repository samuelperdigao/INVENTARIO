# Instruções do repositório

- Execute comandos de terminal pelo `rtk`.
- O frontend é Next.js/TypeScript e fica na raiz; o motor e a API FastAPI ficam em `backend/`.
- IndexedDB é a fonte de dados da entrega atual. Não adicione sincronização, banco central, exportação ou finalização sem uma solicitação explícita.
- Preserve os lançamentos individuais; a consolidação pertence exclusivamente ao motor Python.
- Antes de declarar pronto, execute os gates documentados no README e registre limitações reais em `docs/STATUS.md`.
- `pnpm dev` atende em `http://localhost:3000`; a análise nova também requer o FastAPI em `http://localhost:8000`. O service worker é validado com `pnpm build` seguido de `pnpm start`, não em desenvolvimento.
- A Fase 2 ainda não começou. Não introduza sincronização, PostgreSQL, exportações, finalização, histórico ou autenticação sem autorização explícita.


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
