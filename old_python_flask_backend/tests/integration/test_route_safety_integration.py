"""Integration tests for route safety scoring.

NOTE: These tests require PostgreSQL/PostGIS and will be skipped with SQLite.
Run with: pytest tests/integration/test_route_safety_integration.py --postgresql
"""

from datetime import date

import pytest
from sqlalchemy.orm import Session

from app.repositories.crime_repository import CrimeRepository
from app.services.route_safety_service import RouteSafetyService

# Mark all tests in this module as requiring PostgreSQL
pytestmark = pytest.mark.skip(
    reason="Route safety integration tests require PostgreSQL/PostGIS - run with live database"
)


class TestRouteSafetyIntegration:
    """Integration tests for route safety scoring with real database."""

    @pytest.fixture
    def service(self, db: Session):
        """Create a RouteSafetyService instance."""
        return RouteSafetyService(db)

    @pytest.fixture
    def crime_repo(self, db: Session):
        """Create a CrimeRepository instance."""
        return CrimeRepository(db)

    @pytest.fixture
    def sample_safety_cells(self, crime_repo):
        """Create sample safety cells in the database."""
        month = date(2025, 9, 1)

        # Create cells in a grid around Southampton area
        cells_created = []

        for i, (lat, lng) in enumerate(
            [
                (50.85, -1.42),
                (50.86, -1.41),
                (50.87, -1.40),
            ]
        ):
            cell_id = f"test_route_cell_{lat}_{lng}_{month.strftime('%Y%m')}"
            geom_wkt = f"POLYGON(({lng} {lat}, {lng+0.01} {lat}, {lng+0.01} {lat+0.01}, {lng} {lat+0.01}, {lng} {lat}))"

            cell = crime_repo.create_or_update_cell(
                cell_id=cell_id,
                geom_wkt=geom_wkt,
                month=month,
                crime_count_total=10 + (i * 5),
                crime_count_weighted=20.0 + (i * 10.0),
                stats={
                    "burglary": 3 + i,
                    "violent-crime": 5 + (i * 2),
                    "anti-social-behaviour": 2,
                },
            )
            cells_created.append(cell)

        yield cells_created

        # Cleanup
        for cell in cells_created:
            crime_repo.db.delete(cell)
        crime_repo.db.commit()

    def test_score_route_with_real_cells(self, service, sample_safety_cells):
        """Test route scoring with real safety cells from database."""
        # Route that intersects with test cells
        route_geometry = {
            "type": "LineString",
            "coordinates": [
                [-1.42, 50.85],
                [-1.415, 50.855],
                [-1.41, 50.86],
                [-1.405, 50.865],
            ],
        }

        result = service.score_route(
            route_geometry=route_geometry, lookback_months=6, time_of_day=None, buffer_meters=50
        )

        # Verify result structure
        assert "safety_score" in result
        assert "risk_class" in result
        assert "segments" in result
        assert "hotspots" in result
        assert "crime_breakdown" in result
        assert "cells_analyzed" in result

        # Verify score is in valid range
        assert 0.0 <= result["safety_score"] <= 100.0
        assert result["risk_class"] in ["low", "medium", "high"]

        # Should have analyzed some cells
        assert result["cells_analyzed"] > 0

    def test_score_route_with_time_of_day(self, service, sample_safety_cells):
        """Test route scoring with time-of-day weighting."""
        route_geometry = {
            "type": "LineString",
            "coordinates": [
                [-1.42, 50.85],
                [-1.41, 50.86],
            ],
        }

        # Score at night
        result_night = service.score_route(
            route_geometry=route_geometry, lookback_months=6, time_of_day="night", buffer_meters=50
        )

        # Score during day
        result_day = service.score_route(
            route_geometry=route_geometry, lookback_months=6, time_of_day="day", buffer_meters=50
        )

        # Both should return valid results
        assert "safety_score" in result_night
        assert "safety_score" in result_day

        # Scores may differ based on time-of-day weighting
        # (not guaranteed to be different, but both should be valid)
        assert 0.0 <= result_night["safety_score"] <= 100.0
        assert 0.0 <= result_day["safety_score"] <= 100.0

    def test_score_route_with_different_lookback_periods(self, service, sample_safety_cells):
        """Test route scoring with different lookback periods."""
        route_geometry = {
            "type": "LineString",
            "coordinates": [
                [-1.42, 50.85],
                [-1.41, 50.86],
            ],
        }

        # Short lookback
        result_3m = service.score_route(
            route_geometry=route_geometry, lookback_months=3, buffer_meters=50
        )

        # Long lookback
        result_12m = service.score_route(
            route_geometry=route_geometry, lookback_months=12, buffer_meters=50
        )

        # Both should return valid results
        assert "safety_score" in result_3m
        assert "safety_score" in result_12m

    def test_score_route_with_buffer_variations(self, service, sample_safety_cells):
        """Test route scoring with different buffer sizes."""
        route_geometry = {
            "type": "LineString",
            "coordinates": [
                [-1.42, 50.85],
                [-1.41, 50.86],
            ],
        }

        # Small buffer
        result_small = service.score_route(
            route_geometry=route_geometry, lookback_months=6, buffer_meters=25
        )

        # Large buffer
        result_large = service.score_route(
            route_geometry=route_geometry, lookback_months=6, buffer_meters=100
        )

        # Both should return valid results
        assert "cells_analyzed" in result_small
        assert "cells_analyzed" in result_large

        # Larger buffer should analyze more or equal cells
        assert result_large["cells_analyzed"] >= result_small["cells_analyzed"]

    def test_score_route_no_intersecting_cells(self, service, sample_safety_cells):
        """Test route scoring when route doesn't intersect any cells."""
        # Route far from test cells
        route_geometry = {
            "type": "LineString",
            "coordinates": [
                [-2.0, 51.0],
                [-1.9, 51.1],
            ],
        }

        result = service.score_route(
            route_geometry=route_geometry, lookback_months=6, buffer_meters=50
        )

        # Should return empty/safe score
        assert result["safety_score"] == 100.0
        assert result["risk_class"] == "low"
        assert result["cells_analyzed"] == 0
        assert len(result["segments"]) == 0
        assert len(result["hotspots"]) == 0

    def test_score_route_segment_analysis(self, service, sample_safety_cells):
        """Test that route is properly segmented."""
        # Long route that should be split into segments
        route_geometry = {
            "type": "LineString",
            "coordinates": [
                [-1.42, 50.85],
                [-1.41, 50.855],
                [-1.40, 50.86],
                [-1.39, 50.865],
                [-1.38, 50.87],
            ],
        }

        result = service.score_route(
            route_geometry=route_geometry, lookback_months=6, buffer_meters=50
        )

        # Should have created segments
        if result["cells_analyzed"] > 0:
            assert result["segment_count"] > 0
            assert len(result["segments"]) > 0

            # Each segment should have required fields
            for segment in result["segments"]:
                assert "segment_index" in segment
                assert "start_point" in segment
                assert "end_point" in segment
                assert "risk_score" in segment
                assert "cell_count" in segment

    def test_score_route_hotspot_identification(self, service, sample_safety_cells):
        """Test that hotspots are correctly identified."""
        route_geometry = {
            "type": "LineString",
            "coordinates": [
                [-1.42, 50.85],
                [-1.41, 50.86],
                [-1.40, 50.87],  # This area has higher crime
            ],
        }

        result = service.score_route(
            route_geometry=route_geometry, lookback_months=6, buffer_meters=50
        )

        # If hotspots were identified, verify structure
        if len(result["hotspots"]) > 0:
            for hotspot in result["hotspots"]:
                assert "segment_index" in hotspot
                assert "location" in hotspot
                assert "risk_score" in hotspot
                assert "risk_level" in hotspot
                assert hotspot["risk_level"] in ["high", "critical"]
                assert "description" in hotspot

    def test_score_route_crime_breakdown(self, service, sample_safety_cells):
        """Test crime breakdown statistics."""
        route_geometry = {
            "type": "LineString",
            "coordinates": [
                [-1.42, 50.85],
                [-1.41, 50.86],
            ],
        }

        result = service.score_route(
            route_geometry=route_geometry, lookback_months=6, buffer_meters=50
        )

        # If cells were analyzed, should have crime breakdown
        if result["cells_analyzed"] > 0:
            assert len(result["crime_breakdown"]) > 0

            # Verify crime categories from test data
            breakdown = result["crime_breakdown"]
            assert all(isinstance(count, float) for count in breakdown.values())
            assert all(count >= 0 for count in breakdown.values())

    def test_score_route_statistics_consistency(self, service, sample_safety_cells):
        """Test that statistics are internally consistent."""
        route_geometry = {
            "type": "LineString",
            "coordinates": [
                [-1.42, 50.85],
                [-1.41, 50.86],
                [-1.40, 50.87],
            ],
        }

        result = service.score_route(
            route_geometry=route_geometry, lookback_months=6, buffer_meters=50
        )

        # Verify internal consistency
        assert result["segment_count"] == len(result["segments"])

        if result["segment_count"] > 0:
            # Max risk should be >= avg risk
            assert result["max_segment_risk"] >= result["avg_segment_risk"]

            # Total risk should be sum of segment risks
            total_risk = sum(seg["risk_score"] for seg in result["segments"])
            assert abs(result["total_weighted_risk"] - total_risk) < 0.01

            # Average should be total / count
            if result["segment_count"] > 0:
                avg = result["total_weighted_risk"] / result["segment_count"]
                assert abs(result["avg_segment_risk"] - avg) < 0.01

    def test_score_route_recency_weighting(self, service, crime_repo):
        """Test that recency weighting affects scores."""
        # Create cells from different months
        old_month = date(2024, 1, 1)
        recent_month = date(2025, 9, 1)

        # Old cell
        old_cell = crime_repo.create_or_update_cell(
            cell_id=f"old_cell_{old_month.strftime('%Y%m')}",
            geom_wkt="POLYGON((-1.42 50.85,-1.41 50.85,-1.41 50.86,-1.42 50.86,-1.42 50.85))",
            month=old_month,
            crime_count_total=10,
            crime_count_weighted=20.0,
            stats={"burglary": 5, "violent-crime": 5},
        )

        # Recent cell (same location, same crime count)
        recent_cell = crime_repo.create_or_update_cell(
            cell_id=f"recent_cell_{recent_month.strftime('%Y%m')}",
            geom_wkt="POLYGON((-1.42 50.85,-1.41 50.85,-1.41 50.86,-1.42 50.86,-1.42 50.85))",
            month=recent_month,
            crime_count_total=10,
            crime_count_weighted=20.0,
            stats={"burglary": 5, "violent-crime": 5},
        )

        try:
            route_geometry = {
                "type": "LineString",
                "coordinates": [
                    [-1.42, 50.85],
                    [-1.41, 50.86],
                ],
            }

            # Score with long lookback to include both months
            result = service.score_route(
                route_geometry=route_geometry, lookback_months=24, buffer_meters=50
            )

            # Should have analyzed both cells
            assert result["cells_analyzed"] >= 2

            # Recent crimes should be weighted more heavily
            # (specific assertion would depend on implementation details)
            assert result["cells_analyzed"] > 0

        finally:
            # Cleanup
            crime_repo.db.delete(old_cell)
            crime_repo.db.delete(recent_cell)
            crime_repo.db.commit()
