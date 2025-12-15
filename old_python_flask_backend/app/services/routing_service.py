"""OpenRouteService routing client."""

import asyncio
import hashlib
import json
import logging
from typing import Any, Dict, List, Optional

import httpx
import redis.asyncio as redis

from app.config import get_settings
from app.core.exceptions import ExternalServiceError

logger = logging.getLogger(__name__)
settings = get_settings()


class RoutingService:
    """OpenRouteService routing client with Redis caching."""

    def __init__(self):
        self.base_url = settings.ORS_API_URL
        self.api_key = settings.ORS_API_KEY
        self.timeout = 15.0
        self.max_retries = 2
        self.cache_ttl = 86400  # 24 hours
        self._redis_client: Optional[redis.Redis] = None

    async def _get_redis_client(self) -> Optional[redis.Redis]:
        """Get or create Redis client."""
        if self._redis_client is None:
            try:
                self._redis_client = redis.from_url(
                    settings.REDIS_URL, encoding="utf-8", decode_responses=True
                )
                # Test connection
                await self._redis_client.ping()
                logger.info("Redis connection established for ORS caching")
            except Exception as e:
                logger.warning(f"Redis connection failed: {str(e)}. Caching disabled.")
                self._redis_client = None
        return self._redis_client

    def _generate_cache_key(
        self, profile: str, coordinates: List[List[float]], alternatives: int
    ) -> str:
        """Generate cache key for ORS request."""
        data = f"{profile}:{alternatives}:{json.dumps(coordinates)}"
        return f"ors:{hashlib.md5(data.encode()).hexdigest()}"

    async def get_directions(
        self,
        coordinates: List[List[float]],  # [[lng, lat], [lng, lat]]
        profile: str = "foot-walking",
        alternatives: int = 3,
    ) -> Dict[str, Any]:
        """Get directions from OpenRouteService.

        Args:
            coordinates: [longitude, latitude] pairs
            profile: foot-walking, cycling-regular, or driving-car
            alternatives: Number of route alternatives

        Returns:
            GeoJSON response with route features

        Raises:
            ExternalServiceError: ORS unavailable or error
        """
        # Try to get from cache first
        cache_key = self._generate_cache_key(profile, coordinates, alternatives)
        redis_client = await self._get_redis_client()

        if redis_client:
            try:
                cached = await redis_client.get(cache_key)
                if cached:
                    logger.info(f"Cache HIT for {cache_key}")
                    return json.loads(cached)
                logger.info(f"Cache MISS for {cache_key}")
            except Exception as e:
                logger.warning(f"Redis get error: {str(e)}")

        # Fetch from ORS API
        url = f"{self.base_url}/v2/directions/{profile}/geojson"

        headers = {
            "Authorization": self.api_key,
            "Content-Type": "application/json",
        }

        body = {
            "coordinates": coordinates,
            "instructions": True,
            "alternative_routes": {
                "target_count": alternatives,
                "share_factor": 0.6,
                "weight_factor": 1.4,
            },
        }

        for attempt in range(self.max_retries):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(url, json=body, headers=headers)

                    if response.status_code == 200:
                        data = response.json()
                        logger.info(f"Fetched {len(data.get('features', []))} routes from ORS")

                        # Cache the response
                        if redis_client:
                            try:
                                await redis_client.setex(
                                    cache_key, self.cache_ttl, json.dumps(data)
                                )
                                logger.info(f"Cached ORS response for {cache_key}")
                            except Exception as e:
                                logger.warning(f"Redis set error: {str(e)}")

                        return data

                    elif response.status_code == 400:
                        logger.error(f"Invalid ORS request: {response.text}")
                        raise ExternalServiceError("Invalid routing request")

                    elif response.status_code == 429:
                        logger.warning("ORS rate limit exceeded")
                        if attempt < self.max_retries - 1:
                            await asyncio.sleep(2**attempt)
                            continue
                        raise ExternalServiceError("Rate limit exceeded")

                    else:
                        logger.error(f"ORS error {response.status_code}: {response.text}")
                        if attempt < self.max_retries - 1:
                            await asyncio.sleep(2**attempt)
                            continue
                        raise ExternalServiceError("Routing service unavailable")

            except httpx.TimeoutException:
                logger.error(f"ORS timeout (attempt {attempt + 1})")
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(2**attempt)
                    continue
                raise ExternalServiceError("Routing service timeout")

            except Exception as e:
                logger.error(f"Error fetching routes: {str(e)}")
                raise ExternalServiceError(f"Routing error: {str(e)}")

        raise ExternalServiceError("Failed to fetch routes after retries")

    def extract_route_info(self, feature: Dict[str, Any]) -> Dict[str, Any]:
        """Extract route information from ORS GeoJSON feature.

        Args:
            feature: GeoJSON feature from ORS response

        Returns:
            Dict with route info (geometry, distance, duration, instructions)
        """
        properties = feature.get("properties", {})
        summary = properties.get("summary", {})

        return {
            "geometry": feature.get("geometry"),
            "distance_m": int(summary.get("distance", 0)),
            "duration_s": int(summary.get("duration", 0)),
            "instructions": properties.get("segments", [{}])[0].get("steps", []),
        }
