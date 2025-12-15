"""Redis caching service for safety data."""

import hashlib
import json
import logging
from typing import Any, Dict, Optional

import redis.asyncio as redis

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class CacheService:
    """Redis cache for safety snapshots."""

    def __init__(self):
        self.cache_ttl = 3600  # 1 hour for safety snapshots
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
                logger.debug("Redis connection established for safety caching")
            except Exception as e:
                logger.warning(f"Redis connection failed: {str(e)}. Caching disabled.")
                self._redis_client = None
        return self._redis_client

    def _generate_cache_key(
        self, bbox: str, lookback_months: int, time_of_day: Optional[str] = None
    ) -> str:
        """Generate cache key from snapshot parameters.

        Args:
            bbox: Bounding box
            lookback_months: Months of historical data
            time_of_day: Time period filter

        Returns:
            MD5 hash as cache key
        """
        # Create a stable cache key from parameters
        key_data = f"{bbox}:{lookback_months}:{time_of_day or 'none'}"
        key_hash = hashlib.md5(key_data.encode()).hexdigest()
        return f"safety:snapshot:{key_hash}"

    async def get_snapshot(
        self, bbox: str, lookback_months: int, time_of_day: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Retrieve cached safety snapshot.

        Args:
            bbox: Bounding box
            lookback_months: Months of historical data
            time_of_day: Time period filter

        Returns:
            Cached data or None
        """
        cache_key = self._generate_cache_key(bbox, lookback_months, time_of_day)
        redis_client = await self._get_redis_client()

        if redis_client:
            try:
                cached = await redis_client.get(cache_key)
                if cached:
                    logger.info(f"Cache HIT for safety snapshot: {cache_key}")
                    return json.loads(cached)
                logger.info(f"Cache MISS for safety snapshot: {cache_key}")
            except Exception as e:
                logger.warning(f"Redis get error: {str(e)}")

        return None

    async def set_snapshot(
        self,
        bbox: str,
        lookback_months: int,
        time_of_day: Optional[str],
        data: Dict[str, Any],
        ttl: Optional[int] = None,
    ) -> bool:
        """Cache safety snapshot data.

        Args:
            bbox: Bounding box string
            lookback_months: Number of months to look back
            time_of_day: Optional time of day filter
            data: Snapshot data to cache
            ttl: Time to live in seconds (default: 1 hour)

        Returns:
            True if cached successfully, False otherwise
        """
        cache_key = self._generate_cache_key(bbox, lookback_months, time_of_day)
        redis_client = await self._get_redis_client()

        if redis_client:
            try:
                ttl = ttl or self.cache_ttl
                await redis_client.setex(cache_key, ttl, json.dumps(data))
                logger.info(f"Cached safety snapshot: {cache_key} (TTL: {ttl}s)")
                return True
            except Exception as e:
                logger.warning(f"Redis set error: {str(e)}")

        return False

    async def invalidate_snapshot(
        self, bbox: str, lookback_months: int, time_of_day: Optional[str] = None
    ) -> bool:
        """Invalidate cached safety snapshot.

        Args:
            bbox: Bounding box string
            lookback_months: Number of months to look back
            time_of_day: Optional time of day filter

        Returns:
            True if invalidated successfully, False otherwise
        """
        cache_key = self._generate_cache_key(bbox, lookback_months, time_of_day)
        redis_client = await self._get_redis_client()

        if redis_client:
            try:
                deleted = await redis_client.delete(cache_key)
                if deleted:
                    logger.info(f"Invalidated cache: {cache_key}")
                    return True
            except Exception as e:
                logger.warning(f"Redis delete error: {str(e)}")

        return False

    async def invalidate_all_snapshots(self) -> int:
        """Invalidate all cached safety snapshots.

        Useful after crime data ingestion or grid rebuild.

        Returns:
            Number of keys deleted
        """
        redis_client = await self._get_redis_client()

        if redis_client:
            try:
                # Find all safety snapshot keys
                pattern = "safety:snapshot:*"
                keys = []

                async for key in redis_client.scan_iter(match=pattern, count=100):
                    keys.append(key)

                if keys:
                    deleted = await redis_client.delete(*keys)
                    logger.info(f"Invalidated {deleted} safety snapshot caches")
                    return deleted
                else:
                    logger.info("No safety snapshot caches to invalidate")
                    return 0

            except Exception as e:
                logger.warning(f"Redis invalidate all error: {str(e)}")

        return 0

    async def close(self):
        """Close Redis connection."""
        if self._redis_client:
            await self._redis_client.close()
            self._redis_client = None
