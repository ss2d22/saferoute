"""History-related schemas."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class RouteHistoryItem(BaseModel):
    """Single route history item."""

    id: str
    created_at: datetime
    origin: dict  # {"lat": float, "lng": float}
    destination: dict
    mode: str
    safety_score_best: Optional[float]
    distance_m_best: Optional[int]
    duration_s_best: Optional[int]

    class Config:
        from_attributes = True


class HistoryListResponse(BaseModel):
    """Paginated history list response."""

    items: List[RouteHistoryItem]
    total: int
    limit: int
    offset: int


class DeleteHistoryResponse(BaseModel):
    """Response for history deletion."""

    message: str
    deleted_count: int
