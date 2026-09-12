# Camadas e controle de lotes repetidos V2

Data: 12/09/2026
Branch de implementação: `feat/camadas-duplicidade-lote-v2`

## Escopo implementado

### Camadas

- Cada novo lançamento exige uma camada entre `A1` e `A10`.
- `Vão` e `Camada` são exibidos lado a lado no formulário, inclusive em viewport móvel.
- Registros legados continuam compatíveis com `layer` ausente.
- A camada é persistida no IndexedDB, sincronizada com o backend e incluída nos relatórios PDF, XLSX e DOCX.
- O motor de análise considera `lado + vão + camada` como posição física. Assim, o mesmo lote em A1 e A2 é tratado como distribuição em locais físicos distintos, sem perder a consolidação total por lote.

### Lote numérico

- O lote permanece armazenado como texto para preservar zeros à esquerda e evitar semântica matemática.
- O campo utiliza `type="text"`, `inputMode="numeric"` e `pattern="[0-9]*"`.
- A interface remove caracteres não numéricos durante a digitação.
- Frontend e backend validam que o lote contenha somente dígitos.

### Lote repetido

- A duplicidade é avaliada por `inventoryId + lot`.
- Vão, lado e camada não eliminam o alerta de repetição.
- O lançamento não é bloqueado definitivamente, pois o mesmo lote pode estar fisicamente fragmentado.
- Sem confirmação explícita, um lote repetido não é salvo localmente.
- O modal apresenta os registros existentes com autor, vão, camada, lado e quantidade quando disponíveis.
- A ação `Adicionar mesmo assim` registra `duplicateConfirmed` e preserva o novo lançamento individual.

### Offline e múltiplos dispositivos

- O IndexedDB continua sendo a fonte primária de operação local.
- A detecção local de duplicidade funciona sem rede.
- Quando há conexão, o frontend consulta também o inventário central antes do salvamento para detectar lançamentos feitos em outro dispositivo.
- Falha de rede nessa consulta não impede o lançamento local, preservando a regra offline-first.
- A autoria central é definida pelo usuário autenticado no servidor. O cliente não é autoridade para definir quem criou um lançamento.

## Banco de dados

Migration: `0006_inventory_entry_layers`

Campos adicionados a `inventory_entries`:

- `layer`
- `created_by_user_id`
- `duplicate_confirmed`

Proteções:

- `CHECK` limita `layer` a `A1` até `A10`, permitindo `NULL` apenas para compatibilidade histórica.
- `created_by_user_id` referencia `users.id`.
- Índices foram adicionados para camada e autoria.

No IndexedDB, a versão foi elevada para 3 e foi adicionado o índice composto `[inventoryId+lot]` para consulta eficiente de repetição.

## Endpoint adicionado

`GET /api/v1/inventories/{inventory_id}/lots/{lot}`

Finalidade:

- consultar lançamentos ativos do mesmo lote no inventário central;
- suportar exclusão do registro atual durante edição por `excludeEntryId`;
- exigir usuário autenticado e token válido do inventário;
- retornar autoria central, posição física, quantidade e metadados de sincronização.

## Validação executada

GitHub Actions, execução `34683892435`:

Frontend:

- `pnpm lint`: aprovado;
- `pnpm typecheck`: aprovado;
- suíte direcionada da funcionalidade: aprovada;
- `pnpm build`: aprovado.

Backend:

- `pytest -q`: 28 testes aprovados;
- `alembic upgrade head`: aprovado da migration `0001` até `0006` em banco SQLite limpo.

A suíte frontend completa da branch-base possui uma falha isolada em `tests/report-client.test.ts`, pertencente ao módulo de compartilhamento que estava sendo alterado simultaneamente em `main`. Essa lógica não foi modificada nesta implementação para evitar conflito entre agentes.

## Integração

A implementação foi mantida em branch isolada porque `main` recebeu alterações concorrentes de compartilhamento durante o desenvolvimento. A única sobreposição de arquivos identificada entre os dois trabalhos é `backend/app/main.py`; os demais arquivos de compartilhamento permanecem fora desta implementação.

Antes de integrar em `main`, deve-se preservar as alterações mais recentes de compartilhamento e combinar somente as adições desta versão ao `backend/app/main.py`.
