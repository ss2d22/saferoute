"""CLI commands for crime data ingestion."""

import argparse
import asyncio
import logging
import sys
from datetime import date, datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import get_settings
from app.ingestion.crime_ingester import CrimeIngester
from app.ingestion.grid_builder import GridBuilder

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

settings = get_settings()

# Create database session
engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


async def ingest_crimes(area: str, month_str: str):
    """Ingest crimes for a specific area and month.

    Args:
        area: Area name (e.g., "southampton")
        month_str: Month in YYYY-MM format
    """
    try:
        # Parse month
        month_date = datetime.strptime(month_str, "%Y-%m").date()

        logger.info(f"Starting crime ingestion for {area}, {month_str}")

        # Create DB session
        db = SessionLocal()
        try:
            ingester = CrimeIngester(db)

            # Seed categories first
            ingester.seed_crime_categories()

            # Ingest crimes
            records, status = await ingester.ingest_month(area, month_date)

            logger.info(f"Ingestion complete: {records} records, status: {status}")

            if status == "failed":
                sys.exit(1)

        finally:
            db.close()

    except Exception as e:
        logger.error(f"Error during ingestion: {str(e)}")
        sys.exit(1)


def build_grid(area: str, months: int):
    """Build safety grid for an area.

    Args:
        area: Area name (e.g., "southampton")
        months: Number of months to process
    """
    try:
        logger.info(f"Building safety grid for {area}, last {months} months")

        # Create DB session
        db = SessionLocal()
        try:
            builder = GridBuilder(db)
            cells_created = builder.build_safety_cells(months)

            logger.info(f"Grid building complete: {cells_created} cells created/updated")

        finally:
            db.close()

    except Exception as e:
        logger.error(f"Error building grid: {str(e)}")
        sys.exit(1)


async def full_pipeline(area: str):
    """Run full ingestion pipeline: ingest recent months + build grid.

    Args:
        area: Area name (e.g., "southampton")
    """
    try:
        logger.info(f"Running full pipeline for {area}")

        # Ingest last 3 months of crime data
        current_date = date.today()
        for i in range(3, 0, -1):
            # Calculate month (i months ago)
            month_date = current_date.replace(day=1)
            for _ in range(i):
                # Go back one month
                month_date = (month_date.replace(day=1) - timedelta(days=1)).replace(day=1)

            month_str = month_date.strftime("%Y-%m")
            logger.info(f"Ingesting {month_str}...")

            await ingest_crimes(area, month_str)

        # Build grid
        logger.info("Building safety grid...")
        build_grid(area, months=12)

        logger.info("Full pipeline complete")

    except Exception as e:
        logger.error(f"Error in full pipeline: {str(e)}")
        sys.exit(1)


def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(description="SafeRoute Crime Data Ingestion CLI")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # ingest-crimes command
    ingest_parser = subparsers.add_parser(
        "ingest-crimes", help="Ingest crime data for a specific month"
    )
    ingest_parser.add_argument("--area", required=True, help="Area name")
    ingest_parser.add_argument("--month", required=True, help="Month (YYYY-MM)")

    # build-grid command
    grid_parser = subparsers.add_parser("build-grid", help="Build safety grid")
    grid_parser.add_argument("--area", required=True, help="Area name")
    grid_parser.add_argument("--months", type=int, required=True, help="Number of months")

    # full-pipeline command
    pipeline_parser = subparsers.add_parser("full-pipeline", help="Run full ingestion pipeline")
    pipeline_parser.add_argument("--area", required=True, help="Area name")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    try:
        if args.command == "ingest-crimes":
            asyncio.run(ingest_crimes(args.area, args.month))
        elif args.command == "build-grid":
            build_grid(args.area, args.months)
        elif args.command == "full-pipeline":
            asyncio.run(full_pipeline(args.area))
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
        sys.exit(0)


if __name__ == "__main__":
    main()
