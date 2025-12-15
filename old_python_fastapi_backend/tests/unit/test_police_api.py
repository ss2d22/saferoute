"""Unit tests for UK Police API client."""

from app.ingestion.police_api import PoliceAPIClient


def test_normalize_crime():
    """Test crime data normalization."""
    client = PoliceAPIClient()

    raw_crime = {
        "id": 123456,
        "category": "violent-crime",
        "location_type": "Force",
        "location": {
            "latitude": "50.9097",
            "longitude": "-1.4044",
            "street": {"name": "High Street"},
        },
        "context": "",
        "persistent_id": "abc123",
        "month": "2024-09",
        "outcome_status": {"category": "Under investigation"},
    }

    normalized = client.normalize_crime(raw_crime)

    assert normalized["external_id"] == 123456
    assert normalized["category"] == "violent-crime"
    assert normalized["latitude"] == 50.9097
    assert normalized["longitude"] == -1.4044
    assert normalized["month"] == "2024-09"
    assert normalized["street_name"] == "High Street"


def test_normalize_crime_missing_location():
    """Test normalization with missing location data."""
    client = PoliceAPIClient()

    raw_crime = {"id": 123456, "category": "burglary", "location": {}, "month": "2024-09"}

    normalized = client.normalize_crime(raw_crime)

    # Should handle missing data gracefully
    assert normalized["latitude"] == 0.0
    assert normalized["longitude"] == 0.0


def test_split_polygon():
    """Test polygon splitting into quadrants."""
    client = PoliceAPIClient()

    # Simple rectangular polygon
    polygon = [
        (50.0, -1.0),
        (51.0, -1.0),
        (51.0, 0.0),
        (50.0, 0.0),
    ]

    quadrants = client.split_polygon(polygon)

    assert len(quadrants) == 4
    assert all(len(q) == 4 for q in quadrants)  # Each quadrant has 4 corners


def test_split_polygon_midpoints():
    """Test that polygon is split at correct midpoints."""
    client = PoliceAPIClient()

    polygon = [
        (0.0, 0.0),
        (2.0, 0.0),
        (2.0, 2.0),
        (0.0, 2.0),
    ]

    quadrants = client.split_polygon(polygon)

    # Check that midpoint is 1.0, 1.0
    # All quadrants should touch at (1.0, 1.0)
    all_points = []
    for q in quadrants:
        all_points.extend(q)

    # Check that (1.0, 1.0) appears in multiple quadrants
    midpoint_count = sum(1 for p in all_points if p == (1.0, 1.0))
    assert midpoint_count == 4  # Center point appears in all 4 quadrants
