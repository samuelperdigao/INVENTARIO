# ESPECIFICAÇÃO DO APLICATIVO DE INVENTÁRIO — V1

> Documento histórico de evolução. Para comportamento vigente, use `docs/REGRAS_NEGOCIO.md`; para estado operacional, use `docs/STATUS.md`.

**Status:** Especificação inicial aprovada para desenvolvimento  
**Versão:** 1.0  
**Data de criação:** 10/09/2026  
**Objetivo desta versão:** definir a base funcional, técnica e operacional do aplicativo antes do início da implementação no Codex.

---

# 1. VISÃO GERAL

O projeto consiste no desenvolvimento de uma ferramenta web operacional para execução de inventários físicos.

O aplicativo será utilizado principalmente em dispositivos móveis, por meio de um link web, com interface simples, rápida e responsiva.

A finalidade é substituir um fluxo de trabalho manual, reduzir retrabalho, facilitar o registro dos dados durante a execução do inventário e gerar relatórios inteligentes capazes de identificar situações operacionais relevantes, como lotes fragmentados em diferentes vãos ou lados.

O aplicativo deverá ser tratado como uma ferramenta real de operação, e não como um protótipo acadêmico.

---

# 2. OBJETIVO PRINCIPAL

Permitir que uma equipe registre um inventário físico de forma rápida, organizada, confiável e segura, com posterior consolidação automática dos dados e geração de relatórios operacionais.

O sistema deverá:

- permitir lançamento rápido de registros;
- organizar os registros por lado e por vão;
- consolidar lotes repetidos;
- identificar lotes fragmentados fisicamente;
- detectar peças isoladas ou grupos de peças fora do local principal;
- gerar recomendações operacionais;
- exportar o inventário em Excel, PDF e Word;
- funcionar de forma adequada em celular;
- preservar os dados mesmo em caso de falha de conexão;
- permitir evolução futura sem reestruturação completa do projeto.

---

# 3. ESCOPO DA V1

A primeira versão deverá contemplar:

1. Criação de inventário.
2. Data automática.
3. Registro de lado.
4. Registro de vão.
5. Registro de lote.
6. Registro da quantidade de peças.
7. Lançamento rápido de vários lotes.
8. Listagem estruturada por lado e vão.
9. Edição de registros.
10. Exclusão de registros.
11. Persistência local.
12. Funcionamento offline.
13. Sincronização com backend.
14. Armazenamento em banco de dados.
15. Motor de análise inteligente baseado em regras.
16. Detecção de lotes fragmentados.
17. Detecção de peça solteira.
18. Detecção de grupo deslocado.
19. Identificação de distribuição ambígua.
20. Relatório consolidado.
21. Exportação para Excel.
22. Exportação para PDF.
23. Exportação para Word.
24. Finalização de inventário.
25. Histórico dos inventários.
26. Validações.
27. Tratamento de erros.
28. Testes.
29. Deploy.
30. Acesso por link.

---

# 4. PLATAFORMA

O aplicativo deverá funcionar como aplicação web responsiva.

## Requisitos

- Mobile-first.
- Compatível com smartphones e tablets Android.
- Compatível com iPhone e iPad (iOS/iPadOS).
- Compatível com navegadores modernos, incluindo Chrome, Edge e Safari.
- Funcionar também em computador.
- Permitir instalação como PWA futuramente ou já na V1, caso seja tecnicamente viável sem aumentar excessivamente a complexidade.
- Acesso principal por link.
- Não depender de instalação de arquivo executável.

Exemplo de acesso:

```text
https://inventario.exemplo.com
```

# 4.1 COMPATIBILIDADE ANDROID E IOS

A V1 deverá ser projetada e testada para uso real nos dois ecossistemas móveis.

## Android

- Chrome como navegador principal de referência;
- suporte a instalação como PWA quando disponível;
- funcionamento offline;
- IndexedDB;
- exportação e compartilhamento de arquivos;
- layout responsivo para diferentes tamanhos de tela.

## iOS / iPadOS

- Safari como navegador principal de referência;
- suporte a instalação na Tela de Início quando compatível;
- funcionamento offline dentro das capacidades permitidas pelo iOS;
- IndexedDB com tratamento adequado para persistência;
- exportação e compartilhamento de Excel, PDF e Word;
- evitar dependência de APIs exclusivas do Android/Chrome;
- tratar limitações do Safari e PWA no iOS durante desenvolvimento e testes.

## Regra de implementação

Nenhuma funcionalidade crítica poderá ser considerada concluída se funcionar somente em Android ou somente em iOS.

O fluxo principal deverá ser validado nos dois ambientes:

```text
Criar inventário
→ registrar
→ salvar
→ fechar
→ reabrir
→ editar
→ sincronizar
→ analisar
→ exportar
```

---

# 5. ARQUITETURA RECOMENDADA

Arquitetura inicial recomendada:

```text
Usuário
   ↓
Aplicação Web / PWA
Next.js + TypeScript
   ↓
Camada local/offline
IndexedDB
   ↓
API
Python + FastAPI
   ↓
Motor de análise
   ↓
Banco de dados
```

## Frontend

Tecnologias recomendadas:

- Next.js
- React
- TypeScript
- PWA
- IndexedDB

Responsabilidades:

- interface;
- captura dos registros;
- validação inicial;
- armazenamento local;
- funcionamento offline;
- sincronização;
- visualização dos dados;
- visualização do relatório;
- acionamento das exportações.

## Backend

Tecnologias recomendadas:

- Python
- FastAPI

Responsabilidades:

- regras de negócio;
- validações do servidor;
- análise dos lotes;
- consolidação;
- detecção de divergências;
- geração de relatórios;
- geração de Excel;
- geração de PDF;
- geração de Word;
- persistência central;
- segurança;
- sincronização.

## Banco de dados

O banco deverá suportar:

- inventários;
- registros;
- usuários ou dispositivos, se necessário;
- histórico;
- status de sincronização;
- auditoria;
- futuras expansões.

A tecnologia específica do banco poderá ser definida durante a implementação, desde que seja adequada para produção.

---

# 6. ENTIDADE INVENTÁRIO

Cada inventário deverá representar uma execução independente.

Estrutura conceitual:

```ts
type Inventory = {
  id: string;
  date: string;
  status: "OPEN" | "FINISHED";
  createdAt: string;
  updatedAt: string;
};
```

## Regras

- A data será preenchida automaticamente.
- O usuário não deverá precisar digitar a data.
- A data visível deverá usar formato brasileiro.

Exemplo:

```text
10/09/2026
```

Internamente, poderá ser armazenada em formato ISO:

```text
2026-09-10
```

---

# 7. ENTIDADE REGISTRO

Cada lançamento deverá representar uma ocorrência física de determinado lote.

Estrutura conceitual:

```ts
type InventoryEntry = {
  id: string;
  inventoryId: string;

  side: "EF" | "DE";
  bay: string;
  lot: string;
  quantity: number;

  createdAt: string;
  updatedAt: string;

  syncStatus?: "PENDING" | "SYNCED" | "ERROR";
};
```

## Campos visíveis

O usuário deverá informar apenas:

- lado;
- vão;
- lote;
- quantidade de peças.

## Campos não visíveis

O sistema poderá armazenar internamente:

- ID;
- data/hora de criação;
- data/hora de edição;
- dispositivo;
- usuário;
- status de sincronização;
- demais metadados técnicos.

A hora não deverá ser exibida na listagem operacional normal.

---

# 8. LADOS

O sistema terá inicialmente dois lados:

```text
EF
DE
```

O usuário deverá selecionar um deles antes de registrar o lote.

A interface deverá tornar essa seleção clara e rápida.

Exemplo:

```text
Lado

[ EF ]  [ DE ]
```

---

# 9. VÃOS

Cada registro deverá obrigatoriamente estar associado a um vão.

O sistema deverá permitir selecionar ou informar o vão correspondente.

Exemplo:

```text
Vão
[ 15 ]
```

A forma de seleção poderá evoluir para:

- dropdown;
- botões;
- campo numérico;
- lista predefinida.

A decisão visual deverá priorizar velocidade operacional.

---

# 10. LOTE

O lote deverá ser tratado como identificador operacional.

Exemplo:

```text
2815634434
```

## Requisitos

- aceitar exatamente dez dígitos ASCII, iniciados por `27` ou `28`;
- não converter automaticamente para notação científica;
- preservar zeros à esquerda caso existam;
- ser tratado preferencialmente como string;
- validar no frontend e no backend com a mesma regra central;
- permitir pesquisa;
- permitir consolidação;
- permitir identificação do mesmo lote em diferentes locais.

---

# 11. QUANTIDADE DE PEÇAS

Cada registro deverá conter a quantidade física encontrada naquele local.

Exemplo:

```text
19
```

## Regras

- obrigatório;
- inteiro positivo;
- não aceitar zero;
- não aceitar valores negativos;
- não aceitar texto;
- validação no frontend e backend.

---

# 12. FLUXO DE LANÇAMENTO

Tela principal de operação:

```text
NOVO REGISTRO

Lado
[ EF ] [ DE ]

Vão
[ 15 ]

Lote
[________________]

Quantidade de peças
[________]

[ ADICIONAR ]
```

Após adicionar um registro:

- manter o lado selecionado;
- manter o vão selecionado;
- limpar o campo lote;
- limpar o campo quantidade;
- retornar o foco para lote;
- permitir lançamento imediato do próximo registro.

Objetivo:

```text
Lado → Vão → Lote → Quantidade → Adicionar
```

O fluxo deverá minimizar toques e digitação.

---

# 13. VISUALIZAÇÃO DOS REGISTROS

Os registros não deverão ser apresentados apenas em ordem cronológica.

A estrutura principal deverá ser:

```text
Inventário
│
├── EF
│   ├── Vão 01
│   ├── Vão 02
│   └── Vão 03
│
└── DE
    ├── Vão 01
    ├── Vão 02
    └── Vão 03
```

Dentro de cada vão:

```text
VÃO 15

Lote 2815634434
19 peças

Lote 2815634499
12 peças
```

## Regra de ordenação

Independentemente da ordem de cadastro:

1. agrupar por lado;
2. agrupar por vão;
3. listar os lotes dentro de cada vão;
4. mostrar a quantidade de peças correspondente.

---

# 14. EDIÇÃO DE REGISTROS

O usuário deverá conseguir editar registros já lançados.

Campos editáveis:

- lado;
- vão;
- lote;
- quantidade.

Toda edição deverá atualizar os cálculos e análises relacionados.

---

# 15. EXCLUSÃO DE REGISTROS

O usuário deverá conseguir excluir um registro.

A exclusão deverá exigir confirmação.

Exemplo:

```text
Deseja excluir este registro?

Lote: 2815634434
DE • Vão 15
19 peças

[ Cancelar ] [ Excluir ]
```

O sistema deverá evitar exclusões acidentais.

---

# 16. FUNCIONAMENTO OFFLINE

O inventário não poderá depender completamente de conexão contínua.

## Requisitos

- permitir registrar dados sem internet;
- armazenar registros localmente;
- preservar dados ao fechar o navegador;
- sincronizar quando a conexão retornar;
- informar o estado de sincronização sem poluir a interface;
- impedir perda silenciosa de dados.

Tecnologia sugerida:

```text
IndexedDB
```

---

# 17. SINCRONIZAÇÃO

O sistema deverá permitir posteriormente o uso em mais de um dispositivo.

A sincronização deverá prever:

- IDs únicos;
- prevenção de duplicação;
- prevenção de sobrescrita indevida;
- tratamento de conflitos;
- status de sincronização;
- recuperação após falha;
- registro centralizado.

Nenhum registro poderá simplesmente desaparecer por conflito de sincronização.

---

# 18. MOTOR DE ANÁLISE DO INVENTÁRIO

Esta é uma das principais funcionalidades do sistema.

O relatório não deverá apenas reproduzir os registros.

O sistema deverá analisar os dados e identificar situações relevantes.

Tecnologia recomendada:

```text
Python
```

A análise inicial será determinística e baseada em regras.

Não é necessário uso de IA para a V1.

---

# 19. CONSOLIDAÇÃO POR LOTE

Para cada número de lote, o sistema deverá:

1. localizar todas as ocorrências;
2. identificar todos os lados;
3. identificar todos os vãos;
4. calcular a quantidade encontrada em cada local;
5. calcular o total físico;
6. determinar se o lote está concentrado ou fragmentado.

Exemplo:

```text
Lote: 2815634434

DE • Vão 15 → 19 peças
EF • Vão 21 → 1 peça

Total físico → 20 peças
```

---

# 20. CLASSIFICAÇÕES DO MOTOR DE ANÁLISE

O sistema deverá possuir, inicialmente, as seguintes classificações:

## 20.1 OK

Lote encontrado em apenas um local.

Exemplo:

```text
Lote 10001

DE • Vão 10
20 peças
```

Classificação:

```text
OK
```

---

## 20.2 FRAGMENTADO

Mesmo lote encontrado em mais de um local.

Exemplo:

```text
Lote 10002

DE • Vão 15 → 15 peças
EF • Vão 21 → 5 peças
```

Classificação:

```text
FRAGMENTADO
```

---

## 20.3 PEÇA SOLTEIRA

Quando uma única peça do mesmo lote for encontrada fora de uma concentração claramente principal.

Exemplo:

```text
Lote 2815634434

DE • Vão 15 → 19 peças
EF • Vão 21 → 1 peça
```

Resultado:

```text
Total físico: 20 peças

Local principal:
DE • Vão 15
19 peças

Peça solteira:
EF • Vão 21
1 peça
```

---

## 20.4 GRUPO DESLOCADO

Quando mais de uma peça do lote estiver fora do local principal.

Exemplo:

```text
DE • Vão 08 → 15 peças
EF • Vão 11 → 2 peças
DE • Vão 20 → 3 peças
```

Resultado:

```text
Total físico: 20 peças

Local principal:
DE • Vão 08
15 peças

Fora do local principal:
EF • Vão 11 → 2 peças
DE • Vão 20 → 3 peças

Total deslocado:
5 peças
```

---

## 20.5 DISTRIBUIÇÃO AMBÍGUA

Quando o sistema não possuir evidência suficiente para definir automaticamente o local principal.

Exemplo:

```text
DE • Vão 15 → 10 peças
EF • Vão 21 → 10 peças
```

Resultado:

```text
DISTRIBUIÇÃO AMBÍGUA

Não foi possível determinar automaticamente
qual é o local principal.
```

O sistema não deverá inventar uma conclusão.

---

## 20.6 REVISAR

Situação não contemplada pelas regras anteriores ou que exija avaliação humana.

---

# 21. IDENTIFICAÇÃO DO LOCAL PRINCIPAL

O sistema poderá considerar como provável local principal o ponto que contenha a maior concentração de peças.

Porém, a regra não deverá ser simplesmente:

```python
max(quantidade)
```

Deverá existir um critério mínimo de confiança.

Exemplo:

```text
19 + 1
```

Há forte indicação de local principal.

Já:

```text
10 + 10
```

Não há evidência suficiente.

E:

```text
11 + 9
```

Pode exigir classificação ambígua ou regra adicional.

Os limiares definitivos deverão ser implementados de forma configurável e testável.

---

# 22. RECOMENDAÇÃO OPERACIONAL

Quando houver confiança suficiente, o relatório deverá sugerir uma ação.

Exemplo:

```text
DIVERGÊNCIA DE LOCALIZAÇÃO

Lote: 2815634434
Total identificado: 20 peças

Local principal:
DE • Vão 15
19 peças

Peça fora do lote:
EF • Vão 21
1 peça

Ação sugerida:
Verificar a possibilidade de transferir a peça localizada
no Vão 21 EF para o Vão 15 DE, reunindo as 20 peças
do lote no mesmo local.
```

A recomendação deverá ser apresentada como sugestão, não como comando automático.

---

# 23. RESUMO DO INVENTÁRIO

Ao finalizar o processamento, o sistema deverá produzir um resumo.

Exemplo:

```text
INVENTÁRIO CONCLUÍDO

Lotes analisados: 186

Regulares: 168
Fragmentados: 18

Peças solteiras: 11
Grupos deslocados: 5
Revisar: 2
```

As categorias deverão ser calculadas automaticamente.

---

# 24. RELATÓRIO INTELIGENTE

O relatório final deverá conter pelo menos:

1. identificação do inventário;
2. data;
3. registros consolidados;
4. organização por EF e DE;
5. organização por vão;
6. lotes;
7. quantidades;
8. total físico por lote;
9. lotes encontrados em mais de um local;
10. local principal provável;
11. peças solteiras;
12. grupos deslocados;
13. situações ambíguas;
14. itens para revisão;
15. recomendações operacionais;
16. resumo final.

---

# 25. EXPORTAÇÃO PARA EXCEL

O sistema gera dois formatos reais. O `.xls` é o formato padrão da equipe,
porque os computadores antigos da operação abrem Excel 97-2003, mas
apresentam erro com `.xlsx`. O backend gera o `.xls` diretamente em BIFF8 com
`xlwt`; não é permitido renomear um `.xlsx`, converter no navegador ou exigir
LibreOffice no servidor.

O `.xlsx` moderno continua disponível e é gerado com `openpyxl`. Ambos usam a
mesma preparação `build_inventory_report_data()`, que é a fonte única de
inventário, locais, quantidades, consolidação, divergências e recomendações.

Nomes:

```text
Inventario_2026-09-12.xls
Inventario_2026-09-12.xlsx
```

O endpoint preferencial é:

```text
GET /api/v1/inventories/{inventory_id}/export/excel
GET /api/v1/inventories/{inventory_id}/export/excel?format=xls
GET /api/v1/inventories/{inventory_id}/export/excel?format=xlsx
```

Sem `format`, o retorno é `.xls`. O endpoint histórico
`/api/v1/inventories/{inventory_id}/exports/{format}` permanece disponível para
consumidores existentes.

As respostas são bytes binários e informam MIME, `Content-Disposition:
attachment` e `Content-Length`. Os tipos são `application/vnd.ms-excel` para
`.xls` e `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
para `.xlsx`.

## Abas e conteúdo

As quatro abas devem aparecer nesta ordem:

1. `RESUMO`;
2. `INVENTÁRIO`;
3. `LOTES CONSOLIDADOS`;
4. `DIVERGÊNCIAS`.

### RESUMO

Contém o título `Aplicativo Inventário da Laminação de Perfis`, data do
inventário, totais de registros, peças, lotes e vãos, quantidade de
divergências e lotes fragmentados, totais separados por DE e EF,
classificações, aviso visual para fragmentação e observações operacionais.

### INVENTÁRIO

Contém lado, vão, camada quando informada, lote como texto e quantidade de
peças como número. Deve ter cabeçalho azul escuro com texto branco, sem filtros,
linhas de grade ocultas, conteúdo centralizado, congelamento do cabeçalho,
larguras adequadas, linhas alternadas, destaque de DE e EF, total ao final e
configuração de impressão em A4.

### LOTES CONSOLIDADOS

Contém lote, total físico de peças, vão principal, lado principal, outros
locais, situação do lote, indicação de fragmentação e recomendação de ação.

### DIVERGÊNCIAS

Contém lote, locais e quantidades principal e divergente, classificação e
recomendação de conferência, localização ou realocação. As cores estáticas são
vermelho para divergência crítica, laranja para atenção, amarelo para
conferência e verde para situação regular.

## Limitações do `.xls`

O formato legado não usa macros, links externos, tabelas estruturadas,
fórmulas dinâmicas, arrays dinâmicos ou recursos exclusivos do Microsoft 365.
Totais e valores são calculados no backend. O limite histórico é de 65.536
linhas por planilha e pequenas diferenças visuais em relação ao `.xlsx` são
aceitáveis, desde que os dados e totais permaneçam iguais.

Tecnologias: `xlwt` para BIFF8 e `openpyxl` para OOXML.

---

# 26. EXPORTAÇÃO PARA PDF

O PDF deverá ser adequado para:

- impressão;
- compartilhamento;
- apresentação;
- registro;
- análise operacional.

O layout deverá preservar:

- hierarquia;
- legibilidade;
- separação EF/DE;
- separação por vão;
- destaque das divergências;
- resumo;
- recomendações.

---

# 27. EXPORTAÇÃO PARA WORD

O sistema deverá gerar arquivo `.docx`.

O documento deverá conter os mesmos dados principais do relatório.

Tecnologia recomendada:

```text
python-docx
```

---

# 28. FONTE ÚNICA DOS DADOS

PDF, Word e Excel deverão usar a mesma base processada.

Não deverá existir lógica independente para cada formato.

Fluxo recomendado:

```text
Dados brutos
   ↓
Motor de análise
   ↓
Modelo consolidado
   ↓
├── Interface
├── Excel
├── PDF
└── Word
```

Isso reduz divergência entre relatórios.

---

# 29. FINALIZAÇÃO DO INVENTÁRIO

O usuário deverá poder revisar antes de finalizar.

Exemplo:

```text
REVISAR INVENTÁRIO

EF
Vão 01
Vão 02
Vão 03

DE
Vão 01
Vão 02
Vão 03

[ Voltar ]
[ Finalizar inventário ]
```

Após finalizar:

- executar análise;
- gerar resumo;
- liberar relatórios;
- preservar os dados;
- marcar status como finalizado.

A possibilidade de reabrir um inventário finalizado deverá ser decidida posteriormente.

---

# 30. HISTÓRICO

O aplicativo deverá possuir área de histórico.

Exemplo:

```text
HISTÓRICO

10/09/2026
Inventário finalizado

03/09/2026
Inventário finalizado
```

Cada item deverá permitir visualizar os registros e relatórios correspondentes.

---

# 31. SEGURANÇA

O sistema deverá ser desenvolvido com princípios básicos de segurança desde a V1.

## Requisitos

- validação no frontend;
- validação no backend;
- sanitização de entradas;
- IDs únicos;
- proteção da API;
- variáveis sensíveis em ambiente seguro;
- `.env` fora do repositório;
- prevenção de acesso indevido;
- prevenção de manipulação de dados pelo cliente;
- tratamento de erros;
- logs;
- nenhuma credencial hardcoded;
- dependências atualizadas;
- nenhuma exposição desnecessária do banco.

---

# 32. CONFIABILIDADE

O inventário é dado operacional.

Portanto:

- registros não podem desaparecer silenciosamente;
- falha de internet não pode apagar lançamentos;
- sincronização não pode duplicar registros;
- exclusão deve exigir confirmação;
- alterações devem ser rastreáveis internamente;
- exportações devem reproduzir os dados consolidados corretamente.

---

# 33. VALIDAÇÕES MÍNIMAS

Antes de salvar um registro:

## Lado

Permitidos:

```text
EF
DE
```

## Vão

- obrigatório;
- formato compatível com a operação.

## Lote

- obrigatório;
- não aceitar vazio;
- manter como texto;
- preservar o valor original.

## Quantidade

- obrigatória;
- inteiro;
- maior que zero.

---

# 34. EXPERIÊNCIA DO USUÁRIO

A interface deverá priorizar:

- velocidade;
- poucos cliques;
- leitura rápida;
- botões grandes;
- uso com uma mão quando possível;
- boa visualização em celular;
- contraste adequado;
- ausência de informações desnecessárias;
- feedback imediato após salvar.

A interface não deverá ser visualmente poluída.

---

# 35. DESIGN

Direção inicial:

- profissional;
- operacional;
- moderna;
- limpa;
- responsiva;
- mobile-first.

Evitar:

- excesso de animações;
- excesso de elementos decorativos;
- cards desnecessários;
- informações que não ajudam na execução do inventário.

O design final poderá ser refinado durante o desenvolvimento.

---

# 36. DESEMPENHO

A aplicação deverá:

- abrir rapidamente;
- registrar sem atraso perceptível;
- suportar muitos lançamentos;
- evitar recarregamentos completos;
- processar relatórios de maneira eficiente;
- manter boa usabilidade em celulares intermediários.

---

# 37. TESTES OBRIGATÓRIOS

A V1 deverá possuir testes para:

## Cadastro

- registro válido;
- campo obrigatório;
- quantidade inválida;
- lote vazio.

## Organização

- EF separado de DE;
- vãos corretamente agrupados;
- lotes corretamente exibidos.

## Análise

- lote em um único local;
- lote 19 + 1;
- lote 15 + 5;
- lote 15 + 2 + 3;
- lote 10 + 10;
- casos ambíguos;
- múltiplos lados;
- múltiplos vãos.

## Offline

- registrar sem internet;
- fechar aplicativo;
- abrir novamente;
- verificar persistência;
- sincronizar ao retornar.

## Exportação

- Excel;
- PDF;
- Word;
- dados iguais entre os formatos.

---

# 38. CENÁRIO DE ACEITE PRINCIPAL

O aplicativo será considerado funcional quando for possível:

1. abrir pelo celular Android;
2. abrir pelo iPhone/iPad;
3. criar inventário;
4. obter data automaticamente;
5. selecionar EF ou DE;
6. selecionar vão;
7. informar lote;
8. informar quantidade;
9. adicionar registro;
10. cadastrar vários lotes rapidamente;
11. visualizar por lado;
12. visualizar por vão;
13. editar;
14. excluir com confirmação;
15. trabalhar sem internet;
16. fechar o navegador;
17. abrir novamente sem perder os dados;
18. sincronizar;
19. finalizar;
20. analisar os lotes;
21. detectar lote fragmentado;
22. detectar peça solteira;
23. detectar grupo deslocado;
24. detectar situação ambígua;
25. gerar Excel;
26. gerar PDF;
27. gerar Word;
28. consultar histórico;
29. acessar por link.

---

# 39. CENÁRIO CRÍTICO DE TESTE

Entrada:

```text
Lote: 2815634434

DE
Vão 15
19 peças

EF
Vão 21
1 peça
```

Resultado esperado:

```text
Lote: 2815634434
Total físico: 20 peças

Classificação:
PEÇA SOLTEIRA

Local principal:
DE • Vão 15
19 peças

Local divergente:
EF • Vão 21
1 peça

Ação sugerida:
Verificar a possibilidade de reunir a peça localizada
no Vão 21 EF ao lote localizado no Vão 15 DE.
```

O resultado deverá aparecer de maneira consistente:

- no aplicativo;
- no Excel;
- no PDF;
- no Word.

---

# 40. FORA DO ESCOPO INICIAL

Não implementar sem necessidade comprovada:

- ERP completo;
- controle financeiro;
- compras;
- vendas;
- faturamento;
- IA generativa;
- previsões por machine learning;
- funcionalidades sem relação direta com inventário;
- dashboards excessivamente complexos.

Essas funcionalidades poderão ser avaliadas futuramente.

---

# 41. PRINCÍPIO DE DESENVOLVIMENTO

Toda funcionalidade nova deverá responder pelo menos uma das perguntas:

1. Torna o lançamento mais rápido?
2. Aumenta a confiabilidade?
3. Facilita a conferência?
4. Ajuda a identificar divergências?
5. Melhora o relatório?
6. Reduz trabalho manual?
7. Aumenta a segurança dos dados?

Se a resposta for não para todas, a funcionalidade não deverá entrar automaticamente na V1.

---

# 42. ORGANIZAÇÃO SUGERIDA DO REPOSITÓRIO

```text
inventario-app/
│
├── app/
│   ├── page.tsx
│   ├── inventario/
│   ├── registros/
│   ├── relatorio/
│   └── historico/
│
├── components/
│
├── lib/
│   ├── database/
│   ├── offline/
│   ├── validation/
│   └── inventory/
│
├── api/
│   ├── index.py
│   ├── analysis/
│   ├── reports/
│   └── exports/
│
├── tests/
│
├── public/
│
├── docs/
│   ├── ESPECIFICACAO_INVENTARIO_V1.md
│   ├── REGRAS_NEGOCIO.md
│   └── STATUS.md
│
├── .env.example
├── .gitignore
└── README.md
```

---

# 43. DOCUMENTAÇÃO DO DESENVOLVIMENTO

Durante a implementação, manter:

## ESPECIFICACAO_INVENTARIO_V1.md

Fonte oficial dos requisitos.

## REGRAS_NEGOCIO.md

Regras específicas do inventário e do motor de análise.

## STATUS.md

Registrar:

- concluído;
- em andamento;
- pendente;
- bloqueios;
- decisões técnicas.

## README.md

Explicar:

- instalação;
- execução local;
- build;
- testes;
- deploy;
- tecnologias.

---

# 44. ESTRATÉGIA DE IMPLEMENTAÇÃO NO CODEX

O desenvolvimento deverá ocorrer por módulos.

Ordem recomendada:

1. Fundação do projeto.
2. Arquitetura.
3. Interface base.
4. Criação de inventário.
5. Registro rápido.
6. Organização EF/DE.
7. Organização por vão.
8. Edição.
9. Exclusão.
10. Persistência local.
11. PWA/offline.
12. Backend.
13. Banco.
14. Sincronização.
15. Motor Python.
16. Consolidação por lote.
17. Classificações.
18. Relatório inteligente.
19. Excel.
20. PDF.
21. Word.
22. Histórico.
23. Segurança.
24. Testes.
25. Deploy.
26. Validação em celular real.

---

# 45. REGRAS PARA O CODEX

Ao implementar:

- não alterar requisitos sem necessidade técnica;
- documentar decisões relevantes;
- evitar complexidade desnecessária;
- executar testes após cada módulo;
- corrigir erros antes de avançar;
- não deixar TODO crítico sem registro;
- não usar dados fictícios em produção;
- não hardcodar segredos;
- manter tipagem;
- manter código organizado;
- manter separação de responsabilidades;
- preservar compatibilidade mobile;
- preservar funcionamento offline;
- priorizar segurança e confiabilidade.

---

# 46. DEPLOY

Objetivo final:

```text
Código
↓
Repositório Git
↓
Build
↓
Deploy
↓
Link público
```

O serviço de deploy poderá ser definido durante a implementação.

Uma opção inicial é Vercel, desde que atenda adequadamente:

- frontend;
- API;
- Python;
- banco escolhido;
- geração de arquivos;
- requisitos de execução.

Caso alguma limitação técnica apareça, outra infraestrutura poderá ser escolhida.

---

# 47. EVOLUÇÕES FUTURAS POSSÍVEIS

Não fazem parte obrigatória da V1, mas a arquitetura deverá permitir futuramente:

- autenticação;
- perfis de usuário;
- múltiplas equipes;
- múltiplos inventários simultâneos;
- permissões;
- auditoria avançada;
- leitura de código de barras;
- leitura por câmera;
- QR Code;
- importação de planilhas;
- comparação entre inventários;
- dashboards históricos;
- indicadores;
- detecção de padrões;
- integração com outros sistemas.

---

# 48. RELAÇÃO COM O PROJETO DE EXTENSÃO

O aplicativo poderá posteriormente ser utilizado como solução tecnológica aplicada em uma atividade de extensão acadêmica.

Entretanto, nesta fase, o foco é exclusivamente:

```text
DESENVOLVER
↓
TESTAR
↓
VALIDAR OPERACIONALMENTE
↓
APRESENTAR AO COORDENADOR
```

Somente depois da validação serão estruturadas as demais etapas acadêmicas.

---

# 49. DEFINIÇÃO DE PRONTO DA V1

A V1 será considerada pronta somente quando:

- o fluxo principal funcionar;
- os dados não forem perdidos;
- o sistema funcionar em celular;
- o sistema funcionar offline;
- a sincronização estiver validada;
- o relatório inteligente estiver funcionando;
- o caso 19 + 1 for corretamente detectado;
- casos ambíguos não gerarem conclusões falsas;
- Excel funcionar;
- PDF funcionar;
- Word funcionar;
- testes essenciais passarem;
- build de produção passar;
- aplicação estiver disponível por link;
- houver validação operacional.

---

# 50. REGRA FINAL

O aplicativo deverá ser desenvolvido como ferramenta operacional real.

A prioridade é:

```text
VELOCIDADE
+
CONFIABILIDADE
+
ORGANIZAÇÃO
+
ANÁLISE
+
RELATÓRIO
+
SEGURANÇA
```

Qualquer decisão técnica futura deverá preservar esses princípios.

---

# 51. ACESSO, PARTICIPAÇÃO E COMPARTILHAMENTO

## Entrada e identidade

- `/` é a Landing Page pública e `/dashboard` é a área operacional autenticada;
- cadastro aceita qualquer e-mail sintaticamente válido e libera o acesso imediatamente;
- cadastro não cria equipe automaticamente;
- senha é persistida somente como hash `scrypt` com salt individual;
- o usuário informa e confirma o NP pessoal de exatamente oito dígitos no cadastro;
- o NP de recuperação é persistido somente como hash `scrypt` reforçado pelo segredo da aplicação e nunca é devolvido pela API;
- cinco NPs incorretos bloqueiam novas tentativas de recuperação por quinze minutos;
- redefinir a senha revoga todas as sessões renováveis anteriores;
- perfil não sensível pode permanecer no dispositivo para reabrir dados locais offline, mas bearer token nunca é persistido.

## Participação

- UUID e tokens internos não aparecem no fluxo normal do usuário;
- o primeiro sync de inventário aberto cria um código de participação de exatamente seis números;
- o código é único entre inventários ativos e deixa de existir na finalização;
- participar exige usuário autenticado e recebe proteção contra tentativas repetidas;
- o backend registra cada participante e emite um token opaco individual de alta entropia;
- o código amigável identifica o inventário, mas nunca substitui autenticação, autorização ou token interno.

## Histórico e autoria

- `owner_user_id` representa o criador e é equivalente a `created_by_user_id` nesta versão;
- `finalized_by_user_id` registra quem encerrou o inventário;
- **Meus inventários** reúne finalizados criados ou acessados pelo usuário;
- **Inventários da equipe** exige associação à equipe escolhida;
- o snapshot final é imutável e serve como fonte oficial para consulta e novas exportações;
- inventário finalizado pode ser lido e exportado pelo usuário autorizado sem informar token manualmente.

## Compartilhamento e e-mail

- PDF é o formato padrão de compartilhamento móvel;
- a interface usa `navigator.share()` apenas quando `navigator.canShare()` aceita o arquivo;
- sem suporte nativo, o sistema baixa o documento;
- PDF, XLSX e DOCX podem ser enviados ao e-mail da conta autenticada;
- o destinatário não é confiado ao frontend;
- cadastro e recuperação não dependem de SMTP; somente o envio opcional de relatórios usa essa infraestrutura;
- credenciais e configuração do provedor nunca integram o bundle público.
