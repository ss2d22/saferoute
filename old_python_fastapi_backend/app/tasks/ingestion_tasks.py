"""Celery tasks for crime data ingestion and H3 grid building.

This module contains background tasks for:
- Automated crime data ingestion from UK Police API
- H3 hexagonal safety grid building (Resolution 10: ~73m edge cells)
- Cache invalidation after data updates
- Route history maintenance

All tasks use H3 hexagonal indexing for spatial analysis.
"""

import logging
from datetime import date, datetime, timedelta

from celery import Task
from dateutil.relativedelta import relativedelta
from sqlalchemy.orm import Session

from app.celery_app import celery_app
from app.config import get_settings
from app.db.base import SessionLocal
from app.ingestion.crime_ingester import CrimeIngester
from app.ingestion.grid_builder import GridBuilder
from app.models import RouteHistory

logger = logging.getLogger(__name__)
settings = get_settings()


class DatabaseTask(Task):
    """Base task with database session management."""

    _db: Session = None

    @property
    def db(self) -> Session:
        """Get database session for this task."""
        if self._db is None:
            self._db = SessionLocal()
        return self._db

    def after_return(self, *args, **kwargs):
        """Clean up database session after task completes."""
        if self._db is not None:
            self._db.close()
            self._db = None


@celery_app.task(
    bind=True, base=DatabaseTask, name="app.tasks.ingestion_tasks.ingest_latest_crime_data"
)
def ingest_latest_crime_data(self):
    """Ingest the latest month of crime data from UK Police API.

    This task runs monthly to fetch and process the latest crime data.
    The UK Police API typically has a 1-2 month lag, so we check the
    previous month and 2 months ago.

    Returns:
        dict: Summary of ingestion results
    """
    logger.info("Starting automated crime data ingestion")

    try:
        # Get the current month
        current_month = date.today().replace(day=1)

        # UK Police API has a lag, so try previous month and 2 months ago
        months_to_try = [
            current_month - relativedelta(months=1),
            current_month - relativedelta(months=2),
        ]

        results = []
        total_ingested = 0

        for month in months_to_try:
            logger.info(f"Attempting to ingest data for {month.strftime('%Y-%m')}")

            ingester = CrimeIngester(self.db)

            # Run ingestion asynchronously
            import asyncio

            loop = asyncio.get_event_loop()
            if loop.is_closed():
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)

            records_ingested, status = loop.run_until_complete(
                ingester.ingest_month(
                    area_name="southampton-core",
                    month=month,
                    force_id="hampshire",
                )
            )

            results.append(
                {
                    "month": month.isoformat(),
                    "records_ingested": records_ingested,
                    "status": status,
                }
            )

            if status == "success":
                total_ingested += records_ingested
                logger.info(
                    f"Successfully ingested {records_ingested} crimes for {month.strftime('%Y-%m')}"
                )
                break  # Stop after first successful month
            elif status == "skipped":
                logger.info(f"Month {month.strftime('%Y-%m')} already ingested")
                break
            else:
                logger.warning(f"Ingestion failed for {month.strftime('%Y-%m')}: {status}")

        # Invalidate safety snapshot cache if data was ingested
        if total_ingested > 0:
            from app.services.cache_service import CacheService

            cache_service = CacheService()

            loop = asyncio.get_event_loop()
            if loop.is_closed():
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)

            invalidated = loop.run_until_complete(cache_service.invalidate_all_snapshots())
            logger.info(f"Invalidated {invalidated} safety snapshot caches after ingestion")

        summary = {
            "task": "ingest_latest_crime_data",
            "total_records": total_ingested,
            "results": results,
        }

        logger.info(f"Crime data ingestion completed: {summary}")
        return summary

    except Exception as e:
        logger.error(f"Error in crime data ingestion: {str(e)}", exc_info=True)
        raise


@celery_app.task(bind=True, base=DatabaseTask, name="app.tasks.ingestion_tasks.rebuild_safety_grid")
def rebuild_safety_grid(self, months: int = 12):
    """Rebuild H3 hexagonal safety grid from crime data.

    This task aggregates crime data into H3 hexagonal cells (Resolution 10: ~73m edge)
    for the specified number of months. Each cell contains:
    - Total crime count
    - Weighted crime count (using harm weights)
    - Crime breakdown by category
    - Spatial geometry (hexagonal polygon)

    The H3 system provides:
    - Uniform cell size (~13,781 m² hexagons)
    - Efficient spatial indexing
    - Hierarchical aggregation capabilities
    - Better coverage than square grids

    Args:
        months: Number of months of data to process (default: 12)

    Returns:
        dict: Summary with cells_created, months_processed, grid_resolution
    """
    logger.info(f"Starting H3 safety grid rebuild for last {months} months")
    logger.info(
        f"Grid configuration: Resolution {settings.H3_RESOLUTION}, "
        f"~{settings.GRID_CELL_SIZE_M}m edge, {settings.GRID_TYPE}"
    )

    try:
        builder = GridBuilder(self.db)

        # Build H3 hexagonal safety cells
        cells_created = builder.build_safety_cells(months=months)

        # Get grid statistics
        from sqlalchemy import text

        stats_query = text(
            """
            SELECT
                COUNT(DISTINCT cell_id) as unique_cells,
                COUNT(*) as total_cell_months,
                SUM(crime_count_total) as total_crimes,
                AVG(crime_count_total) as avg_crimes_per_cell,
                MAX(crime_count_total) as max_crimes_per_cell
            FROM safety_cells
            WHERE month >= :start_month
        """
        )

        from datetime import date

        start_month = date.today().replace(day=1) - timedelta(days=30 * months)

        result = self.db.execute(stats_query, {"start_month": start_month}).fetchone()

        # Invalidate safety snapshot cache after grid rebuild
        if cells_created > 0:
            from app.services.cache_service import CacheService

            cache_service = CacheService()

            import asyncio

            loop = asyncio.get_event_loop()
            if loop.is_closed():
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)

            invalidated = loop.run_until_complete(cache_service.invalidate_all_snapshots())
            logger.info(f"Invalidated {invalidated} safety snapshot caches after grid rebuild")

        summary = {
            "task": "rebuild_safety_grid",
            "months_processed": months,
            "cells_created": cells_created,
            "grid_type": settings.GRID_TYPE,
            "h3_resolution": settings.H3_RESOLUTION,
            "cell_size_m": settings.GRID_CELL_SIZE_M,
            "statistics": {
                "unique_cells": result.unique_cells if result else 0,
                "total_cell_months": result.total_cell_months if result else 0,
                "total_crimes": result.total_crimes if result else 0,
                "avg_crimes_per_cell": (
                    round(result.avg_crimes_per_cell, 2)
                    if result and result.avg_crimes_per_cell
                    else 0
                ),
                "max_crimes_per_cell": result.max_crimes_per_cell if result else 0,
            },
        }

        logger.info(f"H3 safety grid rebuild completed: {summary}")
        return summary

    except Exception as e:
        logger.error(f"Error in H3 safety grid rebuild: {str(e)}", exc_info=True)
        raise


@celery_app.task(
    bind=True, base=DatabaseTask, name="app.tasks.ingestion_tasks.cleanup_old_route_history"
)
def cleanup_old_route_history(self, retention_days: int = 90):
    """Clean up old route history records.

    Soft-deletes route history older than the retention period to keep
    the database size manageable.

    Args:
        retention_days: Number of days to retain history (default: 90)

    Returns:
        dict: Summary of cleanup results
    """
    logger.info(f"Starting route history cleanup (retention: {retention_days} days)")

    try:
        from datetime import datetime

        # Calculate cutoff date
        cutoff_date = datetime.utcnow() - timedelta(days=retention_days)

        # Soft-delete old records
        deleted_count = (
            self.db.query(RouteHistory)
            .filter(
                RouteHistory.created_at < cutoff_date,
                RouteHistory.deleted_at.is_(None),
            )
            .update({"deleted_at": datetime.utcnow()}, synchronize_session=False)
        )

        self.db.commit()

        summary = {
            "task": "cleanup_old_route_history",
            "retention_days": retention_days,
            "cutoff_date": cutoff_date.isoformat(),
            "records_deleted": deleted_count,
        }

        logger.info(f"Route history cleanup completed: {summary}")
        return summary

    except Exception as e:
        logger.error(f"Error in route history cleanup: {str(e)}", exc_info=True)
        self.db.rollback()
        raise


@celery_app.task(
    bind=True, base=DatabaseTask, name="app.tasks.ingestion_tasks.ingest_month_on_demand"
)
def ingest_month_on_demand(self, year: int, month: int):
    """Ingest crime data for a specific month on-demand.

    This task allows manual ingestion of historical data.

    Args:
        year: Year (e.g., 2024)
        month: Month (1-12)

    Returns:
        dict: Summary of ingestion results
    """
    logger.info(f"Starting on-demand ingestion for {year}-{month:02d}")

    try:
        target_month = date(year, month, 1)

        ingester = CrimeIngester(self.db)

        # Run ingestion asynchronously
        import asyncio

        loop = asyncio.get_event_loop()
        if loop.is_closed():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        records_ingested, status = loop.run_until_complete(
            ingester.ingest_month(
                area_name="southampton-core",
                month=target_month,
                force_id="hampshire",
            )
        )

        summary = {
            "task": "ingest_month_on_demand",
            "month": target_month.isoformat(),
            "records_ingested": records_ingested,
            "status": status,
        }

        logger.info(f"On-demand ingestion completed: {summary}")
        return summary

    except Exception as e:
        logger.error(f"Error in on-demand ingestion: {str(e)}", exc_info=True)
        raise


@celery_app.task(
    bind=True, base=DatabaseTask, name="app.tasks.ingestion_tasks.validate_h3_grid_health"
)
def validate_h3_grid_health(self):
    """Validate H3 grid health and data integrity.

    This task performs health checks on the H3 safety grid:
    - Checks for missing months
    - Validates H3 cell format
    - Identifies data gaps
    - Checks spatial coverage
    - Validates crime statistics

    Returns:
        dict: Health report with validation results
    """
    logger.info("Starting H3 grid health validation")

    try:
        from sqlalchemy import text

        # Check for valid H3 cell IDs
        h3_validation_query = text(
            """
            SELECT
                COUNT(*) as total_cells,
                COUNT(DISTINCT SUBSTRING(cell_id FROM 1 FOR 15)) as unique_h3_cells,
                COUNT(CASE WHEN LENGTH(cell_id) < 15 THEN 1 END) as invalid_cell_ids
            FROM safety_cells
        """
        )

        h3_result = self.db.execute(h3_validation_query).fetchone()

        # Check for monthly coverage
        coverage_query = text(
            """
            SELECT
                month,
                COUNT(DISTINCT cell_id) as cells_count,
                SUM(crime_count_total) as total_crimes
            FROM safety_cells
            WHERE month >= :start_month
            GROUP BY month
            ORDER BY month DESC
        """
        )

        from datetime import date

        start_month = date.today().replace(day=1) - timedelta(days=365)
        coverage_result = self.db.execute(coverage_query, {"start_month": start_month}).fetchall()

        # Check for data quality issues
        quality_query = text(
            """
            SELECT
                COUNT(*) as total_records,
                COUNT(CASE WHEN crime_count_total = 0 THEN 1 END) as zero_crime_cells,
                COUNT(CASE WHEN crime_count_weighted = 0 THEN 1 END) as zero_weighted_cells,
                COUNT(CASE WHEN stats IS NULL THEN 1 END) as null_stats,
                AVG(crime_count_total) as avg_crimes,
                MAX(crime_count_total) as max_crimes
            FROM safety_cells
            WHERE month >= :start_month
        """
        )

        quality_result = self.db.execute(quality_query, {"start_month": start_month}).fetchone()

        # Build health report
        monthly_coverage = [
            {"month": row.month.isoformat(), "cells": row.cells_count, "crimes": row.total_crimes}
            for row in coverage_result
        ]

        # Identify missing months
        from dateutil.relativedelta import relativedelta

        expected_months = []
        current = date.today().replace(day=1)
        for i in range(12):
            expected_months.append(current - relativedelta(months=i))

        existing_months = {row.month for row in coverage_result}
        missing_months = [m.isoformat() for m in expected_months if m not in existing_months]

        health_status = "healthy"
        issues = []

        if h3_result.invalid_cell_ids > 0:
            health_status = "degraded"
            issues.append(f"{h3_result.invalid_cell_ids} cells have invalid H3 IDs")

        if len(missing_months) > 0:
            health_status = "degraded"
            issues.append(f"{len(missing_months)} months missing data")

        if quality_result.zero_crime_cells > quality_result.total_records * 0.9:
            health_status = "warning"
            issues.append(
                f"High percentage of zero-crime cells ({quality_result.zero_crime_cells}/{quality_result.total_records})"
            )

        summary = {
            "task": "validate_h3_grid_health",
            "timestamp": datetime.utcnow().isoformat(),
            "health_status": health_status,
            "grid_info": {
                "resolution": settings.H3_RESOLUTION,
                "cell_size_m": settings.GRID_CELL_SIZE_M,
                "grid_type": settings.GRID_TYPE,
            },
            "h3_validation": {
                "total_cells": h3_result.total_cells,
                "unique_h3_cells": h3_result.unique_h3_cells,
                "invalid_cell_ids": h3_result.invalid_cell_ids,
            },
            "coverage": {
                "months_analyzed": len(coverage_result),
                "missing_months": missing_months,
                "monthly_breakdown": monthly_coverage[:3],  # Last 3 months
            },
            "data_quality": {
                "total_records": quality_result.total_records,
                "zero_crime_cells": quality_result.zero_crime_cells,
                "zero_weighted_cells": quality_result.zero_weighted_cells,
                "null_stats": quality_result.null_stats,
                "avg_crimes_per_cell": (
                    round(quality_result.avg_crimes, 2) if quality_result.avg_crimes else 0
                ),
                "max_crimes_per_cell": quality_result.max_crimes,
            },
            "issues": issues,
        }

        logger.info(
            f"H3 grid health validation completed: Status={health_status}, Issues={len(issues)}"
        )
        return summary

    except Exception as e:
        logger.error(f"Error in H3 grid health validation: {str(e)}", exc_info=True)
        raise
