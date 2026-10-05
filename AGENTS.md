# Instruções do repositório

## Operação

- Execute comandos de terminal pelo RTK quando houver filtro compatível.
- Leia este arquivo e os documentos apontados em `README.md` antes de alterar comportamento.
- Trate `main` e a versão publicada como baseline estável.
- Trabalhe em branch própria, mantenha commits pequenos e não reescreva o histórico da `main`.
- Não altere Neon, Render ou Vercel para diagnósticos ou tarefas locais sem alteração; mudanças concluídas seguem o ciclo obrigatório de entrega abaixo.
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

## Ciclo obrigatório de entrega

- Toda alteração integrada em `main` entra por Pull Request de uma branch própria; nunca fazer commit ou push diretamente na `main`. Um pedido explícito de commit autoriza criar o commit; um pedido explícito de PR autoriza enviar a branch e abrir a PR. Não acrescentar uma etapa não solicitada como bloqueio artificial.
- Antes de integrar, consultar a proteção efetiva da `main` e os rulesets do GitHub. Se o GitHub realmente exigir aprovação, branch atualizada ou o check `validate`, respeitar essas exigências. Se a proteção não estiver ativa, não inventar uma aprovação obrigatória com base apenas na documentação; com autorização explícita do usuário e `validate` aprovado, a integração pode prosseguir.
- A proteção recomendada da `main`, incluindo bloqueio de force push e exclusão, está em `docs/DEPLOY.md`. Documentar a recomendação não aplica a configuração no GitHub; sua aplicação exige confirmação explícita.
- Merge e publicação devem respeitar a autorização da tarefa. Se a tarefa terminar na PR, não integrar nem fazer deploy; se o usuário autorizou merge ou deploy, executar a etapa correspondente depois dos pré-requisitos reais, sem esperar um evento que não seja necessário.
- Depois do merge, acompanhar os deploys dos provedores afetados e validar a versão publicada. O frontend usa Vercel e a API usa Render. `Production Smoke` é validação pós-merge ou manual, não check obrigatório de PR enquanto não for gerado nesse evento.
- O sucesso de `Production Smoke` disparado pelo push não comprova sozinho que o novo commit foi publicado. Confirmar a revisão do deploy e validar novamente depois de sua conclusão; registrar bloqueios reais em `docs/STATUS.md`.
- Antes do merge, fazer fetch e comparar os commits, preservando trabalho mais novo; atualizar a branch de trabalho sem reescrever o histórico da `main`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
