"""Integration tests for ORS Redis caching."""

from unittest.mock import AsyncMock, patch

import pytest

from app.services.routing_service import RoutingService


@pytest.mark.asyncio
async def test_ors_caching_saves_to_redis():
    """Test that ORS responses are cached in Redis."""
    service = RoutingService()

    coordinates = [[-1.4044, 50.9097], [-1.4300, 50.9130]]
    profile = "foot-walking"

    # Clear any existing cache first
    redis_client = await service._get_redis_client()
    if redis_client:
        cache_key = service._generate_cache_key(profile, coordinates, 3)
        await redis_client.delete(cache_key)

    # Mock ORS response
    mock_response = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[-1.4044, 50.9097], [-1.4300, 50.9130]],
                },
                "properties": {
                    "summary": {"distance": 2300, "duration": 1800},
                    "segments": [{"steps": []}],
                },
            }
        ],
    }

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        # Setup mock response with sync json() method (httpx.Response.json is not async)
        from unittest.mock import Mock

        mock_resp = AsyncMock()
        mock_resp.status_code = 200
        mock_resp.json = Mock(return_value=mock_response)  # Regular Mock, not AsyncMock
        mock_post.return_value = mock_resp

        # First call - should hit ORS API
        result1 = await service.get_directions(coordinates, profile)
        assert result1 == mock_response
        assert mock_post.call_count == 1

        # Second call - should hit cache (no additional API call)
        result2 = await service.get_directions(coordinates, profile)
        assert result2 == mock_response
        assert mock_post.call_count == 1  # Still 1, not 2!

    # Clean up Redis
    redis_client = await service._get_redis_client()
    if redis_client:
        cache_key = service._generate_cache_key(profile, coordinates, 3)
        await redis_client.delete(cache_key)
        await redis_client.close()


@pytest.mark.asyncio
async def test_ors_caching_different_params_different_cache():
    """Test that different parameters generate different cache keys."""
    service = RoutingService()

    coords1 = [[-1.4044, 50.9097], [-1.4300, 50.9130]]
    coords2 = [[-1.4044, 50.9097], [-1.4400, 50.9200]]  # Different destination

    key1 = service._generate_cache_key("foot-walking", coords1, 3)
    key2 = service._generate_cache_key("foot-walking", coords2, 3)
    key3 = service._generate_cache_key("cycling-regular", coords1, 3)  # Different profile

    assert key1 != key2  # Different coords
    assert key1 != key3  # Different profile
    assert key2 != key3


@pytest.mark.asyncio
async def test_ors_caching_gracefully_handles_redis_failure():
    """Test that ORS still works if Redis is unavailable."""
    service = RoutingService()
    service._redis_client = None  # Simulate Redis unavailable

    coordinates = [[-1.4044, 50.9097], [-1.4300, 50.9130]]

    mock_response = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "LineString", "coordinates": coordinates},
                "properties": {
                    "summary": {"distance": 2300, "duration": 1800},
                    "segments": [{"steps": []}],
                },
            }
        ],
    }

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        from unittest.mock import Mock

        mock_resp = AsyncMock()
        mock_resp.status_code = 200
        mock_resp.json = Mock(return_value=mock_response)
        mock_post.return_value = mock_resp

        # Should still work without caching
        result = await service.get_directions(coordinates, "foot-walking")
        assert result == mock_response


@pytest.mark.asyncio
async def test_cache_key_generation():
    """Test that cache keys are generated correctly."""
    service = RoutingService()

    coords = [[-1.4044, 50.9097], [-1.4300, 50.9130]]
    key1 = service._generate_cache_key("foot-walking", coords, 3)

    # Key should be consistent
    key2 = service._generate_cache_key("foot-walking", coords, 3)
    assert key1 == key2

    # Key should start with 'ors:'
    assert key1.startswith("ors:")

    # Key should be an MD5 hash (32 chars) + prefix
    assert len(key1) == 36  # "ors:" (4) + 32 char hash
