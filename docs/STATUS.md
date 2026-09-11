# Status do Projeto

## Fase atual

Fase 1 — núcleo offline e motor determinístico de análise. Encerrada e pronta para checkpoint Git; a Fase 2 não foi iniciada.

## Concluído

- Frontend Next.js/TypeScript mobile-first com Dexie/IndexedDB como fonte local.
- Criação e reabertura de inventários, UUIDv7, data local `YYYY-MM-DD`, revisão, `syncStatus` e tombstones.
- Lançamento, edição, exclusão com confirmação e listagem de ocorrências individuais por EF/DE e vão, com ordenação natural.
- Service worker Serwist para shell offline no build de produção.
- FastAPI sem persistência remota e motor puro de análise.
- Cache do último relatório por revisão, com identificação de possível desatualização quando só há cache anterior.

## Validado

- `pnpm dev` iniciou sem erro em `http://localhost:3000`; `GET /healthz` respondeu em `http://localhost:8000`.
- Validação funcional em Chromium: criação com data automática, EF/DE, retenção de lado/vão, limpeza de lote/quantidade, foco no lote, análise `19 + 1`, edição, confirmação de exclusão, recarga e persistência IndexedDB.
- Motor chamado pelo FastAPI: `19 + 1` resultou em `PEÇA_SOLTEIRA`; `10 + 10`, em `DISTRIBUIÇÃO_AMBÍGUA` sem local principal; `15 + 2 + 3`, em `GRUPO_DESLOCADO` com cinco peças deslocadas.
- Lint e checagem de tipos do frontend; 8 testes Vitest; 8 testes Pytest; build de produção com `sw.js`; 2 testes Playwright de fluxo online/offline.
- Inspeção responsiva em viewport 390 × 844 sem corte horizontal.

## Pendente

- Sincronização entre dispositivos, resolução de conflitos e PostgreSQL central.
- Exportações Excel/PDF/Word, finalização, histórico completo, autenticação, deploy e publicação.
- Teste em Android físico, Safari/iPhone físico, comportamento PWA real no iOS e validação operacional em ambiente real.

## Problemas conhecidos

- Não há bloqueadores conhecidos na Fase 1.
- O `TestClient` das dependências FastAPI/Starlette emite dois avisos de depreciação durante `pytest`; a suíte passa e não há impacto funcional observado.
- O navegador interno do Codex não concluiu IndexedDB durante a inspeção, mas o Chromium local e os fluxos Playwright concluíram; isso é limitação do ambiente de automação, não uma compatibilidade móvel validada.

## Decisões técnicas

- IndexedDB/Dexie é a fonte de verdade desta fase; não há banco central nem sincronização simulada.
- Serwist é aplicado e registrado somente em produção. Next usa webpack porque a integração atual não suporta Turbopack; `allowedDevOrigins` inclui `127.0.0.1` para a validação local de desenvolvimento.
- Lote e vão são texto; a consolidação ocorre apenas no motor Python. Não há mesclagem de lançamentos na interface.
- O motor considera local principal apenas quando o maior local é único e tem pelo menos três vezes a soma dos demais.

## Próxima fase

FASE 2
Backend central + banco + sincronização entre dispositivos.

## Último checkpoint

Fase 1 estabilizada, validada e documentada em 11/09/2026. Checkpoint Git: `4de6406`.
