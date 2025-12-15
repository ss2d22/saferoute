"""Integration tests for safety snapshot caching."""

import json
from datetime import date, datetime

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.cache_service import CacheService


@pytest.fixture
async def cache_service():
    """Get cache service instance."""
    service = CacheService()
    yield service
    # Cleanup
    await service.close()


@pytest.fixture
def sample_safety_data(db: Session):
    """Create sample safety cells for caching tests."""
    from app.models import CrimeCategory

    # Create crime categories
    categories = [
        CrimeCategory(
            id="burglary",
            name="Burglary",
            harm_weight_default=2.0,
            is_personal=False,
            is_property=True,
        ),
    ]

    for category in categories:
        db.add(category)
    db.commit()

    # Insert safety cells using raw SQL
    month = date.today().replace(day=1)
    now = datetime.utcnow()

    db.execute(
        text(
            """
            INSERT INTO safety_cells
            (id, cell_id, geom, month, crime_count_total, crime_count_weighted, stats, updated_at)
            VALUES (:id, :cell_id, :geom, :month, :crime_count_total, :crime_count_weighted, :stats, :updated_at)
        """
        ),
        {
            "id": 1,
            "cell_id": "test_cache_cell",
            "geom": "POLYGON((-1.4 50.9, -1.39 50.9, -1.39 50.91, -1.4 50.91, -1.4 50.9))",
            "month": month,
            "crime_count_total": 50,
            "crime_count_weighted": 100.0,
            "stats": json.dumps({"burglary": 50}),
            "updated_at": now,
        },
    )

    db.commit()


@pytest.mark.asyncio
async def test_cache_key_generation():
    """Test that cache keys are generated correctly."""
    service = CacheService()

    key1 = service._generate_cache_key("-1.5,50.85,-1.3,51.0", 12, None)
    key2 = service._generate_cache_key("-1.5,50.85,-1.3,51.0", 12, None)
    key3 = service._generate_cache_key("-1.5,50.85,-1.3,51.0", 6, None)
    key4 = service._generate_cache_key("-1.5,50.85,-1.3,51.0", 12, "night")

    # Same parameters should generate same key
    assert key1 == key2

    # Different parameters should generate different keys
    assert key1 != key3  # Different lookback_months
    assert key1 != key4  # Different time_of_day

    # Keys should start with correct prefix
    assert key1.startswith("safety:snapshot:")


@pytest.mark.asyncio
async def test_cache_set_and_get():
    """Test caching and retrieving safety snapshot data."""
    service = CacheService()

    test_data = {
        "cells": [{"id": "cell1", "safety_score": 85.0}],
        "summary": {"total_cells": 1},
        "meta": {"lookback_months": 12},
    }

    # Set cache
    success = await service.set_snapshot(
        bbox="-1.5,50.85,-1.3,51.0",
        lookback_months=12,
        time_of_day=None,
        data=test_data,
        ttl=60,  # 60 seconds for test
    )

    assert success is True

    # Get from cache
    cached = await service.get_snapshot(
        bbox="-1.5,50.85,-1.3,51.0",
        lookback_months=12,
        time_of_day=None,
    )

    assert cached is not None
    assert cached == test_data
    assert cached["cells"][0]["id"] == "cell1"


@pytest.mark.asyncio
async def test_cache_miss():
    """Test cache miss returns None."""
    service = CacheService()

    # Try to get non-existent cache
    cached = await service.get_snapshot(
        bbox="-999,-999,-998,-998",
        lookback_months=12,
        time_of_day=None,
    )

    assert cached is None


@pytest.mark.asyncio
async def test_cache_different_parameters():
    """Test that different parameters create separate cache entries."""
    service = CacheService()

    data1 = {"cells": [{"id": "data1"}]}
    data2 = {"cells": [{"id": "data2"}]}

    # Cache with different lookback_months
    await service.set_snapshot("-1.5,50.85,-1.3,51.0", 12, None, data1, ttl=60)
    await service.set_snapshot("-1.5,50.85,-1.3,51.0", 6, None, data2, ttl=60)

    # Retrieve both
    cached1 = await service.get_snapshot("-1.5,50.85,-1.3,51.0", 12, None)
    cached2 = await service.get_snapshot("-1.5,50.85,-1.3,51.0", 6, None)

    # Should get different data
    assert cached1["cells"][0]["id"] == "data1"
    assert cached2["cells"][0]["id"] == "data2"


@pytest.mark.asyncio
async def test_cache_with_time_of_day():
    """Test caching with different time_of_day parameters."""
    service = CacheService()

    data_night = {"cells": [{"id": "night_data"}]}
    data_day = {"cells": [{"id": "day_data"}]}

    # Cache with different time_of_day
    await service.set_snapshot("-1.5,50.85,-1.3,51.0", 12, "night", data_night, ttl=60)
    await service.set_snapshot("-1.5,50.85,-1.3,51.0", 12, "day", data_day, ttl=60)

    # Retrieve both
    cached_night = await service.get_snapshot("-1.5,50.85,-1.3,51.0", 12, "night")
    cached_day = await service.get_snapshot("-1.5,50.85,-1.3,51.0", 12, "day")

    # Should get different data
    assert cached_night["cells"][0]["id"] == "night_data"
    assert cached_day["cells"][0]["id"] == "day_data"


@pytest.mark.asyncio
async def test_cache_invalidation():
    """Test cache invalidation."""
    service = CacheService()

    test_data = {"cells": [{"id": "cell1"}]}

    # Set cache
    await service.set_snapshot("-1.5,50.85,-1.3,51.0", 12, None, test_data, ttl=60)

    # Verify it's cached
    cached = await service.get_snapshot("-1.5,50.85,-1.3,51.0", 12, None)
    assert cached is not None

    # Invalidate
    success = await service.invalidate_snapshot("-1.5,50.85,-1.3,51.0", 12, None)
    assert success is True

    # Should no longer be cached
    cached_after = await service.get_snapshot("-1.5,50.85,-1.3,51.0", 12, None)
    assert cached_after is None


@pytest.mark.asyncio
async def test_invalidate_all_snapshots():
    """Test invalidating all safety snapshot caches."""
    service = CacheService()

    # Create multiple cache entries
    for i in range(3):
        await service.set_snapshot(
            f"-1.{i},50.85,-1.{i+1},51.0",
            12,
            None,
            {"cells": [{"id": f"cell{i}"}]},
            ttl=60,
        )

    # Invalidate all
    count = await service.invalidate_all_snapshots()

    # Should have invalidated at least 3 entries
    assert count >= 3

    # Verify all are gone
    for i in range(3):
        cached = await service.get_snapshot(f"-1.{i},50.85,-1.{i+1},51.0", 12, None)
        assert cached is None


@pytest.mark.asyncio
async def test_safety_snapshot_caching_integration(client, sample_safety_data):
    """Test that safety snapshot endpoint uses caching."""
    bbox = "-1.5,50.85,-1.3,51.0"

    # Clear any existing cache first
    service = CacheService()
    await service.invalidate_all_snapshots()

    # First request - should hit database
    response1 = client.get(
        "/api/v1/safety/snapshot",
        params={"bbox": bbox, "lookback_months": 1},
    )

    assert response1.status_code == 200
    data1 = response1.json()

    # Second request - should hit cache
    response2 = client.get(
        "/api/v1/safety/snapshot",
        params={"bbox": bbox, "lookback_months": 1},
    )

    assert response2.status_code == 200
    data2 = response2.json()

    # Data should be identical
    assert data1 == data2
    assert data1["summary"]["total_cells"] == data2["summary"]["total_cells"]

    # Cleanup - invalidate cache after test
    await service.invalidate_all_snapshots()
    await service.close()


@pytest.mark.asyncio
async def test_cache_graceful_degradation():
    """Test that caching failures don't break the service."""
    from unittest.mock import patch

    service = CacheService()

    # Mock Redis to raise an exception
    with patch.object(service, "_get_redis_client", return_value=None):
        # These should not raise errors
        cached = await service.get_snapshot("-1.5,50.85,-1.3,51.0", 12, None)
        assert cached is None

        success = await service.set_snapshot("-1.5,50.85,-1.3,51.0", 12, None, {}, ttl=60)
        assert success is False


@pytest.mark.asyncio
async def test_cache_ttl():
    """Test that cache TTL is set correctly."""
    service = CacheService()

    # Default TTL should be 1 hour
    assert service.cache_ttl == 3600

    # Custom TTL should work
    test_data = {"cells": []}
    await service.set_snapshot("-1.5,50.85,-1.3,51.0", 12, None, test_data, ttl=30)

    # Should be cached
    cached = await service.get_snapshot("-1.5,50.85,-1.3,51.0", 12, None)
    assert cached is not None
