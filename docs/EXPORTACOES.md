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

Os dois arquivos são gerados a partir da mesma lista de abas
(`excel_sheets(view)` em `backend/app/reports.py`), por isso trazem
exatamente a mesma informação, célula por célula; um teste golden compara o
`.xls` com o `.xlsx`. Sem referência SAP, as abas são:

1. `PAINEL`: data do inventário (célula de data), revisão, "Gerado em",
   indicadores (registros, peças, lotes, vãos, lotes OK, lotes para
   conferência e contagem por estado, peças e registros por lado), observação,
   quadro "Conferência dos totais", quadro por lado e mapa de peças por vão
   (linhas por vão, colunas EF, DE e Total).
2. `CONFERÊNCIA`: uma linha por lote para conferência, na ordem de trajeto no
   pátio, com Ordem, Lote, Total, Situação, Local principal, Outros locais,
   Peças fora e Ação recomendada. Sem lote para conferência, uma linha avisa
   que nenhum lote precisa de conferência.
3. `LANÇAMENTOS`: cada lançamento exatamente como foi gerado (Lado, Vão,
   Camada, Lote, Quantidade de peças).
4. `POR VÃO`: Lado, Vão, Registros e Peças de cada vão.
5. `LOTES`: uma linha por lote e local, com Lote, Situação, Total do lote,
   Lado, Vão, Camada, Peças no local e Local principal (`Sim`, `Não` ou `Não
   definido` para lote distribuído). A soma de "Peças no local" é o total de
   peças do inventário.

Com referência SAP ativa, é acrescentada a aba `CONCILIAÇÃO`.

Nas abas de dados o cabeçalho fica na linha 1, congelado, sem linhas de
título acima; data e revisão vão para o cabeçalho de impressão e o rodapé traz
`Página X de Y`. Só o `.xlsx` recebe filtro automático nas abas de dados e um
gráfico de peças por vão e lado na aba `PAINEL`; esses são extras de
navegação e não acrescentam informação que falte ao `.xls`.

Tipos de célula: Vão e Quantidade são números (o vão só vira número quando a
conversão é exata, como `12`; um valor como `08` continua texto para sair
exatamente como lançado), Lote é texto de 10 dígitos com formato `@`, `Peças
fora` é numérica e fica vazia quando não se aplica, e a data do inventário é
célula de data (`DD/MM/YYYY`). Todo lote exportado é texto com exatamente 10
dígitos ASCII e prefixo `27` ou `28`, conforme a regra única do domínio.

### Conciliação opcional com SAP

Quando há uma referência ativa, `CONCILIAÇÃO` possui uma linha por lote físico
ou previsto e as colunas Lote, Referência, Físico, Localização, Qtd. física e
Condição. Ela evidencia previstos não encontrados e lotes físicos fora da
referência; a quantidade exibida continua sendo exclusivamente a quantidade
lançada fisicamente. A aba não é criada quando o inventário não possui
referência.

Cor indica apenas estado, como no PDF e no Word: amarelo para uma peça fora,
laranja para múltiplas peças fora ou revisão, vermelho para lote distribuído;
lote OK não tem cor. Cabeçalhos usam navy `#003b63`. No `.xls` essas cores
são gravadas na paleta do próprio arquivo BIFF8 para manter os mesmos tons.
Linhas de grade ficam ocultas e a impressão é em A4.

No `.xls`, as linhas com mais de um local ou texto longo recebem altura
proporcional à quebra de linha, e cada aba usa escala explícita de impressão
calculada pela soma das larguras, para caber na largura imprimível do A4.

O `.xls` não usa macros, links externos, tabelas estruturadas, filtros,
gráficos, fórmulas dinâmicas ou recursos do Microsoft 365. Valores e totais
são calculados no backend. Por ser BIFF8, o arquivo possui o limite histórico
de 65.536 linhas por planilha e pode apresentar pequenas diferenças de
renderização em relação ao `.xlsx`.

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
filtro e gráfico só no `.xlsx`, ausência de linhas de grade, tamanho, totais iguais, lotes tratados
como texto e as mesmas situações visíveis nos quatro formatos.

## PDF e Word

PDF e Word usam a mesma fonte de dados e a mesma nomenclatura dos relatórios
Excel. O Word permanece em `.docx`, formato moderno já suportado pelo projeto.
Uma variante `.rtf` ou `.doc` não foi adicionada porque a estrutura atual não
oferece uma geração legada segura sem introduzir conversão externa ou alterar
o fluxo existente.

O PDF e o Word são destinados à liderança da área de logística e seguem a
mesma estrutura, em A4 horizontal:

1. **Painel**: registros, peças, lotes e vãos; linha `200 lotes OK × 7 para
   conferência` com a contagem por estado; quadro por lado (EF/DE: registros,
   peças, vãos e lotes); quadro "Conferência dos totais" (soma dos
   lançamentos, soma dos lotes, total do resumo, soma dos subtotais por vão e
   registros lançados × resumo, todos vindos da autoverificação); mapa de
   peças por lado × vão; resumo da referência SAP quando houver; observação
   operacional.
2. **Lotes para conferência**: uma linha por lote, numerada na ordem de
   trajeto no pátio (lado EF e depois DE, vãos e camadas em ordem crescente,
   pelo local principal ou, sem local principal, pelo primeiro local do
   lote), com situação, local principal, outros locais, peças fora e ação.
3. **Lançamentos por lado e vão**: cada lançamento exatamente como foi
   gerado, agrupado por lado e vão, com subtotal por vão, total por lado e
   total geral. Duas colunas por página.
4. **Anexo: lotes consolidados**: todos os lotes com peças, localização e
   situação, em duas colunas por página.
5. **Conciliação com referência de lotes**, somente quando há referência,
   com as mesmas colunas da aba Excel.

Cor indica apenas estado: amarelo para uma peça fora, laranja para múltiplas
peças fora ou revisão, vermelho para lote distribuído. Lotes OK não têm cor.
Cabeçalhos usam navy `#003b63`; subtotais e totais usam cinza neutro e o
total geral usa navy. Data do inventário, revisão e "Gerado em" aparecem uma
única vez, no subtítulo. Títulos de seção nunca ficam sozinhos no fim da
página: o PDF exige espaço mínimo antes de cada título e o Word mantém o
título com a tabela seguinte e não parte linhas entre páginas. No inventário
de referência (216 registros) o PDF tem 9 páginas, contra 20 da estrutura
anterior.

O compartilhamento nativo continua oferecendo PDF, `.xlsx` e `.docx` por link
temporário assinado. O download direto oferece também o `.xls` compatível,
apresentado primeiro na interface.

No compartilhamento nativo, o link do `.xlsx` é enviado tanto no campo de URL
quanto no texto entregue ao aplicativo de e-mail, para que clientes que não
preservam o campo de URL ainda recebam um endereço utilizável. No envio de
relatório por e-mail pelo backend, os anexos selecionados continuam sendo
enviados e o corpo da mensagem inclui links temporários assinados para os
formatos modernos `.xlsx` e `.docx`.
