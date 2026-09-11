"""Borda HTTP sem estado do motor de inventário."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.engine import AnalysisEntry, analyze_entries
from app.schemas import AnalysisPreviewRequest, AnalysisReport

app = FastAPI(title="Inventário — análise", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/v1/analysis/preview", response_model=AnalysisReport)
def preview_analysis(payload: AnalysisPreviewRequest) -> dict[str, object]:
    return analyze_entries(
        inventory_id=str(payload.inventory.id),
        revision=payload.inventory.revision,
        entries=(
            AnalysisEntry(side=entry.side, bay=entry.bay, lot=entry.lot, quantity=entry.quantity)
            for entry in payload.entries
        ),
    )

