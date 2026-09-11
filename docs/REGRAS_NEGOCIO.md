# Regras de negócio — núcleo e análise

## Produção e transporte

- A publicação usa HTTPS para frontend e API. `app.<domínio>` e `api.<domínio>` devem compartilhar o mesmo domínio raiz, para que a sessão renovável continue protegida por `Secure`, `HttpOnly` e `SameSite=Strict`.
- Em produção, o healthcheck executa uma consulta simples no PostgreSQL e responde 503 genérico quando a persistência não estiver disponível. Nunca inclui URL, credenciais ou detalhes de banco na resposta.
- CORS aceita apenas a origem HTTPS explícita do frontend publicado e credenciais. Curingas e HTTP não são configurações válidas em produção.

## Dados locais

- Cada inventário recebe UUIDv7, data local do dispositivo no formato `YYYY-MM-DD`, timestamps, revisão, `syncBaseRevision`, `syncStatus` e `tombstone`.
- Cada lançamento também recebe UUIDv7, timestamps, revisão, `syncBaseRevision`, `syncStatus` e tombstone. Lote e vão são texto; espaços externos são ignorados somente para validação e para a chave de consolidação.
- Quantidade é inteiro positivo. EF e DE são os únicos lados válidos.
- Registros não são mesclados na tela. Inclusão, edição e exclusão atualizam o inventário e o lançamento na mesma transação IndexedDB. Excluir cria um tombstone e oculta o registro.

## Operação

- Um inventário novo começa sem lado selecionado.
- Depois de salvar um lançamento, lado e vão ficam selecionados, lote e quantidade são limpos e o foco retorna ao lote.
- A lista sempre apresenta EF antes de DE; vãos e lotes usam ordenação natural.

## Motor determinístico

- A chave de local é `(lado, vão normalizado)` e a de lote é o lote normalizado.
- Ocorrências no mesmo local são consolidadas apenas no relatório; os lançamentos brutos continuam individuais.
- Um lote em um local é `OK`.
- Mais de um local recebe marcador `FRAGMENTADO`.
- Existe local principal apenas quando a maior concentração é única e é pelo menos três vezes a soma dos outros locais.
- Com local principal confiável, divergência total igual a 1 é `PEÇA_SOLTEIRA`; maior que 1 é `GRUPO_DESLOCADO`.
- Empates, `11 + 9` e qualquer distribuição sem confiança são `DISTRIBUIÇÃO_AMBÍGUA`.
- `REVISAR` existe no contrato para regras futuras e não é inferido nesta versão.

## Análise online e cache local

- O FastAPI valida o payload e calcula uma prévia sem persistir dados remotos.
- Um cálculo novo depende de conexão; lançamento, edição e exclusão nunca dependem da rede.
- O relatório é salvo pelo par `(inventoryId, revision)`. Sem cache da revisão atual, a tela pode exibir apenas o último resultado do mesmo inventário, identificado como possivelmente desatualizado.

## Sincronização central

- A fonte de verdade da operação continua sendo IndexedDB: todo lançamento, edição e tombstone é concluído localmente antes de qualquer chamada de rede.
- Cada inventário possui um código de sincronização gerado localmente. O servidor armazena apenas o hash desse código e exige o valor no cabeçalho para ler ou gravar aquele inventário. O código deve ser tratado como senha ao conectá-lo em outro dispositivo.
- O dispositivo guarda sua identidade e o cursor de eventos somente no IndexedDB. O cursor permite buscar apenas as alterações centrais ainda não recebidas.
- Todo registro tem `revision` e `syncBaseRevision`. O servidor aceita uma alteração somente quando a revisão-base corresponde à versão central; repetir uma requisição já aceita é idempotente e não cria duplicata.
- Inclusões usam IDs UUIDv7 gerados no cliente. Tombstones também são sincronizados; uma exclusão não some por falta temporária de rede.
- Em concorrência incompatível, o servidor preserva o payload recebido e a versão central em auditoria, responde com conflito e o cliente preserva as duas versões. O operador escolhe manter sua versão ou usar a versão central; nenhuma delas é apagada silenciosamente.
- A revisão local do inventário também é incrementada ao receber lançamento remoto, invalidando corretamente o cache de análise sem transformar a alteração remota em uma nova pendência.

## Identidade, equipes e acesso central

- Criar, editar e excluir lançamentos continua local e offline; autenticação só é necessária no momento posterior da sincronização central.
- Uma conta possui e-mail normalizado, nome visível e senha armazenada exclusivamente como hash `scrypt` com salt individual. A senha nunca integra a sincronização, o IndexedDB ou o banco em texto puro.
- Ao criar uma conta, o sistema cria sua primeira equipe e a associação `ADMIN`. Uma equipe tem membros `ADMIN` (responsável) ou `OPERATOR`.
- Inventário central pertence a uma equipe e registra o usuário que o publicou inicialmente. Um membro pode sincronizar inventários de sua equipe; só `ADMIN` pode incluir membros.
- `POST /api/v1/sync` exige simultaneamente bearer token válido, associação à equipe escolhida e `X-Inventory-Sync-Token`. UUID, código de sincronização ou cursor isoladamente não concedem leitura nem escrita.
- Se o inventário não pertencer à equipe autorizada, a API responde como não encontrado, sem confirmar sua existência. Conflitos, idempotência, tombstones e `syncBaseRevision` mantêm as mesmas regras da Fase 2.
- Esta regra de identidade e autorização está encerrada e validada localmente na Fase 2.1. A próxima etapa não altera o domínio: apenas valida a mesma proteção em PostgreSQL, HTTPS e domínio reais.
