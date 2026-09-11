"""Contrato HTTP validado pelo FastAPI."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictInt


class ApiModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)


class PreviewInventory(ApiModel):
    id: UUID
    date: date
    revision: StrictInt = Field(ge=1)


class PreviewEntry(ApiModel):
    id: UUID
    side: Literal["EF", "DE"]
    bay: str = Field(min_length=1, max_length=100)
    lot: str = Field(min_length=1, max_length=255)
    quantity: StrictInt = Field(gt=0)


class AnalysisPreviewRequest(ApiModel):
    inventory: PreviewInventory
    entries: list[PreviewEntry]


class AnalysisLocation(ApiModel):
    side: Literal["EF", "DE"]
    bay: str
    quantity: StrictInt = Field(gt=0)


class LotAnalysis(ApiModel):
    lot: str
    totalQuantity: StrictInt = Field(gt=0)
    locations: list[AnalysisLocation]
    fragmented: bool
    classification: Literal[
        "OK",
        "PEÇA_SOLTEIRA",
        "GRUPO_DESLOCADO",
        "DISTRIBUIÇÃO_AMBÍGUA",
        "REVISAR",
    ]
    primaryLocation: AnalysisLocation | None = None
    displacedQuantity: StrictInt = Field(ge=0)
    recommendation: str | None = None


class AnalysisSummary(ApiModel):
    lotsAnalyzed: StrictInt = Field(ge=0)
    regularLots: StrictInt = Field(ge=0)
    fragmentedLots: StrictInt = Field(ge=0)
    loosePieces: StrictInt = Field(ge=0)
    displacedGroups: StrictInt = Field(ge=0)
    ambiguousDistributions: StrictInt = Field(ge=0)
    reviewItems: StrictInt = Field(ge=0)


class AnalysisReport(ApiModel):
    inventoryId: UUID
    revision: StrictInt = Field(ge=1)
    generatedAt: datetime
    lots: list[LotAnalysis]
    summary: AnalysisSummary

