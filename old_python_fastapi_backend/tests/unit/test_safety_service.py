"""Unit tests for safety scoring service."""

from unittest.mock import Mock

import pytest
from shapely.geometry import LineString

from app.services.safety_service import SafetyScoringService
from app.utils.segmentation import RouteSegment


@pytest.fixture
def mock_db():
    """Mock database session."""
    return Mock()


@pytest.fixture
def safety_service(mock_db):
    """Create safety service with mock DB."""
    return SafetyScoringService(mock_db)


def test_score_routes_single_route(safety_service):
    """Test scoring a single route."""
    routes_data = [
        {
            "geometry": LineString([(-1.4044, 50.9097), (-1.4300, 50.9130)]),
            "segments": [],
            "distance_m": 2300,
        }
    ]

    # Mock crime repo to return no cells
    safety_service.crime_repo.get_cells_by_month = Mock(return_value=[])

    scored_routes = safety_service.score_routes(routes_data, lookback_months=12)

    assert len(scored_routes) == 1
    assert "safety_score" in scored_routes[0]
    assert scored_routes[0]["rank"] == 1
    assert scored_routes[0]["is_recommended"] is True


def test_score_routes_multiple_routes(safety_service):
    """Test scoring multiple routes."""
    routes_data = [
        {
            "geometry": LineString([(-1.4044, 50.9097), (-1.4300, 50.9130)]),
            "segments": [],
            "distance_m": 2300,
        },
        {
            "geometry": LineString([(-1.4044, 50.9097), (-1.4200, 50.9110), (-1.4300, 50.9130)]),
            "segments": [],
            "distance_m": 2500,
        },
    ]

    safety_service.crime_repo.get_cells_by_month = Mock(return_value=[])

    scored_routes = safety_service.score_routes(routes_data, lookback_months=12)

    assert len(scored_routes) == 2
    assert scored_routes[0]["rank"] == 1
    assert scored_routes[1]["rank"] == 2
    assert scored_routes[0]["is_recommended"] is True
    assert scored_routes[1]["is_recommended"] is False


def test_score_routes_assigns_risk_classes(safety_service):
    """Test that risk classes are assigned correctly."""
    routes_data = [
        {
            "geometry": LineString([(-1.4044, 50.9097), (-1.4300, 50.9130)]),
            "segments": [],
            "distance_m": 2300,
        }
    ]

    safety_service.crime_repo.get_cells_by_month = Mock(return_value=[])

    scored_routes = safety_service.score_routes(routes_data, lookback_months=12)

    # With no crimes, should get high safety score = low risk
    assert scored_routes[0]["risk_class"] in ["low", "medium", "high"]

    # High safety score should be "low" risk
    if scored_routes[0]["safety_score"] >= 75:
        assert scored_routes[0]["risk_class"] == "low"


def test_identify_hotspots_no_segments(safety_service):
    """Test hotspot identification with no segments."""
    hotspots = safety_service.identify_hotspots([], [])

    assert hotspots == []


def test_identify_hotspots_finds_high_risk_areas(safety_service):
    """Test that hotspots are identified correctly."""
    # Create mock segments with more pronounced risk difference
    segments = [
        RouteSegment(0, LineString([(0, 0), (1, 1)]), 100, 0),
        RouteSegment(1, LineString([(1, 1), (2, 2)]), 100, 1),
        RouteSegment(2, LineString([(2, 2), (3, 3)]), 100, 2),
        RouteSegment(3, LineString([(3, 3), (4, 4)]), 100, 3),
        RouteSegment(4, LineString([(4, 4), (5, 5)]), 100, 4),
    ]

    # Risks: low, low, low, high, high (last 2 are above 75th percentile)
    segment_risks = [1.0, 1.2, 1.1, 8.0, 9.0]

    hotspots = safety_service.identify_hotspots(segments, segment_risks)

    # Should find at least one hotspot (segments 3-4)
    assert len(hotspots) >= 1
    if len(hotspots) > 0:
        assert "segment_range" in hotspots[0]
        assert "risk_score" in hotspots[0]
        assert "description" in hotspots[0]
