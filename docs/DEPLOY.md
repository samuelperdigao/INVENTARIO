# Deploy

## Produção atual

| Componente | Provedor | Endereço |
|---|---|---|
| Frontend | Vercel | `https://inventario-lpe.vercel.app` |
| API | Render | `https://inventory-api-6o8h.onrender.com` |
| Banco | Neon | PostgreSQL, URL armazenada somente no Render |

O navegador usa `https://inventario-lpe.vercel.app/backend-api/*`. A rewrite do Next.js encaminha essas requisições para o Render e mantém o fluxo de sessão no mesmo origin observado pelo navegador.

## Variáveis do frontend

| Variável | Escopo | Uso |
|---|---|---|
| `BACKEND_PROXY_URL` | Servidor/build Vercel | Destino privado da rewrite `/backend-api` |
| `NEXT_PUBLIC_ANALYSIS_API_BASE_URL` | Público, build | Base opcional do cliente de análise |
| `NEXT_PUBLIC_SYNC_API_BASE_URL` | Público, build | Base opcional dos demais clientes |
| `INVENTORY_ENV` | Build Vercel | Ativa headers de produção |

Quando as duas variáveis públicas não existem, o frontend usa `/backend-api`. Valores `NEXT_PUBLIC_*` são incorporados ao bundle e nunca recebem segredos.

## Variáveis da API

| Variável | Obrigatória em produção | Observação |
|---|---|---|
| `INVENTORY_ENV=production` | Sim | Ativa validações rígidas |
| `INVENTORY_DATABASE_URL` | Sim | `postgresql+psycopg://...` com SSL do provedor |
| `INVENTORY_AUTH_SECRET` | Sim | Aleatório, mínimo de 32 caracteres |
| `INVENTORY_CORS_ORIGINS` | Sim | Lista de origens HTTPS explícitas |
| `INVENTORY_ACCESS_TOKEN_MINUTES` | Não | Padrão 15 |
| `INVENTORY_REFRESH_SESSION_DAYS` | Não | Padrão 14 |
| `INVENTORY_RECOVERY_PIN_MAX_ATTEMPTS` | Não | Padrão 5 |
| `INVENTORY_RECOVERY_PIN_LOCK_MINUTES` | Não | Padrão 15 |
| `INVENTORY_EMAIL_MODE` | Sim | `smtp` ou `smtp2go` |
| `INVENTORY_SMTP2GO_API_KEY` | Condicional | Obrigatória com `smtp2go` |
| `INVENTORY_SMTP_HOST`, `INVENTORY_SMTP_PORT` | Condicional | Obrigatórias com SMTP tradicional |
| `INVENTORY_SMTP_USERNAME`, `INVENTORY_SMTP_PASSWORD` | Condicional | Credenciais do SMTP tradicional |
| `INVENTORY_SMTP_FROM_EMAIL` | Sim para envio | Remetente autorizado |
| `INVENTORY_SMTP_SECURITY` | Condicional | `starttls` ou `ssl` em produção |
| `INVENTORY_EMAIL_ATTACHMENT_MAX_MB` | Não | Padrão 15 |
| `INVENTORY_REFERENCE_MAX_MB` | Não | Limite do `.xlsx` da referência SAP; padrão 15 |
| `INVENTORY_REFERENCE_MAX_ROWS` | Não | Limite de linhas lidas; padrão 250000 |

Não copie valores reais para Git, documentação, logs, issues ou Pull Requests.

## Ordem de publicação

Para o painel administrativo, leia `docs/ADMINISTRACAO.md`. A revisão
`0009_system_admin` precisa estar aplicada antes da publicação do backend:
o login consulta a nova tabela `system_admins`. Valide a migration em uma
branch de banco, faça snapshot ou backup verificado e use conexão direta para
o Alembic. Não atribua a primeira permissão sem o endereço indicado pelo usuário.

1. Criar a branch de release a partir da `main` atual.
2. Executar todos os quality gates locais.
3. Abrir Pull Request e aguardar o workflow `Quality Gates` concluir com sucesso.
4. Confirmar a revisão atual `0008_inventory_lot_references`, criar e verificar um ponto de recuperação, e aplicar `0009_system_admin` no Neon antes do merge. Consultar `docs/ADMINISTRACAO.md`.
5. Confirmar `alembic current` na revisão esperada.
6. Integrar o Pull Request sem force push.
7. Aguardar os deploys automáticos de Render e Vercel.
8. Confirmar o workflow `Production Smoke` e fazer verificação manual do fluxo alterado.

## Comandos de migration

```bash
read -r -s INVENTORY_DATABASE_URL
export INVENTORY_DATABASE_URL
backend/.venv/bin/python -m alembic -c backend/alembic.ini current
backend/.venv/bin/python -m alembic -c backend/alembic.ini upgrade head
```

Use a variável apenas no processo confiável. Não registre a linha real no histórico do shell compartilhado.

## Smoke test mínimo

- `GET /healthz` retorna 200 e `{"status":"ok"}`.
- Landing page e `/acesso` carregam por HTTPS.
- `/backend-api/healthz` funciona pelo frontend.
- Headers HSTS e `X-Content-Type-Options` estão presentes.
- Cadastro rejeita NP com tamanho diferente de oito dígitos.
- Refresh sem sessão retorna 401.
- Login, sincronização, participação, finalização e exportação do fluxo alterado são verificados quando aplicável.
- Exportação Excel: sem `format`, o endpoint `/backend-api/api/v1/inventories/{id}/export/excel` deve retornar `.xls` com MIME `application/vnd.ms-excel`; `?format=xlsx` deve retornar `.xlsx` com MIME OOXML.
- Para cada arquivo, conferir `Content-Disposition`, `Content-Length`, tamanho não nulo e extensão coerente com o conteúdo.
- Com referência SAP ativa, confirmar prévia/importação de `.xlsx` somente pela coluna `Lote` ou `Lotes`, rejeição clara de cabeçalho ausente/duplicado e linhas inválidas, consulta de pertencimento de lote e a seção/aba `CONCILIAÇÃO`; confirmar também que um lote válido fora da referência continua sendo lançado.

## Rollback

- Reverter o commit ou Pull Request da aplicação e redeployar a revisão anterior.
- Não executar `alembic downgrade` automaticamente.
- Se uma migration não destrutiva já foi aplicada, mantenha colunas ou tabelas compatíveis até uma migration corretiva planejada.
- Em incidente de banco, interrompa novas escritas, preserve logs sem segredos e restaure pelo mecanismo do provedor.
