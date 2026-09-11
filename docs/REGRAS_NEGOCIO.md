# Regras de negócio — núcleo e análise

## Dados locais

- Cada inventário recebe UUIDv7, data local do dispositivo no formato `YYYY-MM-DD`, timestamps, revisão, `syncStatus` e `tombstone`.
- Cada lançamento também recebe UUIDv7, timestamps, revisão, `syncStatus` e tombstone. Lote e vão são texto; espaços externos são ignorados somente para validação e para a chave de consolidação.
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
