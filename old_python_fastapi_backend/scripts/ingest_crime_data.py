#!/usr/bin/env python3
"""
Ingest Southampton crime data from UK Police API using Celery tasks.

Usage:
    python scripts/ingest_crime_data.py [--start-year 2024] [--start-month 6] [--end-year 2025] [--end-month 9]
    python scripts/ingest_crime_data.py --months 12  # Ingest last 12 months
"""
import argparse
import sys
from datetime import date
from dateutil.relativedelta import relativedelta

# Add parent directory to path to import app modules
sys.path.insert(0, '/app')

from app.tasks.ingestion_tasks import ingest_month_on_demand, rebuild_safety_grid


def ingest_date_range(start_year: int, start_month: int, end_year: int, end_month: int):
    """
    Ingest crime data for a specific date range.

    Args:
        start_year: Starting year (e.g., 2024)
        start_month: Starting month (1-12)
        end_year: Ending year (e.g., 2025)
        end_month: Ending month (1-12)
    """
    print("=" * 70)
    print("SafeRoute Crime Data Ingestion")
    print("=" * 70)

    # Generate list of months
    start_date = date(start_year, start_month, 1)
    end_date = date(end_year, end_month, 1)

    months_to_ingest = []
    current = start_date
    while current <= end_date:
        months_to_ingest.append((current.year, current.month))
        current = current + relativedelta(months=1)

    print(f"\nDate range: {start_date.strftime('%Y-%m')} to {end_date.strftime('%Y-%m')}")
    print(f"Total months: {len(months_to_ingest)}")
    print()

    # Track statistics
    successful = 0
    skipped = 0
    failed = 0
    total_records = 0

    # Ingest each month
    for i, (year, month) in enumerate(months_to_ingest, 1):
        month_str = f"{year}-{month:02d}"
        print(f"[{i}/{len(months_to_ingest)}] Processing {month_str}...", end=" ")

        try:
            result = ingest_month_on_demand.apply(args=[year, month])
            summary = result.get(timeout=120)

            status = summary['status']
            records = summary['records_ingested']

            if status == 'success':
                print(f"✓ {records} records")
                successful += 1
                total_records += records
            elif status == 'skipped':
                print("⊘ Already ingested")
                skipped += 1
            else:
                print(f"⚠ {status}")
                failed += 1

        except Exception as e:
            print(f"✗ Error: {str(e)[:60]}")
            failed += 1

    # Summary
    print()
    print("=" * 70)
    print("Ingestion Summary")
    print("=" * 70)
    print(f"Total months processed: {len(months_to_ingest)}")
    print(f"  ✓ Successful: {successful} ({total_records} records)")
    print(f"  ⊘ Skipped: {skipped}")
    print(f"  ✗ Failed: {failed}")
    print()

    # Build H3 safety grid if any data was ingested
    if successful > 0 or total_records > 0:
        print("=" * 70)
        print("Building H3 Safety Grid")
        print("=" * 70)

        try:
            # Calculate how many months of data to include
            # Use 12 months or the range we just ingested, whichever is larger
            months_for_grid = max(12, len(months_to_ingest))

            print(f"Building grid for last {months_for_grid} months...")
            result = rebuild_safety_grid.apply(args=[months_for_grid])
            grid_summary = result.get(timeout=300)

            print(f"\n✓ Grid built successfully!")
            print(f"  Cells created: {grid_summary['cells_created']}")
            print(f"  Grid type: {grid_summary['grid_type']}")
            print(f"  H3 resolution: {grid_summary['h3_resolution']}")
            print(f"  Cell size: ~{grid_summary['cell_size_m']}m edge")

            stats = grid_summary['statistics']
            print(f"\nStatistics:")
            print(f"  Unique cells: {stats['unique_cells']}")
            print(f"  Total crimes: {stats['total_crimes']}")
            print(f"  Avg crimes/cell: {stats['avg_crimes_per_cell']}")
            print(f"  Max crimes/cell: {stats['max_crimes_per_cell']}")

        except Exception as e:
            print(f"\n✗ Error building grid: {str(e)}")
            print("You can manually rebuild the grid later with:")
            print(f"  docker exec <container> python -c \"from app.tasks.ingestion_tasks import rebuild_safety_grid; rebuild_safety_grid.apply(args=[12])\"")

    print()
    print("=" * 70)
    print("Complete!")
    print("=" * 70)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Ingest Southampton crime data from UK Police API using Celery tasks"
    )

    # Option 1: Specify date range
    parser.add_argument(
        '--start-year',
        type=int,
        help='Starting year (e.g., 2024)'
    )
    parser.add_argument(
        '--start-month',
        type=int,
        help='Starting month (1-12)'
    )
    parser.add_argument(
        '--end-year',
        type=int,
        help='Ending year (e.g., 2025)'
    )
    parser.add_argument(
        '--end-month',
        type=int,
        help='Ending month (1-12)'
    )

    # Option 2: Ingest last N months
    parser.add_argument(
        '--months',
        type=int,
        help='Number of months to ingest from today backwards (e.g., 12)'
    )

    args = parser.parse_args()

    # Validate arguments
    if args.months:
        # Ingest last N months
        if args.months < 1 or args.months > 48:
            print("Error: --months must be between 1 and 48")
            sys.exit(1)

        end_date = date.today()
        start_date = end_date - relativedelta(months=args.months)

        ingest_date_range(
            start_date.year,
            start_date.month,
            end_date.year,
            end_date.month
        )

    elif args.start_year and args.start_month and args.end_year and args.end_month:
        # Ingest specific date range
        if not (1 <= args.start_month <= 12):
            print("Error: --start-month must be between 1 and 12")
            sys.exit(1)
        if not (1 <= args.end_month <= 12):
            print("Error: --end-month must be between 1 and 12")
            sys.exit(1)

        start_date = date(args.start_year, args.start_month, 1)
        end_date = date(args.end_year, args.end_month, 1)

        if start_date > end_date:
            print("Error: start date must be before or equal to end date")
            sys.exit(1)

        ingest_date_range(
            args.start_year,
            args.start_month,
            args.end_year,
            args.end_month
        )

    else:
        # Default: ingest last 12 months
        print("No arguments provided, ingesting last 12 months by default")
        print("Use --help to see all options\n")

        end_date = date.today()
        start_date = end_date - relativedelta(months=12)

        ingest_date_range(
            start_date.year,
            start_date.month,
            end_date.year,
            end_date.month
        )


if __name__ == "__main__":
    main()
