"""Crime data ingestion from UK Police API.

Fetches crime data for Southampton, normalizes it, and stores in the database.
Splits area into tiles to handle API rate limits and polygon size restrictions.
"""

import logging
from datetime import date, datetime
from typing import List, Tuple

from sqlalchemy.orm import Session

from app.config import get_settings
from app.ingestion.police_api import PoliceAPIClient
from app.repositories.crime_repository import CrimeRepository

logger = logging.getLogger(__name__)
settings = get_settings()


class CrimeIngester:
    """Ingests crime data from UK Police API."""

    def __init__(self, db: Session):
        self.db = db
        self.api_client = PoliceAPIClient()
        self.repo = CrimeRepository(db)

    def _get_southampton_tiles(self) -> List[List[Tuple[float, float]]]:
        """Get tile polygons for Southampton area.

        Returns:
            List of polygon tiles as (lat, lng) tuples
        """
        # Parse Southampton bbox from settings
        bbox_parts = settings.SOUTHAMPTON_BBOX.split(",")
        lat_min, lng_min, lat_max, lng_max = map(float, bbox_parts)

        # For initial tiles, split into 4 quadrants
        mid_lat = (lat_min + lat_max) / 2
        mid_lng = (lng_min + lng_max) / 2

        tiles = [
            # Bottom-left
            [(lat_min, lng_min), (mid_lat, lng_min), (mid_lat, mid_lng), (lat_min, mid_lng)],
            # Bottom-right
            [(lat_min, mid_lng), (mid_lat, mid_lng), (mid_lat, lng_max), (lat_min, lng_max)],
            # Top-left
            [(mid_lat, lng_min), (lat_max, lng_min), (lat_max, mid_lng), (mid_lat, mid_lng)],
            # Top-right
            [(mid_lat, mid_lng), (lat_max, mid_lng), (lat_max, lng_max), (mid_lat, lng_max)],
        ]

        return tiles

    async def ingest_month(
        self, area_name: str, month: date, force_id: str = "hampshire"
    ) -> Tuple[int, str]:
        """Ingest crime data for a specific month.

        Args:
            area_name: Area identifier (e.g., "southampton-core")
            month: Month to ingest (first day of month)
            force_id: Police force ID (default: "hampshire")

        Returns:
            Tuple of (records_ingested, status)
        """
        logger.info(f"Starting ingestion for {area_name}, {month.strftime('%Y-%m')}")

        # Check for existing successful run
        existing_run = self.repo.get_latest_ingestion_run(area_name, month)
        if existing_run and existing_run.status == "success":
            logger.info(f"Ingestion already completed for {month}. Skipping.")
            return existing_run.records_ingested, "skipped"

        # Get tiles for the area
        tiles = self._get_southampton_tiles()

        # Create ingestion run record
        run = self.repo.create_ingestion_run(
            area_name=area_name,
            month=month,
            tiles_total=len(tiles),
        )

        self.repo.update_ingestion_run(run.id, status="running")

        total_crimes = 0
        tiles_processed = 0
        errors = []

        try:
            for tile_idx, tile in enumerate(tiles):
                logger.info(f"Processing tile {tile_idx + 1}/{len(tiles)}")

                try:
                    # Fetch crimes for this tile (with automatic splitting if needed)
                    crimes = await self.api_client.get_crimes_with_split(tile, month)

                    # Normalize and insert crimes
                    for crime_data in crimes:
                        # Skip None values (can happen with malformed API responses)
                        if crime_data is None:
                            continue

                        try:
                            normalized = self.api_client.normalize_crime(crime_data)

                            # Skip if missing coordinates
                            if normalized["latitude"] == 0 or normalized["longitude"] == 0:
                                continue

                            # Convert month string to date
                            month_str = normalized["month"]
                            crime_month = datetime.strptime(month_str, "%Y-%m").date()

                            # Create incident
                            self.repo.create_incident(
                                month=crime_month,
                                category_id=normalized["category"],
                                crime_type=normalized["crime_type"],
                                force_id=force_id,
                                location_desc=normalized["street_name"] or "Unknown location",
                                latitude=normalized["latitude"],
                                longitude=normalized["longitude"],
                                external_id=normalized["external_id"],
                                context=normalized["context"],
                                persistent_id=normalized["persistent_id"],
                            )
                            total_crimes += 1

                        except Exception as e:
                            logger.error(
                                f"Error processing crime record: {str(e)} - Record: {crime_data if crime_data else 'None'}"
                            )
                            # Rollback the session on error to continue processing
                            self.db.rollback()
                            continue

                    tiles_processed += 1
                    self.repo.update_ingestion_run(
                        run.id,
                        tiles_processed=tiles_processed,
                        records_ingested=total_crimes,
                    )

                except Exception as e:
                    error_msg = f"Error processing tile {tile_idx + 1}: {str(e)}"
                    logger.error(error_msg)
                    errors.append(error_msg)
                    continue

            # Determine final status
            if tiles_processed == len(tiles):
                status = "success"
            elif tiles_processed > 0:
                status = "partial"
            else:
                status = "failed"

            error_message = "; ".join(errors) if errors else None

            self.repo.update_ingestion_run(
                run.id,
                status=status,
                finished_at=datetime.utcnow(),
                records_ingested=total_crimes,
                tiles_processed=tiles_processed,
                error_message=error_message,
            )

            logger.info(
                f"Ingestion complete. Status: {status}, "
                f"Crimes ingested: {total_crimes}, "
                f"Tiles processed: {tiles_processed}/{len(tiles)}"
            )

            return total_crimes, status

        except Exception as e:
            logger.error(f"Fatal error during ingestion: {str(e)}")
            self.repo.update_ingestion_run(
                run.id,
                status="failed",
                finished_at=datetime.utcnow(),
                error_message=str(e),
                records_ingested=total_crimes,
                tiles_processed=tiles_processed,
            )
            return total_crimes, "failed"

    def seed_crime_categories(self) -> None:
        """Seed the database with UK Police crime categories."""
        categories = [
            ("anti-social-behaviour", "Anti-social behaviour", 0.5, False, False),
            ("bicycle-theft", "Bicycle theft", 1.0, False, True),
            ("burglary", "Burglary", 2.0, False, True),
            ("criminal-damage-arson", "Criminal damage and arson", 1.5, False, True),
            ("drugs", "Drugs", 1.0, False, False),
            ("other-theft", "Other theft", 1.0, False, True),
            ("possession-of-weapons", "Possession of weapons", 3.0, True, False),
            ("public-order", "Public order", 1.5, True, False),
            ("robbery", "Robbery", 4.0, True, True),
            ("shoplifting", "Shoplifting", 0.5, False, True),
            ("theft-from-the-person", "Theft from the person", 2.5, True, False),
            ("vehicle-crime", "Vehicle crime", 1.5, False, True),
            ("violent-crime", "Violence and sexual offences", 3.5, True, False),
            ("other-crime", "Other crime", 1.0, False, False),
        ]

        for cat_id, name, weight, is_personal, is_property in categories:
            existing = self.repo.get_category(cat_id)
            if not existing:
                self.repo.create_category(
                    id=cat_id,
                    name=name,
                    harm_weight=weight,
                    is_personal=is_personal,
                    is_property=is_property,
                )
                logger.info(f"Created category: {name}")

        logger.info("Crime categories seeded")
