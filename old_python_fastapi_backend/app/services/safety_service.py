"""Safety scoring for routes."""

import logging
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from shapely.geometry import LineString
from sqlalchemy.orm import Session

from app.config import get_settings
from app.repositories.crime_repository import CrimeRepository
from app.utils.geometry import buffer_line, reproject_to_27700
from app.utils.scoring import (
    calculate_months_ago,
    get_recency_weight,
    get_time_bucket,
    get_time_weight,
    normalize_score,
    risk_to_safety_score,
)
from app.utils.segmentation import RouteSegment

logger = logging.getLogger(__name__)
settings = get_settings()


class SafetyScoringService:
    """Calculates and compares safety scores across multiple routes."""

    def __init__(self, db: Session):
        self.db = db
        self.crime_repo = CrimeRepository(db)

    def score_routes(
        self,
        routes_data: List[Dict[str, Any]],
        lookback_months: int = 12,
        departure_time: Optional[datetime] = None,
        time_sensitive: bool = True,
        category_weights: Optional[Dict[str, float]] = None,
    ) -> List[Dict[str, Any]]:
        """Score and rank multiple routes by safety.

        Args:
            routes_data: Routes with geometry and segments
            lookback_months: Historical crime data period
            departure_time: Departure time for time-of-day weights
            time_sensitive: Apply time-based weighting
            category_weights: Custom crime category weights

        Returns:
            Routes with safety scores, ranked safest first
        """
        current_month = date.today().replace(day=1)
        user_time_bucket = get_time_bucket(departure_time) if departure_time else None

        # Calculate risk for each route
        route_risks = []
        for route_data in routes_data:
            route_geom = route_data["geometry"]  # Shapely LineString
            segments = route_data.get("segments", [])

            # Calculate route risk
            total_risk = self._calculate_route_risk(
                route_geom=route_geom,
                segments=segments,
                current_month=current_month,
                lookback_months=lookback_months,
                user_time_bucket=user_time_bucket,
                time_sensitive=time_sensitive,
                category_weights=category_weights,
            )

            route_risks.append(
                {
                    "route": route_data,
                    "risk": total_risk,
                }
            )

        # Normalize risks to safety scores
        if len(route_risks) > 1:
            risks = [r["risk"] for r in route_risks]
            min_risk = min(risks)
            max_risk = max(risks)

            for item in route_risks:
                if max_risk == min_risk:
                    # All routes have same risk - use absolute scoring
                    item["safety_score"] = 90.0 if item["risk"] == 0 else 85.0
                else:
                    # Relative scoring
                    norm_risk = normalize_score(item["risk"], min_risk, max_risk)
                    item["safety_score"] = risk_to_safety_score(norm_risk)
        else:
            # Single route - use absolute scoring
            risk = route_risks[0]["risk"]
            route_length_km = route_risks[0]["route"].get("distance_m", 1000) / 1000
            if risk == 0:
                route_risks[0]["safety_score"] = 90.0
            else:
                # Penalize based on crimes per km
                route_risks[0]["safety_score"] = max(0, 100 - (risk / route_length_km * 10))

        # Sort by safety score (descending)
        route_risks.sort(key=lambda x: x["safety_score"], reverse=True)

        # Add ranks
        for idx, item in enumerate(route_risks):
            item["rank"] = idx + 1
            item["is_recommended"] = idx == 0

            # Determine risk class
            score = item["safety_score"]
            if score >= 75:
                item["risk_class"] = "low"
            elif score >= 50:
                item["risk_class"] = "medium"
            else:
                item["risk_class"] = "high"

        return route_risks

    def _calculate_route_risk(
        self,
        route_geom: LineString,
        segments: List[RouteSegment],
        current_month: date,
        lookback_months: int,
        user_time_bucket: Optional[str],
        time_sensitive: bool,
        category_weights: Optional[Dict[str, float]],
    ) -> float:
        """Calculate total risk for a route.

        Returns:
            Weighted risk value
        """
        # Reproject for accurate buffering
        route_geom_27700 = reproject_to_27700(route_geom)

        # Create buffer (PostGIS spatial query not yet implemented)
        buffer_m = settings.DEFAULT_ROUTE_BUFFER_M
        _ = buffer_line(route_geom_27700, buffer_m)

        # Get cells for lookback period (spatial filtering to be added)

        start_month = current_month
        total_risk = 0.0

        for i in range(lookback_months):
            # Calculate month
            month = date(start_month.year, start_month.month, 1)
            if month.month == 1:
                month = date(month.year - 1, 12, 1)
            else:
                month = date(month.year, month.month - 1, 1)

            # Get cells for this month (simplified - no spatial filter yet)
            cells = self.crime_repo.get_cells_by_month(month)

            # Apply recency weight
            months_ago = calculate_months_ago(month, current_month)
            recency_factor = get_recency_weight(months_ago)

            for cell in cells:
                # Get weighted crime count
                if category_weights:
                    # Recompute from category counts
                    stats = cell.stats or {}
                    category_counts = stats.get("category_counts", {})
                    cell_risk = sum(
                        count * category_weights.get(cat_id, 1.0)
                        for cat_id, count in category_counts.items()
                    )
                else:
                    # Use pre-aggregated weighted count
                    cell_risk = float(cell.crime_count_weighted)

                # Apply time-of-day weighting
                time_factor = 1.0
                if time_sensitive and user_time_bucket:
                    stats = cell.stats or {}
                    time_buckets = stats.get("time_buckets", {})
                    # Simplified: apply average time factor
                    for bucket, count in time_buckets.items():
                        if count > 0:
                            time_factor = get_time_weight(bucket, user_time_bucket)
                            break

                # Add to total risk
                total_risk += cell_risk * recency_factor * time_factor

        return total_risk

    def identify_hotspots(
        self,
        segments: List[RouteSegment],
        segment_risks: List[float],
    ) -> List[Dict[str, Any]]:
        """Find high-risk segments on a route.

        Args:
            segments: Route segments
            segment_risks: Risk value per segment

        Returns:
            Hotspot locations with risk scores
        """
        if not segment_risks or len(segment_risks) < 3:
            return []

        # Calculate 75th percentile
        sorted_risks = sorted(segment_risks)
        percentile_75_idx = int(len(sorted_risks) * 0.75)
        threshold = sorted_risks[percentile_75_idx]

        # Find consecutive high-risk segments
        hotspots = []
        current_hotspot = None

        for idx, risk in enumerate(segment_risks):
            if risk > threshold:
                if current_hotspot is None:
                    current_hotspot = {
                        "segment_range": [idx, idx],
                        "risk_score": risk,
                        "categories": [],
                    }
                else:
                    current_hotspot["segment_range"][1] = idx
                    current_hotspot["risk_score"] = max(current_hotspot["risk_score"], risk)
            else:
                if current_hotspot is not None:
                    # Normalize risk score to 0-1
                    max_risk = max(segment_risks)
                    current_hotspot["risk_score"] = (
                        current_hotspot["risk_score"] / max_risk if max_risk > 0 else 0
                    )
                    current_hotspot["description"] = "Higher recent crime density"
                    hotspots.append(current_hotspot)
                    current_hotspot = None

        # Add final hotspot if exists
        if current_hotspot is not None:
            max_risk = max(segment_risks)
            current_hotspot["risk_score"] = (
                current_hotspot["risk_score"] / max_risk if max_risk > 0 else 0
            )
            current_hotspot["description"] = "Higher recent crime density"
            hotspots.append(current_hotspot)

        return hotspots
