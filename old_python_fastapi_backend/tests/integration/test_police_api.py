"""Integration tests for UK Police API client."""

from datetime import date

import pytest

from app.ingestion.police_api import PoliceAPIClient


@pytest.mark.asyncio
async def test_police_api_client_basic():
    """Test basic UK Police API fetching."""
    client = PoliceAPIClient()

    # Test with a small area in Southampton city center
    # This is a small polygon unlikely to exceed 10k crimes
    polygon = [
        (50.9097, -1.4044),  # lat, lng
        (50.9130, -1.4044),
        (50.9130, -1.3900),
        (50.9097, -1.3900),
    ]

    # Test with a recent month (2 months ago to ensure data availability)
    test_month = date(2024, 10, 1)

    crimes, status = await client.get_crimes_street(polygon, test_month)

    # Should get 200 or 404 (if no data available)
    assert status in [200, 404], f"Unexpected status: {status}"

    if status == 200:
        assert isinstance(crimes, list)

        if len(crimes) > 0:
            # Check crime structure
            crime = crimes[0]
            assert "category" in crime
            assert "location" in crime
            assert "month" in crime


@pytest.mark.asyncio
async def test_police_api_normalize_crime():
    """Test crime data normalization."""
    client = PoliceAPIClient()

    # Sample crime data from API
    raw_crime = {
        "id": 123456,
        "category": "anti-social-behaviour",
        "location_type": "Force",
        "month": "2024-10",
        "context": "",
        "persistent_id": "abc123",
        "location": {
            "latitude": "50.9097",
            "longitude": "-1.4044",
            "street": {"id": 789, "name": "On or near High Street"},
        },
        "outcome_status": {"category": "Under investigation"},
    }

    normalized = client.normalize_crime(raw_crime)

    assert normalized["external_id"] == 123456
    assert normalized["month"] == "2024-10"
    assert normalized["category"] == "anti-social-behaviour"
    assert normalized["crime_type"] == "Force"
    assert normalized["latitude"] == 50.9097
    assert normalized["longitude"] == -1.4044
    assert normalized["street_name"] == "On or near High Street"
    assert normalized["persistent_id"] == "abc123"


@pytest.mark.asyncio
async def test_police_api_polygon_splitting():
    """Test polygon splitting logic."""
    client = PoliceAPIClient()

    # Create a bounding box polygon
    polygon = [
        (50.9, -1.5),
        (51.0, -1.5),
        (51.0, -1.3),
        (50.9, -1.3),
    ]

    quadrants = client.split_polygon(polygon)

    # Should get 4 quadrants
    assert len(quadrants) == 4

    # Each quadrant should have 4 points
    for quadrant in quadrants:
        assert len(quadrant) == 4


@pytest.mark.skip(reason="Requires real API call, run manually when needed")
@pytest.mark.asyncio
async def test_police_api_with_splitting():
    """Test crime fetching with automatic polygon splitting.

    Note: Skipped by default as it makes real API calls.
    Run manually with: pytest tests/integration/test_police_api.py::test_police_api_with_splitting -v -s
    """
    client = PoliceAPIClient()

    # Large area that might trigger splitting
    polygon = [
        (50.85, -1.55),
        (51.0, -1.55),
        (51.0, -1.3),
        (50.85, -1.3),
    ]

    test_month = date(2024, 10, 1)

    crimes = await client.get_crimes_with_split(polygon, test_month, max_depth=3)

    assert isinstance(crimes, list)
    print(f"Fetched {len(crimes)} crimes for large area")


@pytest.mark.skip(reason="Manual test - requires API availability check")
@pytest.mark.asyncio
async def test_police_api_recent_data():
    """Test fetching recent crime data.

    Note: Run manually to verify API is working with recent data.
    """
    client = PoliceAPIClient()

    # Small Southampton city center area
    polygon = [
        (50.9097, -1.4044),
        (50.9120, -1.4044),
        (50.9120, -1.4000),
        (50.9097, -1.4000),
    ]

    # Try last 3 months
    from datetime import timedelta

    current_date = date.today().replace(day=1)

    for i in range(3):
        test_month = current_date - timedelta(days=30 * (i + 1))
        test_month = test_month.replace(day=1)

        crimes, status = await client.get_crimes_street(polygon, test_month)

        print(f"\nMonth: {test_month.strftime('%Y-%m')}")
        print(f"Status: {status}")
        print(f"Crimes: {len(crimes) if status == 200 else 'N/A'}")

        if status == 200 and len(crimes) > 0:
            print(f"Sample crime categories: {set(c['category'] for c in crimes[:5])}")
