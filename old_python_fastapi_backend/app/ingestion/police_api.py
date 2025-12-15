"""UK Police API client."""

import asyncio
import logging
from datetime import date
from typing import Any, Dict, List, Tuple

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class PoliceAPIClient:
    """Client for UK Police Data API."""

    def __init__(self):
        self.base_url = settings.POLICE_API_BASE_URL
        self.timeout = 30.0
        self.max_retries = 3
        self.retry_delays = [1, 2, 4]  # Exponential backoff

    async def get_crimes_street(
        self,
        polygon: List[Tuple[float, float]],
        month: date,
        category: str = "all-crime",
    ) -> Tuple[List[Dict[str, Any]], int]:
        """Get street-level crimes for a polygon area.

        Args:
            polygon: List of (lat, lng) tuples defining the polygon
            month: Month to query (first day of month)
            category: Crime category (default: "all-crime")

        Returns:
            Tuple of (crime_list, status_code)

        Note:
            Returns 503 if more than 10,000 crimes for the area
        """
        # Format polygon for API (lat,lng:lat,lng:...)
        poly_str = ":".join([f"{lat},{lng}" for lat, lng in polygon])

        # Format date (YYYY-MM)
        date_str = month.strftime("%Y-%m")

        url = f"{self.base_url}/crimes-street/{category}"
        params = {"poly": poly_str, "date": date_str}

        for attempt in range(self.max_retries):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.get(url, params=params)

                    if response.status_code == 200:
                        crimes = response.json()
                        logger.info(
                            f"Fetched {len(crimes)} crimes for {date_str} "
                            f"(attempt {attempt + 1}/{self.max_retries})"
                        )
                        return crimes, 200

                    elif response.status_code == 503:
                        # Too many results (>10k crimes)
                        logger.warning(
                            f"503 response - too many crimes for {date_str}. "
                            f"Polygon needs splitting."
                        )
                        return [], 503

                    elif response.status_code == 404:
                        # No data available for this month
                        logger.info(f"No crime data available for {date_str}")
                        return [], 404

                    else:
                        logger.error(f"API error {response.status_code}: {response.text}")
                        if attempt < self.max_retries - 1:
                            await asyncio.sleep(self.retry_delays[attempt])
                            continue
                        return [], response.status_code

            except httpx.TimeoutException:
                logger.error(f"Timeout fetching crimes (attempt {attempt + 1})")
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delays[attempt])
                    continue
                return [], 504

            except Exception as e:
                logger.error(f"Error fetching crimes: {str(e)}")
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delays[attempt])
                    continue
                return [], 500

        return [], 500

    def split_polygon(self, polygon: List[Tuple[float, float]]) -> List[List[Tuple[float, float]]]:
        """Split a polygon into 4 quadrants.

        Args:
            polygon: List of (lat, lng) tuples (should be rectangular bbox)

        Returns:
            List of 4 smaller polygons (quadrants)
        """
        # Calculate bounding box
        lats = [p[0] for p in polygon]
        lngs = [p[1] for p in polygon]

        min_lat, max_lat = min(lats), max(lats)
        min_lng, max_lng = min(lngs), max(lngs)

        mid_lat = (min_lat + max_lat) / 2
        mid_lng = (min_lng + max_lng) / 2

        # Create 4 quadrants
        quadrants = [
            # Bottom-left
            [
                (min_lat, min_lng),
                (mid_lat, min_lng),
                (mid_lat, mid_lng),
                (min_lat, mid_lng),
            ],
            # Bottom-right
            [
                (min_lat, mid_lng),
                (mid_lat, mid_lng),
                (mid_lat, max_lng),
                (min_lat, max_lng),
            ],
            # Top-left
            [
                (mid_lat, min_lng),
                (max_lat, min_lng),
                (max_lat, mid_lng),
                (mid_lat, mid_lng),
            ],
            # Top-right
            [
                (mid_lat, mid_lng),
                (max_lat, mid_lng),
                (max_lat, max_lng),
                (mid_lat, max_lng),
            ],
        ]

        return quadrants

    async def get_crimes_with_split(
        self,
        polygon: List[Tuple[float, float]],
        month: date,
        max_depth: int = 4,
        current_depth: int = 0,
    ) -> List[Dict[str, Any]]:
        """Get crimes, recursively splitting polygon if needed.

        Args:
            polygon: Polygon to query
            month: Month to query
            max_depth: Maximum recursion depth to prevent infinite splitting
            current_depth: Current recursion depth

        Returns:
            List of all crimes within the polygon
        """
        if current_depth >= max_depth:
            logger.warning(
                f"Max recursion depth {max_depth} reached. " f"Some crimes may be missing."
            )
            return []

        crimes, status = await self.get_crimes_street(polygon, month)

        if status == 503:
            # Too many crimes - split and recurse
            logger.info(f"Splitting polygon (depth {current_depth + 1})")
            quadrants = self.split_polygon(polygon)

            all_crimes = []
            for quadrant in quadrants:
                quadrant_crimes = await self.get_crimes_with_split(
                    quadrant, month, max_depth, current_depth + 1
                )
                all_crimes.extend(quadrant_crimes)

            return all_crimes

        return crimes

    def normalize_crime(self, crime_data: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize crime data from API response.

        Args:
            crime_data: Raw crime data from API

        Returns:
            Normalized crime dict with consistent fields
        """
        location = crime_data.get("location") or {}
        street = location.get("street") or {}
        outcome_status = crime_data.get("outcome_status") or {}

        return {
            "external_id": crime_data.get("id"),
            "month": crime_data.get("month"),  # Format: "YYYY-MM"
            "category": crime_data.get("category"),
            "crime_type": crime_data.get("location_type", ""),
            "context": crime_data.get("context", ""),
            "persistent_id": crime_data.get("persistent_id"),
            "latitude": float(location.get("latitude", 0) or 0),
            "longitude": float(location.get("longitude", 0) or 0),
            "street_name": street.get("name", ""),
            "outcome_status": outcome_status.get("category"),
        }
