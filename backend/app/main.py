"""Borda HTTP para análise pura e sincronização central."""

from contextlib import asynccontextmanager
import os

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import Base, database_url, engine, get_session
from app.engine import AnalysisEntry, analyze_entries
from app.schemas import AnalysisPreviewRequest, AnalysisReport, SyncRequest, SyncResponse
from app.sync_service import SyncAuthorizationError, SyncNotFoundError, synchronize


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # SQLite existe só para desenvolvimento local. PostgreSQL de produção é
    # preparado exclusivamente por Alembic, antes de iniciar a API.
    if database_url().startswith("sqlite"):
        Base.metadata.create_all(engine)
    yield


app = FastAPI(title="Inventário — análise e sincronização", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("INVENTORY_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if origin.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Inventory-Sync-Token"],
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


@app.post("/api/v1/sync", response_model=SyncResponse)
def sync(
    payload: SyncRequest,
    sync_token: str = Header(min_length=32, alias="X-Inventory-Sync-Token"),
    session: Session = Depends(get_session),
) -> dict[str, object]:
    try:
        return synchronize(session, payload, sync_token)
    except SyncNotFoundError as error:
        session.rollback()
        raise HTTPException(status_code=404, detail="Inventário central não encontrado.") from error
    except SyncAuthorizationError as error:
        session.rollback()
        raise HTTPException(status_code=403, detail="Código de sincronização inválido.") from error
    except SQLAlchemyError as error:
        session.rollback()
        raise HTTPException(status_code=503, detail="Persistência central indisponível.") from error
