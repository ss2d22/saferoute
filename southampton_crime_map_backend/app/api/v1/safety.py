"""Safety heatmap API endpoints."""

import json
import logging
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from geoalchemy2.shape import to_shape
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import CRIME_TIME_WEIGHTS, get_settings
from app.db.base import get_db
from app.repositories.crime_repository import CrimeRepository
from app.schemas.safety import SafetyCell, SafetyMeta, SafetySnapshotResponse, SafetySummary
from app.services.cache_service import CacheService
from app.utils.scoring import calculate_months_ago, get_recency_weight

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()


@router.get(
    "/snapshot",
    response_model=SafetySnapshotResponse,
    summary="Get safety heatmap snapshot",
    description="""
    Returns safety grid cells for a geographic bounding box.

    Returns H3 hexagonal cells with safety scores calculated from UK Police crime data.
    Each cell covers approximately 73m and includes weighted crime counts, safety scores,
    and crime category breakdowns.

    **Features:**
    - Aggregates historical crime data with recency weighting
    - Optional time-of-day crime pattern weighting
    - Safety scores from 0-100 (higher = safer)
    - Results cached for 1 hour

    **Use Cases:**
    - Display safety heatmaps
    - Identify high-crime areas
    - Compare safety by time of day
    - Inform route planning
    """,
    responses={
        200: {
            "description": "Safety snapshot data with cells and metadata",
            "content": {
                "application/json": {
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
                                },
                            }
                        ],
                        "summary": {
                            "total_cells": 248,
                            "total_crimes": 1523,
                            "avg_safety_score": 78.3,
                        },
                        "meta": {
                            "bbox": [-1.4044, 50.9008, -1.3726, 50.9197],
                            "lookback_months": 12,
                            "time_filter": "night",
                        },
                    }
                }
            },
        },
        400: {
            "description": "Invalid request parameters",
            "content": {
                "application/json": {
                    "example": {
                        "error": "ValidationError",
                        "message": "Invalid bbox: Longitude must be between -180 and 180",
                        "path": "/api/v1/safety/snapshot",
                    }
                }
            },
        },
        500: {
            "description": "Internal server error",
            "content": {
                "application/json": {
                    "example": {
                        "error": "InternalServerError",
                        "message": "Error fetching safety snapshot: Database connection failed",
                        "path": "/api/v1/safety/snapshot",
                    }
                }
            },
        },
    },
)
async def get_safety_snapshot(
    bbox: str = Query(
        ...,
        description="Bounding box: min_lng,min_lat,max_lng,max_lat (WGS84)",
        example="-1.4044,50.9008,-1.3726,50.9197",
    ),
    lookback_months: int = Query(
        default=12,
        ge=1,
        le=24,
        description="Months of historical crime data (1-24)",
    ),
    time_of_day: str | None = Query(
        default=None,
        description="Time period: 'night', 'morning', 'day', or 'evening'",
        example="night",
    ),
    db: Session = Depends(get_db),
):
    """Get safety heatmap cells for a bounding box.

    Returns H3 cells with safety scores and crime stats. Cached for 1 hour.

    **Scoring:**
    1. Aggregate crimes by H3 cell
    2. Weight by crime severity
    3. Apply recency decay
    4. Apply time-of-day multipliers if specified
    5. Convert to 0-100 safety score

    **Time Periods:**
    - night: 22:00-06:00
    - morning: 06:00-09:00
    - day: 09:00-17:00
    - evening: 17:00-22:00
    """
    try:
        # Try to get from cache first
        cache_service = CacheService()
        cached_result = await cache_service.get_snapshot(bbox, lookback_months, time_of_day)

        if cached_result:
            return cached_result

        # Parse bbox
        try:
            bbox_parts = bbox.split(",")
            if len(bbox_parts) != 4:
                raise ValueError("Invalid bbox format")
            min_lng, min_lat, max_lng, max_lat = map(float, bbox_parts)

            # Validate coordinates
            if not (-180 <= min_lng <= 180 and -180 <= max_lng <= 180):
                raise ValueError("Longitude must be between -180 and 180")
            if not (-90 <= min_lat <= 90 and -90 <= max_lat <= 90):
                raise ValueError("Latitude must be between -90 and 90")
            if min_lng >= max_lng or min_lat >= max_lat:
                raise ValueError("Invalid bbox: min values must be less than max values")

        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid bbox: {str(e)}. Expected format: min_lng,min_lat,max_lng,max_lat",
            )

        # Get cells for the last N months
        crime_repo = CrimeRepository(db)
        current_month = date.today().replace(day=1)

        # Collect all cells within the time range with geometry
        # We need to fetch geometry separately using SQL to convert from EPSG:27700 to EPSG:4326
        all_cells = []
        for i in range(lookback_months):
            month_offset = current_month - timedelta(days=30 * i)
            month = month_offset.replace(day=1)
            cells = crime_repo.get_cells_by_month(month)
            all_cells.extend(cells)

        # Extract unique H3 indices from cell IDs
        # Format: {h3_index}_{YYYYMM} or {h3_index} in tests
        unique_cell_ids = list(set([cell.cell_id for cell in all_cells]))

        # Extract H3 indices without month suffixes
        h3_indices = {}
        for cell_id in unique_cell_ids:
            parts = cell_id.rsplit("_", 1)
            if len(parts) == 2 and len(parts[1]) == 6 and parts[1].isdigit():
                h3_index = parts[0]
                h3_indices[h3_index] = cell_id
            else:
                h3_indices[cell_id] = cell_id

        # Fetch geometries (stored as WGS84/EPSG:4326)
        cell_geometries = {}
        if h3_indices:
            dialect_name = db.bind.dialect.name

            try:
                if dialect_name == "postgresql":
                    # Use PostGIS to convert geometries to GeoJSON
                    geom_query = text(
                        """
                        SELECT
                            cell_id,
                            ST_AsGeoJSON(geom) as geojson
                        FROM safety_cells
                        WHERE cell_id = ANY(:cell_ids)
                    """
                    )
                    result = db.execute(geom_query, {"cell_ids": list(unique_cell_ids)})
                    for row in result:
                        geom_dict = json.loads(row.geojson)
                        parts = row.cell_id.rsplit("_", 1)
                        if len(parts) == 2 and len(parts[1]) == 6 and parts[1].isdigit():
                            h3_index = parts[0]
                        else:
                            h3_index = row.cell_id
                        cell_geometries[h3_index] = geom_dict
                else:
                    # SQLite testing: regenerate geometry from H3
                    import h3

                    for h3_index in h3_indices.keys():
                        try:
                            boundary = h3.cell_to_boundary(h3_index)
                            coords = [[lng, lat] for lat, lng in boundary]
                            coords.append(coords[0])
                            cell_geometries[h3_index] = {"type": "Polygon", "coordinates": [coords]}
                        except Exception as e:
                            logger.warning(f"Could not generate geometry for {h3_index}: {e}")
            except Exception as e:
                logger.error(f"Error fetching geometries: {str(e)}")
                # Continue without geometries - we'll handle this below

        # Aggregate cells by H3 index across months
        from collections import defaultdict
        from typing import Any, Dict

        cell_aggregates: Dict[str, Dict[str, Any]] = defaultdict(
            lambda: {
                "total_crimes": 0,
                "total_weighted": 0.0,
                "months": [],
                "stats": {},
                "geometry": None,
            }
        )

        for cell in all_cells:
            # Extract H3 index from cell_id
            parts = cell.cell_id.rsplit("_", 1)
            if len(parts) == 2 and len(parts[1]) == 6 and parts[1].isdigit():
                h3_index = parts[0]
            else:
                h3_index = cell.cell_id

            cell_aggregates[h3_index]["total_crimes"] += cell.crime_count_total

            if h3_index in cell_geometries and cell_aggregates[h3_index]["geometry"] is None:
                cell_aggregates[h3_index]["geometry"] = cell_geometries[h3_index]

            months_ago = calculate_months_ago(cell.month, current_month)
            recency_multiplier = get_recency_weight(months_ago)

            weighted_crime_count = float(cell.crime_count_weighted)

            if time_of_day and cell.stats:
                weighted_crime_count = 0.0
                for category, count in cell.stats.items():
                    time_weights = CRIME_TIME_WEIGHTS.get(category, {})
                    time_multiplier = time_weights.get(time_of_day, 1.0)
                    weighted_crime_count += count * time_multiplier

            weighted_crime_count *= recency_multiplier

            cell_aggregates[h3_index]["total_weighted"] += weighted_crime_count
            cell_aggregates[h3_index]["months"].append(cell.month.isoformat())

            if cell.stats:
                for category, count in cell.stats.items():
                    if category not in cell_aggregates[h3_index]["stats"]:
                        cell_aggregates[h3_index]["stats"][category] = 0
                    cell_aggregates[h3_index]["stats"][category] += count

        # Build response with absolute risk thresholds
        cell_data = []

        # Thresholds calibrated for H3 resolution 10 (~73m edge, ~13,781 m²)
        # Based on Southampton crime data with 12 months lookback:
        # P50: ~2, P75: ~10, P90: ~30, P95: ~60, P99: ~150+
        # Logarithmic scaling prevents compression at high values
        RISK_THRESHOLDS = {
            "very_low": 5.0,  # < 5 weighted crimes total (very safe)
            "low": 20.0,  # 5-20 weighted crimes (safe)
            "moderate": 50.0,  # 20-50 weighted crimes (moderate risk)
            "high": 100.0,  # 50-100 weighted crimes (high risk)
            "very_high": 200.0,  # 100-200 weighted crimes (very high risk)
            # > 200 = critical risk
        }

        for h3_index, agg in cell_aggregates.items():
            weighted_count = agg["total_weighted"]

            # Logarithmic risk scoring for better visual distribution
            if weighted_count == 0:
                risk_score = 0.0
            elif weighted_count < RISK_THRESHOLDS["very_low"]:
                # Very low risk: 0.0 - 0.2
                risk_score = 0.04 * weighted_count / RISK_THRESHOLDS["very_low"]
            elif weighted_count < RISK_THRESHOLDS["low"]:
                risk_score = 0.2 + 0.2 * (weighted_count - RISK_THRESHOLDS["very_low"]) / (
                    RISK_THRESHOLDS["low"] - RISK_THRESHOLDS["very_low"]
                )
            elif weighted_count < RISK_THRESHOLDS["moderate"]:
                risk_score = 0.4 + 0.2 * (weighted_count - RISK_THRESHOLDS["low"]) / (
                    RISK_THRESHOLDS["moderate"] - RISK_THRESHOLDS["low"]
                )
            elif weighted_count < RISK_THRESHOLDS["high"]:
                risk_score = 0.6 + 0.2 * (weighted_count - RISK_THRESHOLDS["moderate"]) / (
                    RISK_THRESHOLDS["high"] - RISK_THRESHOLDS["moderate"]
                )
            elif weighted_count < RISK_THRESHOLDS["very_high"]:
                risk_score = 0.8 + 0.15 * (weighted_count - RISK_THRESHOLDS["high"]) / (
                    RISK_THRESHOLDS["very_high"] - RISK_THRESHOLDS["high"]
                )
            else:
                # Cap at 1.0 for very high values
                excess = min(weighted_count - RISK_THRESHOLDS["very_high"], 200.0)
                risk_score = 0.95 + 0.05 * (excess / 200.0)

            risk_score = max(0.0, min(1.0, risk_score))
            safety_score = round((1.0 - risk_score) * 100, 1)

            # Handle missing geometry (shouldn't happen in production)
            if agg["geometry"] is None:
                dialect_name = db.bind.dialect.name
                if dialect_name == "postgresql":
                    logger.warning(f"Cell {h3_index} missing geometry, skipping")
                    continue
                else:
                    # Test mode: use placeholder geometry
                    logger.debug(f"Cell {h3_index} using placeholder geometry (test mode)")
                    agg["geometry"] = {
                        "type": "Polygon",
                        "coordinates": [[[0, 0], [0, 0.001], [0.001, 0.001], [0.001, 0], [0, 0]]],
                    }

            cell_data.append(
                {
                    "id": h3_index,
                    "geometry": agg["geometry"],
                    "safety_score": safety_score,
                    "risk_score": round(risk_score, 3),
                    "crime_count": agg["total_crimes"],
                    "crime_count_weighted": round(agg["total_weighted"], 2),
                    "months_data": len(agg["months"]),
                    "crime_breakdown": agg["stats"],
                }
            )

        if cell_data:
            cell_data.sort(key=lambda x: x["risk_score"], reverse=True)
        result = SafetySnapshotResponse(
            cells=[SafetyCell(**cell) for cell in cell_data],
            summary=SafetySummary(
                total_cells=len(cell_data),
                total_crimes=sum(c["crime_count"] for c in cell_data),
                avg_safety_score=(
                    round(sum(c["safety_score"] for c in cell_data) / len(cell_data), 1)
                    if cell_data
                    else 100.0
                ),
                highest_risk_cell=cell_data[0]["id"] if cell_data else None,
                lowest_risk_cell=cell_data[-1]["id"] if cell_data else None,
            ),
            meta=SafetyMeta(
                bbox=[min_lng, min_lat, max_lng, max_lat],
                cell_size_m=settings.GRID_CELL_SIZE_M,
                grid_type=settings.GRID_TYPE,
                lookback_months=lookback_months,
                time_filter=time_of_day,
                months_included=lookback_months,
            ),
        )

        # Cache the result
        await cache_service.set_snapshot(bbox, lookback_months, time_of_day, result.model_dump())

        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching safety snapshot: {str(e)}",
        )
