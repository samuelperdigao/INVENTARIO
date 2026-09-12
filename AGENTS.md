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

## Fase 2.2 - publicacao controlada

- A arquitetura preparada e Vercel (frontend Next.js), Render (FastAPI via `render.yaml`) e Neon (PostgreSQL gerenciado). Ela nao esta provisionada enquanto nao houver autorizacao externa, contas e dominio.
- Use `https://app.<dominio>` para o frontend e `https://api.<dominio>` para a API. Ambos devem usar o mesmo dominio raiz para manter o refresh cookie `Secure`, `HttpOnly` e `SameSite=Strict` sem relaxar essa protecao.
- No plano gratuito do Render, execute `alembic upgrade head` como gate manual e auditavel contra o PostgreSQL antes de liberar a API. Nao substitua esse fluxo por criacao manual de schema; o `healthz` so responde 200 quando consegue consultar o banco.
- `INVENTORY_DATABASE_URL`, `INVENTORY_AUTH_SECRET` e o valor final de `INVENTORY_CORS_ORIGINS` sao secrets/configuracoes do provedor; nunca entram em `.env.example`, Git ou logs.

## Fase 2.1 — segurança de acesso

- Sincronização central exige bearer token e token interno do inventário. A criação central exige equipe; um participante já registrado pode usar seu token individual. O código amigável de seis dígitos nunca é autenticação.
- Senhas usam `scrypt`; o token de acesso é curto e o token de renovação é opaco, revogável e enviado somente em cookie `HttpOnly`.
- Em produção, `INVENTORY_ENV=production`, `INVENTORY_DATABASE_URL` PostgreSQL, `INVENTORY_AUTH_SECRET` forte e `INVENTORY_CORS_ORIGINS` HTTPS explícitas são obrigatórios. Não contorne as validações de inicialização.
- Toda mudança de schema deve passar por Alembic. Inventários herdados sem `team_id` são preservados, mas devem ser associados administrativamente antes de qualquer acesso central.
- Fase 2.1 está encerrada localmente no checkpoint `feat: add authentication teams and protected sync`. A Fase 2.2 limita-se ao provisionamento e à validação real de PostgreSQL, segredos, domínio/HTTPS, CORS, publicação e smoke test; não introduza funcionalidades operacionais nela.

## V1 estrutural — relatório, finalização e histórico

- Exportações, finalização e histórico foram autorizados e implementados localmente após a Fase 2.1. O backend é a autoridade para finalizar, armazenar o snapshot do relatório e servir exportações; nunca “finalize” apenas no IndexedDB.
- Uma finalização exige inventário central sincronizado, sessão, autorização e token interno. Ela é irreversível nesta V1: não invente reabertura.
- Excel, PDF e Word devem receber exclusivamente o modelo em `backend/app/reports.py`; regras de classificação continuam em `backend/app/engine.py`.
- A migration `0004_inventory_reports_finalization` é obrigatória junto às anteriores antes da API publicada. PostgreSQL real e deploy continuam pendências externas.

## Fluxo de acesso e compartilhamento V1

- Cadastro aceita qualquer e-mail sintaticamente válido, libera a conta imediatamente e não cria equipe automaticamente.
- Recuperação de senha exige o e-mail e o NP pessoal de exatamente oito dígitos definido no cadastro. O NP usa hash `scrypt` com segredo adicional, nunca é devolvido pela API e recebe bloqueio temporário após cinco erros.
- As migrations até `0006_recovery_pin` são obrigatórias. `owner_user_id` continua equivalente ao criador; `finalized_by_user_id` registra o encerramento.
- Nunca mostre UUID ou token interno no fluxo normal. O usuário informa apenas o código de participação de seis dígitos; o backend emite token opaco individual e registra o participante.
- Relatórios finalizados autorizados não exigem token manual. Itens abertos e sincronização continuam protegidos por token interno.
- SMTP protegido permanece necessário somente para o envio opcional de relatórios por e-mail. Cadastro e recuperação não dependem de mensagens ou códigos enviados.
