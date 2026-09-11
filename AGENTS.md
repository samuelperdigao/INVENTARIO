# Instruções do repositório

- Execute comandos de terminal pelo `rtk`.
- O frontend é Next.js/TypeScript e fica na raiz; o motor e a API FastAPI ficam em `backend/`.
- IndexedDB continua sendo a fonte primária da operação local e offline. Lançamento, edição e exclusão jamais podem depender da rede; a sincronização central apenas replica alterações já preservadas localmente.
- Preserve os lançamentos individuais; a consolidação pertence exclusivamente ao motor Python.
- Antes de declarar pronto, execute os gates documentados no README e registre limitações reais em `docs/STATUS.md`.
- `pnpm dev` atende em `http://localhost:3000`; a análise nova também requer o FastAPI em `http://localhost:8000`. O service worker é validado com `pnpm build` seguido de `pnpm start`, não em desenvolvimento.
- Fase 1 está concluída. Fase 2 (persistência central, Alembic, sincronização e conflitos) foi implementada e validada localmente; PostgreSQL real, HTTPS, CORS, autenticação/autorização e validação física continuam pendentes.
- Não iniciar infraestrutura de produção nem implementar exportações, finalização, histórico completo ou autenticação/autorização sem solicitação explícita. Preserve as regras de segurança, offline, testes e documentação em qualquer alteração futura.


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
