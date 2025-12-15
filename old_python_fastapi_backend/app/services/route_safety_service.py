"""Route safety scoring service.

Scores routes by analyzing intersections with crime data cells and
identifying high-risk areas along the path.
"""

import logging
from collections import defaultdict
from datetime import date, timedelta
from typing import Dict, List, Optional

from shapely import wkt
from shapely.geometry import LineString
from sqlalchemy.orm import Session

from app.config import CRIME_TIME_WEIGHTS, get_settings
from app.repositories.crime_repository import CrimeRepository
from app.utils.scoring import calculate_months_ago, get_recency_weight

logger = logging.getLogger(__name__)
settings = get_settings()


class RouteSafetyService:
    """Calculates safety scores for routes based on crime data."""

    def __init__(self, db: Session):
        self.db = db
        self.crime_repo = CrimeRepository(db)

    def score_route(
        self,
        route_geometry: Dict,
        lookback_months: int = 12,
        time_of_day: Optional[str] = None,
        buffer_meters: int = 50,
    ) -> Dict:
        """Score a route based on crime data.

        Args:
            route_geometry: GeoJSON LineString geometry
            lookback_months: Months of historical crime data to analyze
            time_of_day: Time period (night, morning, day, evening) for weighting
            buffer_meters: Buffer distance around route

        Returns:
            Dict with safety_score, risk_class, segments, hotspots, and crime breakdown
        """
        try:
            # Convert GeoJSON to Shapely LineString
            coordinates = route_geometry.get("coordinates", [])
            if not coordinates or len(coordinates) < 2:
                logger.warning("Invalid route geometry - no coordinates")
                return self._empty_score()

            # Coordinates are WGS84 (lng, lat)
            route_line = LineString(coordinates)

            # Get current month for recency calculation
            current_month = date.today().replace(day=1)

            # Get all safety cells for the lookback period
            all_cells = []
            for i in range(lookback_months):
                month_offset = current_month - timedelta(days=30 * i)
                month = month_offset.replace(day=1)
                cells = self.crime_repo.get_cells_by_month(month)
                all_cells.extend(cells)

            if not all_cells:
                logger.info("No safety cells found for scoring")
                return self._empty_score()

            # Find cells that intersect with the route
            intersecting_cells = self._find_intersecting_cells(route_line, all_cells, buffer_meters)

            if not intersecting_cells:
                logger.info("No intersecting cells found - route is very safe")
                return self._empty_score()

            # Calculate segment-by-segment scores
            segments = self._create_route_segments(route_line)
            segment_scores = []

            for segment_idx, segment_line in enumerate(segments):
                segment_cells = self._find_intersecting_cells(
                    segment_line, intersecting_cells, buffer_meters
                )

                segment_risk = self._calculate_segment_risk(
                    segment_cells, current_month, time_of_day
                )

                segment_scores.append(
                    {
                        "segment_index": segment_idx,
                        "start_point": list(segment_line.coords[0]),
                        "end_point": list(segment_line.coords[-1]),
                        "risk_score": segment_risk,
                        "cell_count": len(segment_cells),
                    }
                )

            # Calculate overall route statistics
            total_weighted_risk = sum(seg["risk_score"] for seg in segment_scores)
            max_segment_risk = max((seg["risk_score"] for seg in segment_scores), default=0.0)
            avg_risk = total_weighted_risk / len(segment_scores) if segment_scores else 0.0

            # Identify crime hotspots (segments with high risk)
            hotspots = self._identify_hotspots(segment_scores, avg_risk)

            # Calculate crime breakdown
            crime_breakdown = self._calculate_crime_breakdown(
                intersecting_cells, current_month, time_of_day
            )

            # Use the same thresholds as hexagon scoring for visual consistency
            # Calibrated for H3 resolution 10 (~73m edge, ~13,781 m²)
            # Segments average across multiple intersecting cells
            RISK_THRESHOLDS = {
                "very_low": 5.0,  # < 5 weighted crimes avg (very safe)
                "low": 20.0,  # 5-20 weighted crimes avg (safe)
                "moderate": 50.0,  # 20-50 weighted crimes avg (moderate risk)
                "high": 100.0,  # 50-100 weighted crimes avg (high risk)
                "very_high": 200.0,  # 100-200 weighted crimes avg (very high risk)
            }

            # Logarithmic scoring for better visual distribution
            if avg_risk == 0:
                normalized_risk = 0.0
            elif avg_risk < RISK_THRESHOLDS["very_low"]:
                normalized_risk = 0.2 * avg_risk / RISK_THRESHOLDS["very_low"]
            elif avg_risk < RISK_THRESHOLDS["low"]:
                normalized_risk = 0.2 + 0.2 * (avg_risk - RISK_THRESHOLDS["very_low"]) / (
                    RISK_THRESHOLDS["low"] - RISK_THRESHOLDS["very_low"]
                )
            elif avg_risk < RISK_THRESHOLDS["moderate"]:
                normalized_risk = 0.4 + 0.2 * (avg_risk - RISK_THRESHOLDS["low"]) / (
                    RISK_THRESHOLDS["moderate"] - RISK_THRESHOLDS["low"]
                )
            elif avg_risk < RISK_THRESHOLDS["high"]:
                normalized_risk = 0.6 + 0.2 * (avg_risk - RISK_THRESHOLDS["moderate"]) / (
                    RISK_THRESHOLDS["high"] - RISK_THRESHOLDS["moderate"]
                )
            elif avg_risk < RISK_THRESHOLDS["very_high"]:
                normalized_risk = 0.8 + 0.15 * (avg_risk - RISK_THRESHOLDS["high"]) / (
                    RISK_THRESHOLDS["very_high"] - RISK_THRESHOLDS["high"]
                )
            else:
                excess = min(avg_risk - RISK_THRESHOLDS["very_high"], 200.0)
                normalized_risk = 0.95 + 0.05 * (excess / 200.0)

            normalized_risk = max(0.0, min(1.0, normalized_risk))
            safety_score = round((1.0 - normalized_risk) * 100, 1)

            # Determine risk class
            if safety_score >= 80:
                risk_class = "low"
            elif safety_score >= 60:
                risk_class = "medium"
            else:
                risk_class = "high"

            return {
                "safety_score": safety_score,
                "risk_class": risk_class,
                "total_weighted_risk": round(total_weighted_risk, 3),
                "max_segment_risk": round(max_segment_risk, 3),
                "avg_segment_risk": round(avg_risk, 3),
                "segment_count": len(segment_scores),
                "segments": segment_scores,
                "hotspots": hotspots,
                "crime_breakdown": crime_breakdown,
                "cells_analyzed": len(intersecting_cells),
            }

        except Exception as e:
            logger.error(f"Error scoring route: {str(e)}", exc_info=True)
            return self._empty_score()

    def _empty_score(self) -> Dict:
        """Default score for routes with no crime data."""
        return {
            "safety_score": 100.0,
            "risk_class": "low",
            "total_weighted_risk": 0.0,
            "max_segment_risk": 0.0,
            "avg_segment_risk": 0.0,
            "segment_count": 0,
            "segments": [],
            "hotspots": [],
            "crime_breakdown": {},
            "cells_analyzed": 0,
        }

    def _find_intersecting_cells(
        self, route_line: LineString, cells: List, buffer_meters: int
    ) -> List:
        """Find safety cells intersecting the route.

        Args:
            route_line: Route as Shapely LineString (WGS84)
            cells: SafetyCell objects to check
            buffer_meters: Buffer distance

        Returns:
            Cells that intersect the buffered route
        """
        # Create buffer around route (approximate: 1 degree ≈ 111km at equator)
        buffer_degrees = buffer_meters / 111000.0
        buffered_route = route_line.buffer(buffer_degrees)

        intersecting = []
        for cell in cells:
            if not cell.geom:
                continue

            try:
                # Convert geometry to Shapely
                if isinstance(cell.geom, str):
                    # WKT string
                    cell_geom = wkt.loads(cell.geom)
                elif hasattr(cell.geom, "desc"):
                    # GeoAlchemy2 WKBElement or WKTElement - convert to WKT string first
                    from geoalchemy2 import shape

                    cell_geom = shape.to_shape(cell.geom)
                else:
                    # Already a Shapely geometry
                    cell_geom = cell.geom

                # Check for intersection
                if buffered_route.intersects(cell_geom):
                    intersecting.append(cell)

            except Exception as e:
                logger.warning(f"Error checking cell intersection: {str(e)}")
                continue

        return intersecting

    def _create_route_segments(
        self, route_line: LineString, max_segment_length_deg: float = 0.001
    ) -> List[LineString]:
        """Split route into segments for detailed analysis.

        Args:
            route_line: Route as Shapely LineString (WGS84)
            max_segment_length_deg: Max segment length (~100m)

        Returns:
            List of LineString segments
        """
        coords = list(route_line.coords)
        if len(coords) < 2:
            return []

        segments = []
        current_segment = [coords[0]]

        for i in range(1, len(coords)):
            current_segment.append(coords[i])

            # Calculate segment length
            segment_line = LineString(current_segment)
            segment_length = segment_line.length

            # If segment is long enough or this is the last point, create segment
            if segment_length >= max_segment_length_deg or i == len(coords) - 1:
                segments.append(segment_line)
                current_segment = [coords[i]]  # Start new segment from this point

        # If we have a remaining segment with just one point, add it to the last segment
        if len(current_segment) > 1:
            segments.append(LineString(current_segment))

        return segments if segments else [route_line]

    def _calculate_segment_risk(
        self,
        cells: List,
        current_month: date,
        time_of_day: Optional[str] = None,
    ) -> float:
        """Calculate segment risk from intersecting cells.

        Args:
            cells: SafetyCell objects intersecting the segment
            current_month: Reference month for recency weights
            time_of_day: Time period for weighting (optional)

        Returns:
            Average risk score across cells
        """
        if not cells:
            return 0.0

        total_weighted_risk = 0.0

        for cell in cells:
            # Calculate recency weight
            months_ago = calculate_months_ago(cell.month, current_month)
            recency_multiplier = get_recency_weight(months_ago)

            # Get weighted crime count
            weighted_crime_count = float(cell.crime_count_weighted)

            # Apply time-of-day weighting if specified
            if time_of_day and cell.stats:
                weighted_crime_count = 0.0
                for category, count in cell.stats.items():
                    time_weights = CRIME_TIME_WEIGHTS.get(category, {})
                    time_multiplier = time_weights.get(time_of_day, 1.0)
                    weighted_crime_count += count * time_multiplier

            # Apply recency weighting
            weighted_crime_count *= recency_multiplier

            total_weighted_risk += weighted_crime_count

        # Average risk across cells for this segment
        avg_risk = total_weighted_risk / len(cells) if cells else 0.0

        return avg_risk

    def _identify_hotspots(
        self, segment_scores: List[Dict], avg_risk: float, threshold_multiplier: float = 1.5
    ) -> List[Dict]:
        """Find high-risk segments along the route.

        Args:
            segment_scores: Segment score data
            avg_risk: Average risk across all segments
            threshold_multiplier: Factor above average to flag as hotspot

        Returns:
            Hotspot locations and risk levels
        """
        if avg_risk == 0:
            return []

        hotspot_threshold = avg_risk * threshold_multiplier
        hotspots = []

        for segment in segment_scores:
            if segment["risk_score"] >= hotspot_threshold:
                hotspots.append(
                    {
                        "segment_index": segment["segment_index"],
                        "location": segment["start_point"],
                        "risk_score": segment["risk_score"],
                        "risk_level": (
                            "critical" if segment["risk_score"] >= avg_risk * 2.0 else "high"
                        ),
                        "description": f"High crime area detected (risk: {segment['risk_score']:.2f})",
                    }
                )

        return hotspots

    def _calculate_crime_breakdown(
        self,
        cells: List,
        current_month: date,
        time_of_day: Optional[str] = None,
    ) -> Dict[str, float]:
        """Break down crime types along the route.

        Args:
            cells: SafetyCell objects along route
            current_month: Reference month for recency
            time_of_day: Time period filter (optional)

        Returns:
            Crime categories mapped to weighted counts
        """
        crime_totals: Dict[str, float] = defaultdict(float)

        for cell in cells:
            if not cell.stats:
                continue

            # Calculate recency weight
            months_ago = calculate_months_ago(cell.month, current_month)
            recency_multiplier = get_recency_weight(months_ago)

            # Sum up crimes by category with weighting
            for category, count in cell.stats.items():
                time_weights = CRIME_TIME_WEIGHTS.get(category, {})
                time_multiplier = time_weights.get(time_of_day, 1.0) if time_of_day else 1.0

                weighted_count = count * time_multiplier * recency_multiplier
                crime_totals[category] += weighted_count

        # Round values
        return {category: round(count, 2) for category, count in crime_totals.items()}
