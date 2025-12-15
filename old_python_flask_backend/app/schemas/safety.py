"""Safety snapshot request/response schemas."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class SafetyCell(BaseModel):
    """Individual safety cell in the heatmap grid.

    Each cell represents a geographic area with aggregated crime statistics
    and computed safety/risk scores based on historical crime data.
    """

    id: str = Field(..., description="Unique cell identifier (H3 hex or grid cell ID)")
    geometry: Dict[str, Any] = Field(
        ...,
        description="GeoJSON geometry object (Polygon) representing the cell boundary in WGS84 (EPSG:4326)",
    )
    safety_score: float = Field(
        ...,
        ge=0.0,
        le=100.0,
        description="Safety score (0-100, higher is safer). Inverse of risk_score.",
    )
    risk_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Normalized risk score (0-1, higher is more dangerous)",
    )
    crime_count: int = Field(
        ..., ge=0, description="Total number of crimes in this cell across all months"
    )
    crime_count_weighted: float = Field(
        ...,
        ge=0.0,
        description="Weighted crime count applying harm weights, recency decay, and time-of-day factors",
    )
    months_data: int = Field(
        ..., ge=1, description="Number of months with available data for this cell"
    )
    crime_breakdown: Dict[str, int] = Field(
        default_factory=dict,
        description="Crime count breakdown by category (e.g., {'burglary': 5, 'violence': 3})",
    )

    class Config:
        json_schema_extra = {
            "example": {
                "id": "891e204d89fffff",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [-1.4044, 50.9008],
                            [-1.4035, 50.9015],
                            [-1.4025, 50.9008],
                            [-1.4025, 50.8995],
                            [-1.4035, 50.8988],
                            [-1.4044, 50.8995],
                            [-1.4044, 50.9008],
                        ]
                    ],
                },
                "safety_score": 82.5,
                "risk_score": 0.175,
                "crime_count": 12,
                "crime_count_weighted": 18.4,
                "months_data": 12,
                "crime_breakdown": {
                    "burglary": 4,
                    "vehicle-crime": 3,
                    "anti-social-behaviour": 5,
                },
            }
        }


class SafetySummary(BaseModel):
    """Aggregate statistics for the safety snapshot.

    Provides overview metrics across all cells in the requested bounding box.
    """

    total_cells: int = Field(..., ge=0, description="Total number of cells in response")
    total_crimes: int = Field(
        ..., ge=0, description="Total crimes across all cells in the time period"
    )
    avg_safety_score: float = Field(
        ...,
        ge=0.0,
        le=100.0,
        description="Average safety score across all cells (100 = perfectly safe if no data)",
    )
    highest_risk_cell: Optional[str] = Field(
        None, description="Cell ID with highest risk (None if no data)"
    )
    lowest_risk_cell: Optional[str] = Field(
        None, description="Cell ID with lowest risk (None if no data)"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "total_cells": 248,
                "total_crimes": 1523,
                "avg_safety_score": 78.3,
                "highest_risk_cell": "891e204d89fffff",
                "lowest_risk_cell": "891e204c12fffff",
            }
        }


class SafetyMeta(BaseModel):
    """Metadata about the safety snapshot request.

    Includes information about the spatial extent, grid configuration,
    and temporal parameters used to generate the snapshot.
    """

    bbox: List[float] = Field(
        ...,
        min_length=4,
        max_length=4,
        description="Bounding box as [min_lng, min_lat, max_lng, max_lat] in WGS84",
    )
    cell_size_m: int = Field(..., gt=0, description="Cell size in meters (approximate)")
    grid_type: str = Field(..., description="Grid system used (e.g., 'h3', 'geohash')")
    lookback_months: int = Field(
        ..., ge=1, le=24, description="Number of months of historical data included"
    )
    time_filter: Optional[str] = Field(
        None,
        description="Time-of-day filter applied (night|morning|day|evening), if any",
    )
    months_included: int = Field(..., ge=1, description="Actual number of months with data")

    class Config:
        json_schema_extra = {
            "example": {
                "bbox": [-1.4044, 50.9008, -1.3726, 50.9197],
                "cell_size_m": 500,
                "grid_type": "h3",
                "lookback_months": 12,
                "time_filter": "night",
                "months_included": 12,
            }
        }


class SafetySnapshotResponse(BaseModel):
    """Complete safety snapshot response.

    Returns a heatmap-ready dataset of safety cells with aggregated crime
    statistics, safety scores, and metadata for the requested geographic area.

    The response is designed to be directly consumable by frontend mapping
    libraries for rendering safety heatmaps.
    """

    cells: List[SafetyCell] = Field(
        ...,
        description="List of safety cells, sorted by risk_score (highest first)",
    )
    summary: SafetySummary = Field(..., description="Aggregate statistics across all cells")
    meta: SafetyMeta = Field(..., description="Request metadata and configuration")

    class Config:
        json_schema_extra = {
            "example": {
                "cells": [
                    {
                        "id": "891e204d89fffff",
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [
                                [
                                    [-1.4044, 50.9008],
                                    [-1.4035, 50.9015],
                                    [-1.4025, 50.9008],
                                    [-1.4025, 50.8995],
                                    [-1.4035, 50.8988],
                                    [-1.4044, 50.8995],
                                    [-1.4044, 50.9008],
                                ]
                            ],
                        },
                        "safety_score": 65.2,
                        "risk_score": 0.348,
                        "crime_count": 28,
                        "crime_count_weighted": 42.6,
                        "months_data": 12,
                        "crime_breakdown": {
                            "burglary": 8,
                            "violence": 12,
                            "vehicle-crime": 5,
                            "anti-social-behaviour": 3,
                        },
                    },
                    {
                        "id": "891e204c12fffff",
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [
                                [
                                    [-1.4034, 50.9020],
                                    [-1.4025, 50.9027],
                                    [-1.4015, 50.9020],
                                    [-1.4015, 50.9007],
                                    [-1.4025, 50.9000],
                                    [-1.4034, 50.9007],
                                    [-1.4034, 50.9020],
                                ]
                            ],
                        },
                        "safety_score": 92.1,
                        "risk_score": 0.079,
                        "crime_count": 3,
                        "crime_count_weighted": 4.8,
                        "months_data": 11,
                        "crime_breakdown": {"anti-social-behaviour": 3},
                    },
                ],
                "summary": {
                    "total_cells": 248,
                    "total_crimes": 1523,
                    "avg_safety_score": 78.3,
                    "highest_risk_cell": "891e204d89fffff",
                    "lowest_risk_cell": "891e204c12fffff",
                },
                "meta": {
                    "bbox": [-1.4044, 50.9008, -1.3726, 50.9197],
                    "cell_size_m": 500,
                    "grid_type": "h3",
                    "lookback_months": 12,
                    "time_filter": "night",
                    "months_included": 12,
                },
            }
        }


class ErrorResponse(BaseModel):
    """Standard error response schema.

    Used across all endpoints for consistent error reporting.
    """

    error: str = Field(..., description="Error type or exception class name")
    message: str = Field(..., description="Human-readable error message")
    path: str = Field(..., description="API endpoint path where error occurred")

    class Config:
        json_schema_extra = {
            "example": {
                "error": "ValidationError",
                "message": "Invalid bbox: Longitude must be between -180 and 180",
                "path": "/api/v1/safety/snapshot",
            }
        }
