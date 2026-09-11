import { expect, it } from "vitest";

import { getCachedReport } from "@/lib/analysis-client";
import { db } from "@/lib/db";
import type { AnalysisReport } from "@/lib/models";

function report(revision: number): AnalysisReport {
  return {
    inventoryId: "inventory",
    revision,
    generatedAt: "2026-09-11T12:00:00.000Z",
    lots: [],
    summary: {
      lotsAnalyzed: 0,
      regularLots: 0,
      fragmentedLots: 0,
      loosePieces: 0,
      displacedGroups: 0,
      ambiguousDistributions: 0,
      reviewItems: 0,
    },
  };
}

it("usa a revisão exata e, sem ela, recupera somente o último cache do inventário", async () => {
  await db.analysisCache.bulkPut([
    { id: "inventory:1", inventoryId: "inventory", revision: 1, report: report(1), cachedAt: "2026-09-11T10:00:00.000Z" },
    { id: "inventory:2", inventoryId: "inventory", revision: 2, report: report(2), cachedAt: "2026-09-11T11:00:00.000Z" },
    { id: "other:9", inventoryId: "other", revision: 9, report: { ...report(9), inventoryId: "other" }, cachedAt: "2026-09-11T12:00:00.000Z" },
  ]);

  expect((await getCachedReport("inventory", 1))?.revision).toBe(1);
  expect((await getCachedReport("inventory", 3))?.revision).toBe(2);
});

