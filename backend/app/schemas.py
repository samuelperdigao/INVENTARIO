"""Contrato HTTP validado pelo FastAPI."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator


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


class SyncInventory(ApiModel):
    id: UUID
    date: date
    status: Literal["OPEN"]
    createdAt: datetime
    updatedAt: datetime
    revision: StrictInt = Field(ge=1)
    syncBaseRevision: StrictInt = Field(ge=0)
    tombstone: bool
    deletedAt: datetime | None = None


class SyncEntry(ApiModel):
    id: UUID
    inventoryId: UUID
    side: Literal["EF", "DE"]
    bay: str = Field(min_length=1, max_length=100)
    lot: str = Field(min_length=1, max_length=255)
    quantity: StrictInt = Field(gt=0)
    createdAt: datetime
    updatedAt: datetime
    revision: StrictInt = Field(ge=1)
    syncBaseRevision: StrictInt = Field(ge=0)
    tombstone: bool
    deletedAt: datetime | None = None


class SyncRequest(ApiModel):
    deviceId: UUID
    inventoryId: UUID
    teamId: UUID | None = None
    cursor: StrictInt = Field(ge=0)
    inventory: SyncInventory | None = None
    entries: list[SyncEntry] = Field(default_factory=list, max_length=1_000)

    @model_validator(mode="after")
    def validate_inventory_scope(self) -> "SyncRequest":
        if self.inventory is not None and self.inventory.id != self.inventoryId:
            raise ValueError("O inventário enviado não corresponde ao escopo da sincronização.")
        if any(entry.inventoryId != self.inventoryId for entry in self.entries):
            raise ValueError("Todo lançamento deve pertencer ao inventário sincronizado.")
        if len({entry.id for entry in self.entries}) != len(self.entries):
            raise ValueError("Não envie o mesmo lançamento mais de uma vez na mesma sincronização.")
        return self


class SyncAcknowledgement(ApiModel):
    inventory: bool
    entryIds: list[UUID]


class SyncConflict(ApiModel):
    entityType: Literal["inventory", "entry"]
    entityId: UUID
    serverRecord: dict[str, Any]


class SyncResponse(ApiModel):
    cursor: StrictInt = Field(ge=0)
    inventory: SyncInventory | None
    entries: list[SyncEntry]
    acknowledged: SyncAcknowledgement
    conflicts: list[SyncConflict]


class RegisterRequest(ApiModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=12, max_length=256)
    displayName: str = Field(min_length=1, max_length=120)
    teamName: str = Field(min_length=1, max_length=120)


class LoginRequest(ApiModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=256)


class TeamMember(ApiModel):
    id: UUID
    name: str
    role: Literal["ADMIN", "OPERATOR"]


class AuthenticatedUser(ApiModel):
    id: UUID
    email: str
    displayName: str
    teams: list[TeamMember]


class AuthResponse(ApiModel):
    accessToken: str
    user: AuthenticatedUser


class CreateTeamRequest(ApiModel):
    name: str = Field(min_length=1, max_length=120)


class AddTeamMemberRequest(ApiModel):
    email: str = Field(min_length=3, max_length=320)
    role: Literal["ADMIN", "OPERATOR"] = "OPERATOR"
