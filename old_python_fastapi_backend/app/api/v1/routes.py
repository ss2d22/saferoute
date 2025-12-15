"""Route planning API endpoints."""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_optional_current_user
from app.models.user import User
from app.schemas.route import (
    RouteHotspot,
    RouteResponse,
    RouteSegment,
    RouteStats,
    SafeRouteRequest,
    SafeRouteResponse,
)
from app.services.history_service import HistoryService
from app.services.route_safety_service import RouteSafetyService
from app.services.routing_service import RoutingService
from app.utils.geometry import geojson_to_shapely, simplify_geometry

router = APIRouter()


@router.post(
    "/safe",
    response_model=SafeRouteResponse,
    summary="Get safety-scored route options",
    description="""
    Get route alternatives with safety scores.

    Queries OpenRouteService for up to 3 route options between two points, then
    analyzes each route against historical crime data to calculate safety scores.

    **Features:**
    - Multiple route alternatives with safety scoring
    - ~100m segment analysis for detailed risk assessment
    - Crime hotspot detection along routes
    - Recency-weighted crime data
    - Time-of-day crime pattern adjustment
    - Route history tracking (authenticated users)
    - Cached for performance

    **Transport Modes:**
    - `foot-walking`: Walking routes
    - `cycling-regular`: Bicycle routes
    - `driving-car`: Car routes
    """,
    responses={
        200: {
            "description": "Successfully calculated route alternatives with safety scores",
        },
        404: {
            "description": "No routes found between the specified points",
            "content": {"application/json": {"example": {"detail": "No routes found"}}},
        },
        500: {
            "description": "Error calculating routes or fetching crime data",
        },
    },
)
async def get_safe_routes(
    request: SafeRouteRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    """Get safety-scored route alternatives.

    Returns multiple routes ranked by safety score. Scores are based on:
    - Intersection with crime grid cells
    - Segment-level risk analysis
    - Time-of-day crime patterns
    - Recency weighting
    - Crime hotspot identification
    """
    try:
        # Get routes from OpenRouteService
        coordinates = [
            [request.origin.lng, request.origin.lat],
            [request.destination.lng, request.destination.lat],
        ]

        routing_service = RoutingService()
        ors_response = await routing_service.get_directions(
            coordinates=coordinates,
            profile=request.mode,
            alternatives=3,
        )

        # Extract routes
        features = ors_response.get("features", [])
        if not features:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No routes found",
            )

        safety_service = RouteSafetyService(db)

        # Map departure time to time period
        time_of_day = None
        if request.departure_time:
            hour = request.departure_time.hour
            if 0 <= hour < 6:
                time_of_day = "night"
            elif 6 <= hour < 12:
                time_of_day = "morning"
            elif 12 <= hour < 18:
                time_of_day = "day"
            else:
                time_of_day = "evening"

        lookback_months = request.preferences.lookback_months if request.preferences else 12

        # Score each route
        routes = []
        for idx, feature in enumerate(features):
            route_info = routing_service.extract_route_info(feature)

            route_score = safety_service.score_route(
                route_geometry=route_info["geometry"],
                lookback_months=lookback_months,
                time_of_day=time_of_day,
                buffer_meters=50,
            )

            route_id = str(uuid.uuid4())

            segments = [RouteSegment(**seg) for seg in route_score.get("segments", [])]
            hotspots = [RouteHotspot(**hs) for hs in route_score.get("hotspots", [])]

            routes.append(
                RouteResponse(
                    id=route_id,
                    rank=idx + 1,
                    is_recommended=False,  # Will be updated after sorting
                    safety_score=route_score["safety_score"],
                    risk_class=route_score["risk_class"],
                    distance_m=route_info["distance_m"],
                    duration_s=route_info["duration_s"],
                    geometry=route_info["geometry"],
                    instructions=route_info["instructions"],
                    stats=RouteStats(
                        total_weighted_risk=route_score["total_weighted_risk"],
                        max_segment_risk=route_score["max_segment_risk"],
                        avg_segment_risk=route_score["avg_segment_risk"],
                        segment_count=route_score["segment_count"],
                        segments=segments,
                        hotspots=hotspots,
                        crime_breakdown=route_score["crime_breakdown"],
                        cells_analyzed=route_score["cells_analyzed"],
                    ),
                )
            )

        # Sort by safety score (safest first)
        routes.sort(key=lambda r: r.safety_score, reverse=True)

        for idx, route in enumerate(routes):
            route.rank = idx + 1
            route.is_recommended = idx == 0

        # Save to user history if enabled
        if current_user and routes:
            user_settings = current_user.settings or {}
            history_enabled = user_settings.get("history_enabled", True)

            if history_enabled:
                try:
                    history_service = HistoryService(db)
                    best_route = routes[0]

                    # Simplify geometry for storage
                    route_geom_wkt = None
                    if best_route.geometry:
                        try:
                            geom = geojson_to_shapely(best_route.geometry)
                            simplified = simplify_geometry(geom, max_points=100)
                            route_geom_wkt = simplified.wkt
                        except Exception:
                            pass

                    history_service.save_route_history(
                        user_id=current_user.id,
                        origin_lat=request.origin.lat,
                        origin_lng=request.origin.lng,
                        destination_lat=request.destination.lat,
                        destination_lng=request.destination.lng,
                        mode=request.mode,
                        safety_score_best=best_route.safety_score,
                        distance_m_best=best_route.distance_m,
                        duration_s_best=best_route.duration_s,
                        request_meta={
                            "preferences": (
                                request.preferences.dict() if request.preferences else {}
                            ),
                            "departure_time": (
                                str(request.departure_time) if request.departure_time else None
                            ),
                        },
                        route_geom=route_geom_wkt,
                    )
                except Exception as e:
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.error(f"Failed to save route history: {str(e)}")

        return SafeRouteResponse(
            routes=routes,
            meta={
                "alternatives_available": len(features) > 1,
                "scoring_profile": "full_crime_analysis",
                "lookback_months": lookback_months,
                "time_of_day": time_of_day,
                "buffer_meters": 50,
                "notes": [
                    f"Routes analyzed using {lookback_months} months of crime data.",
                    f"Total routes evaluated: {len(routes)}",
                    "Routes sorted by safety score (safest first).",
                ],
            },
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching routes: {str(e)}",
        )


@router.get("/{route_id}")
async def get_route(route_id: str):
    """Get cached route by ID.

    Note: Route caching not yet implemented.
    """
    return {"message": "Route caching not yet implemented", "route_id": route_id}
