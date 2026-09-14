# Exportações

## Excel

O formato padrão da equipe é `.xls`, porque os computadores antigos usados na
operação não abrem `.xlsx`. O backend gera esse arquivo diretamente em BIFF8,
formato do Excel 97-2003, usando `xlwt`. Não há renomeação de `.xlsx`,
conversão no navegador ou dependência do LibreOffice no servidor.

O formato `.xlsx` continua disponível para computadores modernos e é gerado
com `openpyxl`. Os dois formatos usam a mesma fonte de dados:

```text
build_inventory_report_data(...)
    ├── generate_xls_report(report)
    └── generate_xlsx_report(report)
```

O modelo comum preserva inventário, vão, lado DE/EF, camada quando informada,
lote, quantidade, totais, lotes consolidados, divergências, recomendações e a
classificação de lotes fragmentados produzida pelo motor de análise.

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

Os dois arquivos têm as abas nesta ordem:

1. `RESUMO`
2. `INVENTÁRIO`
3. `LOTES CONSOLIDADOS`
4. `DIVERGÊNCIAS`

O relatório usa azul escuro `#1F4E78`, azul claro `#D9EAF7`, branco e cinza
neutro. Divergências recebem preenchimento estático vermelho, laranja ou
amarelo, e situações regulares recebem verde. O Excel legado mantém cabeçalho
congelado, área de filtro BIFF8, larguras definidas, impressão em A4,
quantidades numéricas, lotes como texto e linhas alternadas.

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

Os testes verificam assinatura OLE do `.xls`, ZIP válido do `.xlsx`, abas,
filtros, tamanho, totais iguais, inventário sem divergências e inventário de
volume com lotes fragmentados.

## PDF e Word

PDF e Word usam a mesma fonte de dados dos relatórios Excel. O Word permanece
em `.docx`, formato moderno já suportado pelo projeto. Uma variante `.rtf` ou
`.doc` não foi adicionada porque a estrutura atual não oferece uma geração
legada segura sem introduzir conversão externa ou alterar o fluxo existente.

O compartilhamento nativo continua oferecendo PDF, `.xlsx` e `.docx` por link
temporário assinado. O download direto oferece também o `.xls` compatível,
apresentado primeiro na interface.
