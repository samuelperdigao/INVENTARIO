# Handoff técnico — refinamento visual do INVENTARIO

Atualizado em: 17/09/2026  
Checkout: `C:\Projetos\INVENTARIO`  
Branch: `codex/refino-visual-inventario`  
Base: `409ed5d docs: confirmar deploy funcional do Render`

## Objetivo da tarefa

Concluir o refinamento visual e operacional do fluxo de inventário em mobile, tablet e desktop, mantendo intactos os contratos de negócio, autenticação, sincronização, finalização e operação offline-first.

Diretrizes preservadas:

- IndexedDB/Dexie continua sendo a fonte primária para lançar, editar e excluir registros.
- A referência SAP continua opcional e não bloqueia lançamentos físicos.
- Não expor UUID, token, IDs internos, FastAPI ou outros termos técnicos na interface.
- Não alterar API, regras de lote, motor Python, exportações ou semântica de finalização irreversível.

## Estado atual

O trabalho está implementado localmente, mas ainda não foi commitado, integrado à `main`, enviado ao remoto ou publicado.

`git status` no momento:

```text
 M app/globals.css
 M components/analysis-panel.tsx
 M components/entry-form.tsx
 M components/entry-list.tsx
 M components/finalization-panel.tsx
 M components/history-panel.tsx
 M components/inventory-home.tsx
 M components/inventory-screen.tsx
 M components/reference-panel.tsx
 M components/sync-panel.tsx
 M e2e/sync.spec.ts
?? components/inventory-control-panel.tsx
?? e2e/visual-operational.spec.ts
```

Não há alterações de backend nesta rodada.

## O que já foi alterado

### Fluxo de inventário

- `components/inventory-control-panel.tsx`: novo painel único para as etapas 03 Sincronizar, 04 Analisar e 05 Finalizar, com estados visíveis e `<details>` acessíveis.
- `components/inventory-screen.tsx`:
  - removeu o fluxo duplicado horizontal;
  - manteve o rail desktop de cinco etapas e reduziu o rail mobile à etapa atual;
  - moveu a referência SAP para antes do primeiro lançamento;
  - adicionou skeleton de carregamento e tela de inventário indisponível sem IDs internos;
  - adicionou destaque temporário no registro recém-criado/editado;
  - ajustou a comunicação para operação offline.
- `components/entry-form.tsx`: feedback após salvar e CTA visível `Adicionar registro`, mantendo `aria-label="Adicionar"` para compatibilidade dos testes existentes.
- `components/entry-list.tsx`: destaque visual acessível para o registro recém-salvo.

### Painéis e linguagem

- `components/reference-panel.tsx`: estados `Opcional`, `Planilha importada`, `Não utilizada`, `Processando` e `Com erro`; ação de continuar sem planilha; importação permanece opcional.
- `components/sync-panel.tsx`: suporte a modo incorporado, `aria-busy` e linguagem operacional sem detalhes de infraestrutura.
- `components/analysis-panel.tsx`: estados reportados ao painel único e ação incorporada `Atualizar análise`; removida menção à FastAPI.
- `components/finalization-panel.tsx`: ação incorporada e estado de prontidão explícito, sem alterar as regras de finalização.
- `components/inventory-home.tsx`: skeleton e texto de segurança orientado ao usuário.
- `components/history-panel.tsx`: skeleton acessível no carregamento.

### Estilos e validação visual

- `app/globals.css`: bloco de refinamento responsivo adicionado ao final para evitar regressões nos estilos legados. Inclui:
  - layout mobile/tablet/desktop;
  - rail sticky em larguras intermediárias e desktop;
  - CTA móvel com área de toque mínima de 48px;
  - painel único de controle;
  - estados de loading, sucesso, atenção e erro;
  - redução de movimento e prevenção de overflow horizontal.
- `e2e/visual-operational.spec.ts`: validação nos viewports 390, 430, 768, 1024, 1366, 1440 e 1920px, incluindo overflow, ordem SAP, rail, colunas, CTA, três etapas de controle e remoção de linguagem técnica.
- `e2e/sync.spec.ts`: expectativa ajustada para não conflitar com o novo `role="status"` do feedback de salvamento.

## Validações já executadas

- Lint: aprovado na execução mais recente.
- TypeScript: aprovado com `rtk proxy pnpm exec tsc --noEmit`.
- Vitest: `13` arquivos e `61` testes aprovados.
- `git diff --check`: aprovado.
- Teste visual operacional: aprovado em uma execução anterior, antes dos últimos ajustes pontuais em análise/sincronização; deve ser repetido após o estado final.
- Build de produção: aprovado antes do último ajuste do `AnalysisPanel`; deve ser repetido.
- Verificação manual via navegador local: fluxo offline conseguiu adicionar um registro e confirmou que o rail mobile, a referência SAP, o painel único e a remoção de texto técnico aparecem corretamente.

## Falhas conhecidas já corrigidas, ainda não revalidadas

A suíte E2E completa foi executada antes dos últimos patches e terminou com 4 falhas em 8 testes:

1. `analysis.spec.ts`: botão `Atualizar análise` não estava renderizado no modo incorporado.
2. `history-locations.spec.ts`: mesma ausência do botão de análise.
3. `sync.spec.ts`: conflito de expectativa com `role="status"` do feedback de salvamento.
4. `volume-100.spec.ts`: mesma ausência do botão de análise.

O `AnalysisPanel` agora renderiza a ação incorporada e o teste de sincronização foi ajustado. É obrigatório repetir os testes antes de considerar a tarefa concluída.

## Próxima sequência exata

1. Verificar processos locais e o status do checkout; não apagar alterações existentes.
2. Reexecutar os gates rápidos:

```powershell
rtk pnpm lint
rtk proxy pnpm exec tsc --noEmit
rtk pnpm test
rtk git diff --check
```

3. Garantir a API local na porta 8000. Se o processo anterior não estiver ativo:

```powershell
$env:INVENTORY_DATABASE_URL='sqlite:///./backend/inventario-e2e.db'
rtk backend/.venv/Scripts/python.exe -m alembic -c backend/alembic.ini upgrade head
rtk backend/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

4. Reexecutar o build com proxy local:

```powershell
$env:BACKEND_PROXY_URL='http://127.0.0.1:8000'
rtk pnpm build
$code=$LASTEXITCODE
Remove-Item Env:BACKEND_PROXY_URL
exit $code
```

5. Rodar primeiro os testes afetados e o teste visual:

```powershell
rtk pnpm e2e e2e/analysis.spec.ts e2e/history-locations.spec.ts e2e/sync.spec.ts e2e/visual-operational.spec.ts
```

6. Se passarem, executar a suíte completa:

```powershell
rtk pnpm e2e
```

7. Executar os testes de backend, mesmo sem alteração de backend, para fechar o ciclo do repositório:

```powershell
rtk backend/.venv/Scripts/python.exe -m pytest backend/tests -q
```

8. Subir com `pnpm start` e fazer uma verificação visual/console em `/acesso` e em uma rota de inventário. `agent-browser` não estava disponível; a verificação anterior usou CUA e Playwright E2E.
9. Revisar o diff completo, confirmar que `next-env.d.ts` não ficou alterado apenas por geração local e registrar limitações reais em `docs/STATUS.md`.
10. Fazer commit pequeno, por exemplo:

```text
feat: refinar interface operacional do inventario
```

11. Antes de atualizar a `main`, fazer `git fetch origin` e comparar commits. Integrar por fast-forward/merge sem reescrever histórico; fazer push sem force push.
12. Confirmar a publicação automática da Vercel e verificar o ambiente público. A API/Render não foi alterada nesta tarefa; apenas validar saúde e proxy, sem alterar Neon/Render.

## Pendências e limites reais

- O estado atual ainda é de trabalho não commitado.
- A suíte E2E completa precisa ser repetida depois dos patches recentes.
- Ainda falta build final, integração, push e confirmação pública da Vercel.
- A validação física em Android real e iPhone/Safari continua pendente; Chromium local não substitui esses dispositivos.
- Não usar credenciais de seed/local no handoff ou na documentação.

## Arquivos principais para retomar

- [app/globals.css](../app/globals.css)
- [components/inventory-screen.tsx](../components/inventory-screen.tsx)
- [components/inventory-control-panel.tsx](../components/inventory-control-panel.tsx)
- [components/reference-panel.tsx](../components/reference-panel.tsx)
- [components/analysis-panel.tsx](../components/analysis-panel.tsx)
- [components/sync-panel.tsx](../components/sync-panel.tsx)
- [components/finalization-panel.tsx](../components/finalization-panel.tsx)
- [e2e/visual-operational.spec.ts](../e2e/visual-operational.spec.ts)
- [AGENTS.md](../AGENTS.md)
- [docs/STATUS.md](STATUS.md)

Ao iniciar a próxima conversa, leia este arquivo, confirme `git status` e continue pela seção **Próxima sequência exata**, começando pela revalidação dos testes afetados.
