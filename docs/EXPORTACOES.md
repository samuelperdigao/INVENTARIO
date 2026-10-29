# Exportações

## Excel

O formato padrão da equipe é `.xls`, porque os computadores antigos usados na
operação não abrem `.xlsx`. O backend gera esse arquivo diretamente em BIFF8,
formato do Excel 97-2003, usando `xlwt`. Não há renomeação de `.xlsx`,
conversão no navegador ou dependência do LibreOffice no servidor.

O formato `.xlsx` continua disponível para computadores modernos e é gerado
com `openpyxl`. Os dois formatos usam a mesma fonte de dados:

```text
build_inventory_report_data(...)          fonte única dos dados
    └── build_report_view(report)         apresentação comum + autoverificação
            ├── generate_xls_report
            ├── generate_xlsx_report
            ├── export_pdf
            └── export_docx
```

`build_report_view` (`backend/app/reports.py`) não recalcula totais nem
classificações: só formata e organiza o que o modelo já contém. Antes de
qualquer arquivo ser gerado, `verify_report_totals` confere que a soma dos
lançamentos, a soma dos lotes, o total do resumo e a soma dos subtotais por
vão são iguais, que o número de registros bate, que cada lote fecha com seus
lançamentos e locais e que o total de lotes do resumo corresponde aos lotes
analisados. Se algo não fechar, a exportação falha com
`ReportConsistencyError` ("Relatório não gerado: os totais não conferem
(...)"), devolvida pela API como erro 500 com essa mensagem. Nenhum arquivo
inconsistente é entregue.

### Formatação comum

- "Gerado em" usa o horário de `America/Sao_Paulo`, no formato
  `07/10/2026 às 20:20` (sem a base IANA no host, usa UTC−3 fixo).
- Datas em `dd/mm/aaaa`; inteiros no PDF e no Word com separador de milhar
  (`2.667`). No Excel os números ficam numéricos com formato `#,##0`.
- Rodapé `Página X de Y` nos quatro formatos (no Excel, por aba impressa).

O modelo comum preserva inventário, vão, lado DE/EF, camada quando informada,
lote, quantidade, totais, lotes consolidados e a apresentação operacional
produzida por `backend/app/presentation.py`. Quando existe uma referência SAP,
ele também preserva o estado de conciliação e o resumo de lotes previstos,
encontrados, pendentes, fora da referência e fragmentados. O motor ainda
mantém seus códigos internos, mas nenhum exportador precisa traduzi-los
novamente.

### Endpoints

O endpoint histórico continua compatível:

```text
GET /api/v1/inventories/{inventory_id}/exports/xls
GET /api/v1/inventories/{inventory_id}/exports/xlsx
```

Para a interface, o endpoint explícito de Excel usa `.xls` como padrão:

```text
GET /api/v1/inventories/{inventory_id}/export/excel
GET /api/v1/inventories/{inventory_id}/export/excel?format=xls
GET /api/v1/inventories/{inventory_id}/export/excel?format=xlsx
```

Cada resposta é binária e inclui:

- `Content-Type: application/vnd.ms-excel` para `.xls`;
- `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` para `.xlsx`;
- `Content-Disposition: attachment` com nome sem acentos;
- `Content-Length` igual ao número de bytes transmitidos.

Os nomes seguem o padrão ISO da data do inventário, por exemplo:

```text
Inventario_2026-09-12.xls
Inventario_2026-09-12.xlsx
```

### Abas e compatibilidade visual

Sem referência SAP, os dois arquivos têm as abas nesta ordem:

1. `RESUMO`
2. `INVENTÁRIO`
3. `LOTES CONSOLIDADOS`
4. `LOTES PARA CONFERÊNCIA`

Com referência SAP ativa, é acrescentada uma quinta aba:

5. `CONCILIAÇÃO`

Tipos de célula: Vão e Quantidade são números (o vão só vira número quando a
conversão é exata, como `12`; um valor como `08` continua texto para sair
exatamente como lançado), Lote é texto de 10 dígitos com formato `@`, `Peças
fora` é numérica e fica vazia quando não se aplica, e a data do inventário é
célula de data (`DD/MM/YYYY`) na primeira linha de `RESUMO`. O subtítulo de
`RESUMO` traz revisão e "Gerado em"; as demais abas trazem data e revisão.

`LOTES CONSOLIDADOS` tem somente Lote, Total de peças, Localização e Situação.
Todo lote exportado é texto com exatamente 10 dígitos ASCII e prefixo `27` ou
`28`, conforme a regra única do domínio.
Para lote OK, a localização mostra apenas lado, vão e camada. Para conferência,
cada local aparece com sua quantidade.

`LOTES PARA CONFERÊNCIA` possui uma linha por lote e as colunas Lote, Total,
Situação, Local principal, Outros locais, Peças fora e Ação recomendada. A
aba não contém lotes OK.

### Conciliação opcional com SAP

Quando há uma referência ativa, `CONCILIAÇÃO` possui uma linha por lote físico
ou previsto e as colunas Lote, Referência, Físico, Localização, Qtd. física e
Condição. Ela evidencia previstos não encontrados e lotes físicos fora da
referência; a quantidade exibida continua sendo exclusivamente a quantidade
lançada fisicamente. A aba não é criada quando o inventário não possui
referência.

O relatório usa azul escuro `#1F4E78`, azul claro `#D9EAF7`, branco e cinza
neutro. OK recebe verde; uma peça fora recebe amarelo; múltiplas peças fora
recebem laranja; lote distribuído sem local principal confiável recebe
vermelho. O Excel legado mantém cabeçalho congelado, larguras definidas,
impressão em A4, quantidades numéricas, lotes como texto, linhas alternadas,
conteúdo centralizado e linhas de grade ocultas. Os dois formatos são
exportados sem filtros ou menus de filtro nas colunas.

No `.xls`, as linhas que contêm mais de um local ou texto longo recebem altura
proporcional à quebra de linha. `RESUMO`, `LOTES CONSOLIDADOS` e `LOTES PARA
CONFERÊNCIA` usam escala explícita de impressão, com redução adicional nas abas
mais largas, para manter suas colunas na largura imprimível do A4 legado.

O `.xls` não usa macros, links externos, tabelas estruturadas, fórmulas
dinâmicas ou recursos do Microsoft 365. Valores e totais são calculados no
backend. Por ser BIFF8, o arquivo possui o limite histórico de 65.536 linhas
por planilha e pode apresentar pequenas diferenças de renderização em relação
ao `.xlsx`.

### Testes

Validação rápida dos geradores:

```bash
backend/.venv/bin/python -m pytest backend/tests/test_reports.py backend/tests/test_reports_volume.py -q
```

`backend/tests/test_reports_golden.py` usa como fixture o inventário real de
06/10/2026, revisão 6 (`backend/tests/fixtures/inventario_2026-10-06_rev6.json`:
216 registros, 2.667 peças, 207 lotes). Ele lê de volta os quatro arquivos e
exige lançamentos idênticos à entrada, totais fechados, os mesmos lotes e
lotes para conferência em todos os formatos e no modelo de dados, tipos de
célula corretos no Excel, horário local, ausência de título órfão e falha
explícita quando os totais são adulterados.

Os testes verificam assinatura OLE do `.xls`, ZIP válido do `.xlsx`, abas,
ausência de filtros e linhas de grade, tamanho, totais iguais, lotes tratados
como texto e as mesmas situações visíveis nos quatro formatos.

## PDF e Word

PDF e Word usam a mesma fonte de dados e a mesma nomenclatura dos relatórios
Excel. O Word permanece em `.docx`, formato moderno já suportado pelo projeto.
Uma variante `.rtf` ou `.doc` não foi adicionada porque a estrutura atual não
oferece uma geração legada segura sem introduzir conversão externa ou alterar
o fluxo existente.

O PDF e o Word apresentam Resumo, Observação operacional, Inventário, Lotes
consolidados e Lotes para conferência. A data do inventário e a observação
aparecem uma única vez (subtítulo e seção própria), fora da tabela de resumo.
Títulos de seção nunca ficam sozinhos no fim da página: o PDF exige espaço
mínimo antes de cada título e o Word mantém o título com a tabela seguinte e
não parte linhas entre páginas. Quando há referência, acrescentam uma seção `Conciliação com
referência de lotes` com a mesma linha lógica e as mesmas colunas da aba Excel.
Ambos usam uma linha lógica por lote na seção de conferência, quebra de texto
para locais e ações e as quatro situações visíveis: OK, uma peça fora do local
principal, múltiplas peças fora do local principal e lote distribuído em mais
de um local. O PDF é A4 horizontal e o Word usa orientação horizontal para
evitar compressão das colunas operacionais.

O compartilhamento nativo continua oferecendo PDF, `.xlsx` e `.docx` por link
temporário assinado. O download direto oferece também o `.xls` compatível,
apresentado primeiro na interface.

No compartilhamento nativo, o link do `.xlsx` é enviado tanto no campo de URL
quanto no texto entregue ao aplicativo de e-mail, para que clientes que não
preservam o campo de URL ainda recebam um endereço utilizável. No envio de
relatório por e-mail pelo backend, os anexos selecionados continuam sendo
enviados e o corpo da mensagem inclui links temporários assinados para os
formatos modernos `.xlsx` e `.docx`.
