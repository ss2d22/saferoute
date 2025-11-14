#!/usr/bin/env python3
"""
Ingest Southampton crime data for the last 12 months from UK Police API.

Usage:
    python scripts/ingest_crime_data.py [--months 12]
"""
import argparse
import asyncio
import sys
from datetime import datetime, timedelta
from typing import List

import httpx
from sqlalchemy import text

# Add parent directory to path to import app modules
sys.path.insert(0, '/app')

from app.config import get_settings
from app.db.base import SessionLocal

settings = get_settings()


async def fetch_crime_data_for_month(
    client: httpx.AsyncClient,
    bbox: List[float],
    year_month: str
) -> List[dict]:
    """
    Fetch crime data for a specific month from UK Police API.

    Args:
        client: HTTP client
        bbox: Bounding box [min_lat, min_lon, max_lat, max_lon]
        year_month: Date in format YYYY-MM

    Returns:
        List of crime records
    """
    # UK Police API expects poly parameter as lat,lon pairs
    # Create a simple rectangle
    min_lat, min_lon, max_lat, max_lon = bbox

    poly = f"{min_lat},{min_lon}:{max_lat},{min_lon}:{max_lat},{max_lon}:{min_lat},{max_lon}"

    url = f"{settings.POLICE_API_BASE_URL}/crimes-street/all-crime"
    params = {
        "poly": poly,
        "date": year_month
    }

    try:
        response = await client.get(url, params=params, timeout=30.0)
        response.raise_for_status()
        return response.json()
    except httpx.HTTPError as e:
        print(f"  ✗ HTTP error fetching data for {year_month}: {e}")
        return []
    except Exception as e:
        print(f"  ✗ Error fetching data for {year_month}: {e}")
        return []


def process_and_store_crimes(db, crimes: List[dict], year_month: str) -> int:
    """
    Process and store crimes in database.

    Args:
        db: Database session
        crimes: List of crime records from API
        year_month: Date string for this batch

    Returns:
        Number of crimes stored
    """
    if not crimes:
        return 0

    stored = 0

    for crime in crimes:
        try:
            # Extract data
            crime_id = crime.get('id')
            if not crime_id:
                continue

            category = crime.get('category', 'unknown')
            location = crime.get('location', {})
            latitude = location.get('latitude')
            longitude = location.get('longitude')
            street_name = location.get('street', {}).get('name', 'Unknown')
            month = crime.get('month', year_month)

            if not latitude or not longitude:
                continue

            # Check if crime already exists
            exists = db.execute(
                text("SELECT 1 FROM crimes WHERE crime_id = :crime_id"),
                {"crime_id": crime_id}
            ).first()

            if exists:
                continue

            # Insert crime
            db.execute(
                text("""
                    INSERT INTO crimes (
                        crime_id, category, latitude, longitude,
                        street_name, month, location_point, created_at
                    ) VALUES (
                        :crime_id, :category, :latitude, :longitude,
                        :street_name, :month,
                        ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326),
                        NOW()
                    )
                    ON CONFLICT (crime_id) DO NOTHING
                """),
                {
                    "crime_id": crime_id,
                    "category": category,
                    "latitude": float(latitude),
                    "longitude": float(longitude),
                    "street_name": street_name,
                    "month": month
                }
            )

            stored += 1

        except Exception as e:
            print(f"  ⚠ Error processing crime {crime.get('id')}: {e}")
            continue

    db.commit()
    return stored


async def ingest_last_n_months(months: int = 12):
    """
    Ingest crime data for the last N months.

    Args:
        months: Number of months to ingest (default: 12)
    """
    print("=" * 70)
    print(f"SafeRoute Crime Data Ingestion")
    print(f"Fetching data for last {months} months")
    print("=" * 70)

    # Parse Southampton bounding box
    try:
        bbox = [float(x.strip()) for x in settings.SOUTHAMPTON_BBOX.split(',')]
        if len(bbox) != 4:
            raise ValueError("SOUTHAMPTON_BBOX must have 4 values")
    except Exception as e:
        print(f"✗ Invalid SOUTHAMPTON_BBOX: {e}")
        sys.exit(1)

    print(f"\nBounding box: {bbox}")
    print(f"  Min: ({bbox[0]}, {bbox[1]})")
    print(f"  Max: ({bbox[2]}, {bbox[3]})")

    # Calculate date range
    end_date = datetime.now()
    start_date = end_date - timedelta(days=30 * months)

    print(f"\nDate range: {start_date.strftime('%Y-%m')} to {end_date.strftime('%Y-%m')}")
    print()

    # Generate list of months
    months_to_fetch = []
    current_date = start_date.replace(day=1)
    while current_date <= end_date:
        months_to_fetch.append(current_date.strftime('%Y-%m'))
        # Move to next month
        if current_date.month == 12:
            current_date = current_date.replace(year=current_date.year + 1, month=1)
        else:
            current_date = current_date.replace(month=current_date.month + 1)

    total_crimes = 0
    successful_months = 0

    # Connect to database
    db = SessionLocal()

    try:
        # Verify database connection
        db.execute(text("SELECT 1"))
        print("✓ Database connection successful\n")
    except Exception as e:
        print(f"✗ Database connection failed: {e}")
        sys.exit(1)

    # Fetch data for each month
    async with httpx.AsyncClient() as client:
        for i, year_month in enumerate(months_to_fetch, 1):
            print(f"[{i}/{len(months_to_fetch)}] Processing {year_month}...")

            # Fetch data
            crimes = await fetch_crime_data_for_month(client, bbox, year_month)

            if crimes:
                # Store in database
                stored = process_and_store_crimes(db, crimes, year_month)
                total_crimes += stored
                successful_months += 1
                print(f"  ✓ Stored {stored} crimes (fetched {len(crimes)})")
            else:
                print(f"  ⚠ No crimes found")

            # Rate limiting - be nice to the API
            if i < len(months_to_fetch):
                await asyncio.sleep(1)

    db.close()

    # Summary
    print()
    print("=" * 70)
    print(f"Ingestion Complete!")
    print(f"  Months processed: {successful_months}/{len(months_to_fetch)}")
    print(f"  Total crimes stored: {total_crimes}")
    print("=" * 70)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Ingest Southampton crime data from UK Police API"
    )
    parser.add_argument(
        '--months',
        type=int,
        default=12,
        help='Number of months to ingest (default: 12)'
    )

    args = parser.parse_args()

    if args.months < 1 or args.months > 24:
        print("Error: --months must be between 1 and 24")
        sys.exit(1)

    # Run async function
    asyncio.run(ingest_last_n_months(args.months))


if __name__ == "__main__":
    main()
