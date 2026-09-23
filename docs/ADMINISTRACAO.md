# Painel administrativo global

## Escopo e autorização

- A interface fica em `/admin`. Somente contas presentes em `system_admins` acessam as rotas `/api/v1/admin/*`. Cada requisição consulta a permissão no banco.
- O papel `ADMIN` de equipe não concede administração global. Cadastro, login e recuperação de senha não atribuem essa permissão.
- Usuários comuns continuam lançando e sincronizando no IndexedDB sem depender da área administrativa.
- Inventários abertos e finalizados podem ser consultados, filtrados e exportados pelo administrador. A exclusão é lógica, exige justificativa e mantém auditoria e relatórios anteriores.

## Consistência e ciclos

- Cada escrita administrativa informa revisão e geração esperadas. O servidor bloqueia a linha do inventário na transação e devolve HTTP 409 se houve alteração concorrente.
- A geração operacional começa em 1. Reabrir incrementa a geração e publica eventos para o inventário e seus lançamentos. Um dispositivo antigo pode ler a geração nova, mas escritas com geração anterior não são aplicadas.
- Pendências locais antigas viram conflitos no IndexedDB. O usuário pode usar a versão central e, depois, incorporar explicitamente lançamentos da versão local. Inventários excluídos são distribuídos como tombstones; nenhuma escrita posterior os recria.
- O painel `/pendencias` permite consultar e exportar em CSV lançamentos locais retidos, inclusive quando o inventário foi excluído centralmente.
- Correções de inventários finalizados não liberam edição operacional. Cada correção recalcula o relatório oficial e grava uma nova versão imutável em `admin_report_versions`. A migration copia os snapshots finalizados preexistentes para a versão 1.
- Finalizações após reabertura criam outra versão. Versões anteriores podem ser consultadas e exportadas nos quatro formatos pela interface administrativa.
- A transferência muda somente o responsável daquele inventário. Os autores dos lançamentos continuam registrados. O novo responsável vê o inventário no dashboard e recebe uma credencial de acesso específica da própria conta, sem expor o token anterior.
- Importação SAP usa o parser existente: `.xlsx`, coluna `Lotes`, dez dígitos com início 27 ou 28. Peso e demais colunas não são persistidos. Lotes fora da referência continuam lançáveis.

## Primeira conta administrativa

Execute somente depois da migration `0009_system_admin`, em um terminal confiável conectado ao banco correto. O usuário informará posteriormente o endereço da conta já cadastrada.

```bash
PYTHONPATH=backend backend/.venv/bin/python -m app.grant_first_admin --email endereco-da-conta
```

O comando verifica se a conta existe, exige que o operador digite o e-mail completo e recusa atribuir uma segunda primeira permissão. Não pede senha pessoal. Reabra a sessão no aplicativo após a concessão. Nunca registre a URL do banco, senhas ou tokens no Git ou no histórico do terminal.

## Ordem obrigatória da publicação

1. Validar a migration em uma cópia isolada do banco, incluindo finalizações existentes.
2. Confirmar um ponto de recuperação do banco de produção e executar `alembic upgrade head` com conexão PostgreSQL direta, antes de publicar código que consulta `system_admins`.
3. Conferir `alembic current` em `0009_system_admin` e comparar contagens de inventários e versões preservadas.
4. Integrar a branch depois dos gates locais e do GitHub Actions. Aguardar deploy automático do Render e da Vercel.
5. Verificar `/healthz`, `/backend-api/healthz`, acesso negado para conta comum e fluxos operacionais. Não efetuar alterações destrutivas em inventários reais para o smoke.
6. Somente após o e-mail da conta ser informado, executar o procedimento da primeira conta administrativa.

Não publique a nova API antes da migration: autenticação passa a consultar `system_admins` e uma tabela ausente derrubaria login de todos os usuários.

## Limites operacionais

- A lista de comparação SAP apresenta lotes previstos em páginas de 50 e até 100 lotes físicos fora da referência por busca. Relatórios oficiais abrangem a referência inteira.
- Lançamentos offline de inventários excluídos permanecem locais para conferência/exportação; a primeira versão não oferece restauração de inventários excluídos.
- Revogar ou conceder administradores adicionais exige procedimento próprio posterior. O painel não gerencia contas.
