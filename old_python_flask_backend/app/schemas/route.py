"""Route request/response schemas."""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class Coordinate(BaseModel):
    """Geographic coordinate."""

    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


class RoutePreferences(BaseModel):
    """Route safety scoring preferences."""

    safety_weight: float = Field(default=0.8, ge=0.0, le=1.0)
    lookback_months: int = Field(default=12, ge=3, le=24)
    time_of_day_sensitive: bool = True
    category_weights: Optional[Dict[str, float]] = None


class SafeRouteRequest(BaseModel):
    """Request for safe routes."""

    origin: Coordinate
    destination: Coordinate
    mode: str = Field(default="foot-walking")
    departure_time: Optional[datetime] = None
    preferences: Optional[RoutePreferences] = Field(default_factory=RoutePreferences)


class RouteSegment(BaseModel):
    """Individual route segment safety data."""

    segment_index: int
    start_point: List[float]
    end_point: List[float]
    risk_score: float
    cell_count: int


class RouteHotspot(BaseModel):
    """Crime hotspot along route."""

    segment_index: int
    location: List[float]
    risk_score: float
    risk_level: str  # "critical" or "high"
    description: str


class RouteStats(BaseModel):
    """Route safety statistics."""

    total_weighted_risk: float
    max_segment_risk: float
    avg_segment_risk: float = 0.0
    segment_count: int = 0
    segments: List[RouteSegment] = []
    hotspots: List[RouteHotspot] = []
    crime_breakdown: Dict[str, float] = {}
    cells_analyzed: int = 0


class RouteResponse(BaseModel):
    """Single route response."""

    id: str
    rank: int
    is_recommended: bool
    safety_score: float
    risk_class: str  # low, medium, high
    distance_m: int
    duration_s: int
    geometry: Dict
    instructions: List[Dict] = []
    stats: RouteStats


class SafeRouteResponse(BaseModel):
    """Response with multiple safe route options."""

    routes: List[RouteResponse]
    meta: Dict[str, Any]
