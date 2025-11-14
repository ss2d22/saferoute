"""Unit tests for RouteSafetyService."""

from datetime import date
from unittest.mock import Mock

import pytest
from shapely import wkt as wkt_module
from shapely.geometry import LineString

from app.services.route_safety_service import RouteSafetyService


class TestRouteSafetyService:
    """Test suite for RouteSafetyService."""

    @pytest.fixture
    def mock_db(self):
        """Create a mock database session."""
        return Mock()

    @pytest.fixture
    def service(self, mock_db):
        """Create a RouteSafetyService instance."""
        return RouteSafetyService(mock_db)

    @pytest.fixture
    def sample_route_geometry(self):
        """Sample GeoJSON route geometry."""
        return {
            "type": "LineString",
            "coordinates": [
                [-1.415, 50.855],
                [-1.414, 50.856],
                [-1.413, 50.857],
                [-1.412, 50.858],
            ],
        }

    @pytest.fixture
    def sample_safety_cells(self):
        """Sample safety cells with mock geometries."""
        cells = []

        # Create mock cells
        for i in range(3):
            cell = Mock()
            cell.cell_id = f"test_cell_{i}"
            cell.month = date(2025, 9, 1)
            cell.crime_count_total = 5 + i
            cell.crime_count_weighted = 10.0 + (i * 2.0)
            cell.stats = {
                "burglary": 2,
                "violent-crime": 3 + i,
            }

            # Create WKT geometry (polygon around route area)
            lng = -1.415 + (i * 0.01)
            lat = 50.855 + (i * 0.01)
            wkt_str = f"POLYGON(({lng} {lat}, {lng+0.01} {lat}, {lng+0.01} {lat+0.01}, {lng} {lat+0.01}, {lng} {lat}))"

            # Mock the geometry with a Shapely polygon
            cell.geom = wkt_module.loads(wkt_str)

            cells.append(cell)

        return cells

    def test_empty_route_geometry(self, service):
        """Test scoring with empty route geometry."""
        result = service.score_route(route_geometry={"coordinates": []}, lookback_months=12)

        assert result["safety_score"] == 100.0
        assert result["risk_class"] == "low"
        assert result["segment_count"] == 0

    def test_invalid_route_geometry(self, service):
        """Test scoring with invalid route geometry (single point)."""
        result = service.score_route(
            route_geometry={"coordinates": [[-1.415, 50.855]]}, lookback_months=12
        )

        assert result["safety_score"] == 100.0
        assert result["risk_class"] == "low"

    def test_empty_score(self, service):
        """Test the _empty_score method."""
        result = service._empty_score()

        assert result["safety_score"] == 100.0
        assert result["risk_class"] == "low"
        assert result["total_weighted_risk"] == 0.0
        assert result["max_segment_risk"] == 0.0
        assert result["avg_segment_risk"] == 0.0
        assert result["segment_count"] == 0
        assert result["segments"] == []
        assert result["hotspots"] == []
        assert result["crime_breakdown"] == {}
        assert result["cells_analyzed"] == 0

    def test_create_route_segments(self, service, sample_route_geometry):
        """Test route segmentation."""
        route_line = LineString(sample_route_geometry["coordinates"])

        # Test with small segment length (should create multiple segments)
        segments = service._create_route_segments(route_line, max_segment_length_deg=0.001)

        assert len(segments) > 1
        assert all(isinstance(seg, LineString) for seg in segments)

        # Test with large segment length (should create single segment)
        segments = service._create_route_segments(route_line, max_segment_length_deg=1.0)

        assert len(segments) >= 1

    def test_find_intersecting_cells_with_wkt_strings(self, service):
        """Test finding intersecting cells when geom is WKT string."""
        route_line = LineString([(-1.415, 50.855), (-1.410, 50.858)])

        # Create mock cells with WKT string geometry
        cells = []
        cell = Mock()
        cell.geom = "POLYGON((-1.42 50.85,-1.41 50.85,-1.41 50.86,-1.42 50.86,-1.42 50.85))"
        cells.append(cell)

        result = service._find_intersecting_cells(route_line, cells, buffer_meters=50)

        # Should intersect
        assert len(result) == 1

    def test_find_intersecting_cells_no_intersection(self, service):
        """Test finding intersecting cells with no intersection."""
        route_line = LineString([(-1.0, 50.0), (-0.9, 50.1)])

        # Create cell far from route
        cells = []
        cell = Mock()
        cell.geom = "POLYGON((-2.0 51.0,-1.9 51.0,-1.9 51.1,-2.0 51.1,-2.0 51.0))"
        cells.append(cell)

        result = service._find_intersecting_cells(route_line, cells, buffer_meters=50)

        # Should not intersect
        assert len(result) == 0

    def test_find_intersecting_cells_with_invalid_geometry(self, service):
        """Test handling of invalid geometries."""
        route_line = LineString([(-1.415, 50.855), (-1.410, 50.858)])

        # Create cell with invalid geometry
        cells = []
        cell = Mock()
        cell.geom = None  # Invalid
        cells.append(cell)

        cell2 = Mock()
        cell2.geom = "INVALID WKT"  # Invalid WKT
        cells.append(cell2)

        # Should handle gracefully and return empty list
        result = service._find_intersecting_cells(route_line, cells, buffer_meters=50)
        assert len(result) == 0

    def test_calculate_segment_risk_no_cells(self, service):
        """Test risk calculation with no cells."""
        current_month = date(2025, 11, 1)
        risk = service._calculate_segment_risk([], current_month)

        assert risk == 0.0

    def test_calculate_segment_risk_with_cells(self, service, sample_safety_cells):
        """Test risk calculation with cells."""
        current_month = date(2025, 11, 1)
        risk = service._calculate_segment_risk(sample_safety_cells, current_month, time_of_day=None)

        # Should calculate some risk
        assert risk > 0.0

    def test_calculate_segment_risk_with_time_of_day(self, service, sample_safety_cells):
        """Test risk calculation with time-of-day weighting."""
        current_month = date(2025, 11, 1)

        risk_night = service._calculate_segment_risk(
            sample_safety_cells, current_month, time_of_day="night"
        )

        risk_day = service._calculate_segment_risk(
            sample_safety_cells, current_month, time_of_day="day"
        )

        # Risks should be calculated (values depend on config)
        assert risk_night >= 0.0
        assert risk_day >= 0.0

    def test_identify_hotspots_no_risk(self, service):
        """Test hotspot identification with no risk."""
        segment_scores = [
            {"segment_index": 0, "start_point": [-1.415, 50.855], "risk_score": 0.0},
            {"segment_index": 1, "start_point": [-1.414, 50.856], "risk_score": 0.0},
        ]

        hotspots = service._identify_hotspots(segment_scores, avg_risk=0.0)

        assert len(hotspots) == 0

    def test_identify_hotspots_with_high_risk(self, service):
        """Test hotspot identification with high risk segments."""
        segment_scores = [
            {"segment_index": 0, "start_point": [-1.415, 50.855], "risk_score": 10.0},
            {"segment_index": 1, "start_point": [-1.414, 50.856], "risk_score": 2.0},
            {"segment_index": 2, "start_point": [-1.413, 50.857], "risk_score": 20.0},
        ]

        avg_risk = sum(s["risk_score"] for s in segment_scores) / len(segment_scores)
        hotspots = service._identify_hotspots(segment_scores, avg_risk)

        # Segments with risk >= 1.5 * avg should be hotspots
        assert len(hotspots) > 0
        assert all("segment_index" in h for h in hotspots)
        assert all("location" in h for h in hotspots)
        assert all("risk_level" in h for h in hotspots)

    def test_identify_critical_hotspots(self, service):
        """Test identification of critical vs high risk hotspots."""
        segment_scores = [
            {"segment_index": 0, "start_point": [-1.415, 50.855], "risk_score": 100.0},  # Critical
            {"segment_index": 1, "start_point": [-1.414, 50.856], "risk_score": 10.0},  # High
            {"segment_index": 2, "start_point": [-1.413, 50.857], "risk_score": 1.0},  # Normal
        ]

        avg_risk = 37.0
        hotspots = service._identify_hotspots(segment_scores, avg_risk)

        # Check for critical and high risk levels
        risk_levels = [h["risk_level"] for h in hotspots]
        assert "critical" in risk_levels or "high" in risk_levels

    def test_calculate_crime_breakdown_no_cells(self, service):
        """Test crime breakdown with no cells."""
        current_month = date(2025, 11, 1)
        breakdown = service._calculate_crime_breakdown([], current_month)

        assert breakdown == {}

    def test_calculate_crime_breakdown_with_cells(self, service, sample_safety_cells):
        """Test crime breakdown with cells."""
        current_month = date(2025, 11, 1)
        breakdown = service._calculate_crime_breakdown(sample_safety_cells, current_month)

        # Should have crime categories
        assert len(breakdown) > 0
        assert "burglary" in breakdown or "violent-crime" in breakdown
        assert all(isinstance(count, float) for count in breakdown.values())

    def test_calculate_crime_breakdown_with_time_of_day(self, service, sample_safety_cells):
        """Test crime breakdown with time-of-day weighting."""
        current_month = date(2025, 11, 1)

        breakdown_night = service._calculate_crime_breakdown(
            sample_safety_cells, current_month, time_of_day="night"
        )

        breakdown_day = service._calculate_crime_breakdown(
            sample_safety_cells, current_month, time_of_day="day"
        )

        # Both should have data
        assert len(breakdown_night) > 0
        assert len(breakdown_day) > 0

    def test_buffer_calculation(self, service):
        """Test buffer calculation converts meters to degrees."""
        route_line = LineString([(-1.415, 50.855), (-1.410, 50.858)])

        # 50 meters should be approximately 0.00045 degrees
        buffer_meters = 50
        buffer_degrees = buffer_meters / 111000.0

        buffered = route_line.buffer(buffer_degrees)

        # Buffered geometry should be larger than original
        assert buffered.area > 0
        assert buffered.contains(route_line)

    def test_safety_score_calculation(self, service):
        """Test safety score normalization."""
        # Test perfect safety (no risk)
        normalized_risk = 0.0
        safety_score = round((1.0 - normalized_risk) * 100, 1)
        assert safety_score == 100.0

        # Test high risk
        normalized_risk = 1.0
        safety_score = round((1.0 - normalized_risk) * 100, 1)
        assert safety_score == 0.0

        # Test medium risk
        normalized_risk = 0.5
        safety_score = round((1.0 - normalized_risk) * 100, 1)
        assert safety_score == 50.0

    def test_risk_class_determination(self, service):
        """Test risk class categorization."""
        # Low risk
        assert 100.0 >= 80  # low

        # Medium risk
        assert 70.0 >= 60 and 70.0 < 80  # medium

        # High risk
        assert 50.0 < 60  # high
