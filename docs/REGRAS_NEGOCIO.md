# Regras de negócio — núcleo e análise

## Relatório, finalização e histórico

- O modelo consolidado único contém registros individuais ordenados, lotes consolidados, locais, classificação, local principal, divergências, recomendações e resumo. Excel, PDF e Word apenas o apresentam.
- A finalização é central e exige uma revisão sincronizada. Ela gera e preserva o snapshot do relatório, registra `finalized_at`, muda o estado para `FINISHED` e bloqueia novas alterações por sincronização.
- A V1 não define reabertura. Um inventário `FINISHED` é somente leitura no dispositivo e no servidor; os registros históricos permanecem preservados.
- Histórico possui dois escopos: inventários criados ou acessados pelo usuário e inventários finalizados da equipe selecionada. Relatório e exportação de item `FINISHED` exigem autenticação e autorização, mas não solicitam token manual ao usuário.

## Produção e transporte

- A publicação usa HTTPS para frontend e API. O navegador acessa a API pelo proxy same-origin `/backend-api`, preservando a sessão renovável com `Secure`, `HttpOnly` e `SameSite=Strict` mesmo com Vercel e Render em domínios de provedor distintos.
- Em produção, o healthcheck executa uma consulta simples no PostgreSQL e responde 503 genérico quando a persistência não estiver disponível. Nunca inclui URL, credenciais ou detalhes de banco na resposta.
- CORS aceita apenas a origem HTTPS explícita do frontend publicado e credenciais. Curingas e HTTP não são configurações válidas em produção.

## Dados locais

- Cada inventário recebe UUIDv7, data local do dispositivo no formato `YYYY-MM-DD`, timestamps, revisão, `syncBaseRevision`, `syncStatus` e `tombstone`.
- Cada lançamento também recebe UUIDv7, timestamps, revisão, `syncBaseRevision`, `syncStatus` e tombstone. A camada é opcional; quando informada, deve estar entre A1 e A10. Lançamentos sem camada permanecem válidos em operação local, sincronização, análise e relatórios.
- Quantidade é inteiro positivo. EF e DE são os únicos lados válidos.
- Registros não são mesclados na tela. Inclusão, edição e exclusão atualizam o inventário e o lançamento na mesma transação IndexedDB. Excluir cria um tombstone e oculta o registro.

## Operação

- Um inventário novo começa sem lado selecionado.
- Depois de salvar um lançamento, lado e vão ficam selecionados. Se houver camada selecionada, ela também permanece; lote e quantidade são limpos e o foco retorna ao lote.
- A lista sempre apresenta EF antes de DE; vãos e lotes usam ordenação natural.

## Motor determinístico

- A chave de local é `(lado, vão normalizado, camada)`, permitindo camada nula, e a de lote é o lote normalizado.
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
- Cada inventário mantém um token interno de sincronização gerado localmente. O servidor armazena somente seu hash. O usuário visualiza apenas um código aleatório de participação com seis dígitos, único entre inventários ativos e removido na finalização.
- Participar exige conta autenticada e código ativo. O backend registra o usuário e emite um token interno aleatório exclusivo, cujo hash fica associado ao participante. O código amigável jamais é aceito como token de sincronização.
- Dez tentativas inválidas de participação em quinze minutos bloqueiam temporariamente novas tentativas da conta.
- O dispositivo guarda sua identidade e o cursor de eventos somente no IndexedDB. O cursor permite buscar apenas as alterações centrais ainda não recebidas.
- Todo registro tem `revision` e `syncBaseRevision`. O servidor aceita uma alteração somente quando a revisão-base corresponde à versão central; repetir uma requisição já aceita é idempotente e não cria duplicata.
- Inclusões usam IDs UUIDv7 gerados no cliente. Tombstones também são sincronizados; uma exclusão não some por falta temporária de rede.
- Em concorrência incompatível, o servidor preserva o payload recebido e a versão central em auditoria, responde com conflito e o cliente preserva as duas versões. O operador escolhe manter sua versão ou usar a versão central; nenhuma delas é apagada silenciosamente.
- A revisão local do inventário também é incrementada ao receber lançamento remoto, invalidando corretamente o cache de análise sem transformar a alteração remota em uma nova pendência.

## Identidade, equipes e acesso central

- Criar, editar e excluir lançamentos continua local e offline; autenticação só é necessária no momento posterior da sincronização central.
- Uma conta aceita qualquer endereço de e-mail normalizado e sintaticamente válido, sem restrição de domínio, além de nome visível e senha armazenada exclusivamente como hash `scrypt` com salt individual. A senha nunca integra a sincronização, o IndexedDB ou o banco em texto puro.
- O cadastro não cria equipe e libera a conta imediatamente, sem confirmação ou envio de código por e-mail.
- No cadastro, o usuário informa e confirma seu NP pessoal de exatamente oito dígitos. O NP é armazenado apenas como hash `scrypt` reforçado pelo segredo da aplicação e nunca é retornado pela API.
- A recuperação exige e-mail, NP pessoal e confirmação da nova senha. Cinco erros bloqueiam novas tentativas por quinze minutos; uma troca válida revoga todas as sessões renováveis anteriores.
- Qualquer conta autenticada pode iniciar e sincronizar um inventário próprio sem equipe. O inventário registra `owner_user_id`; `team_id` é opcional e pode ser preenchido quando houver uma equipe selecionada.
- Equipes são criadas ou associadas explicitamente. Uma equipe tem membros `ADMIN` (responsável) ou `OPERATOR`.
- O criador pode sincronizar seu próprio inventário com o token interno mesmo quando `team_id` for nulo. Em inventários associados a equipe, membros autorizados continuam podendo sincronizar conforme as regras existentes; só `ADMIN` pode incluir membros.
- `POST /api/v1/sync` exige bearer token válido e token interno do inventário. Participantes registrados podem sincronizar com seu token individual. UUID, código amigável ou cursor isoladamente não concedem leitura nem escrita.
- Se o usuário não for criador, participante autorizado ou membro da equipe associada, a API responde como não encontrado, sem confirmar a existência do inventário. Conflitos, idempotência, tombstones e `syncBaseRevision` mantêm as mesmas regras da Fase 2.
- Na V1, o controle de acesso não depende do domínio nem da verificação do e-mail. A proteção é baseada em autenticação, propriedade do inventário, associação explícita à equipe quando aplicável, autorização por papel, NP de recuperação e distribuição controlada do link do sistema.
