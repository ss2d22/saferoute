"""SafeRoute Celery Application Configuration.

This module configures the Celery distributed task queue for SafeRoute's
background processing tasks including:
- Monthly crime data ingestion from UK Police API
- H3 hexagonal safety grid rebuilding
- Route history cleanup and maintenance

The tasks are scheduled using Celery Beat and executed by Celery workers
with Redis as the message broker and result backend.

Author: Sriram Sundar
Email: ss2d22@soton.ac.uk
Repository: https://github.com/ss2d22/saferoute
"""

import logging

from celery import Celery
from celery.schedules import crontab

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Initialize Celery application
celery_app = Celery(
    "saferoute",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks.ingestion_tasks"],
)

# Configure Celery
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,  # 1 hour max per task
    task_soft_time_limit=3300,  # 55 minutes soft limit
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=50,
)

# Periodic task schedule
celery_app.conf.beat_schedule = {
    "ingest-monthly-crimes": {
        "task": "app.tasks.ingestion_tasks.ingest_latest_crime_data",
        "schedule": crontab(day_of_month="2", hour="2", minute="0"),  # 2nd of each month at 2 AM
        "options": {"queue": "ingestion"},
    },
    "rebuild-safety-grid": {
        "task": "app.tasks.ingestion_tasks.rebuild_safety_grid",
        "schedule": crontab(day_of_month="3", hour="3", minute="0"),  # 3rd of each month at 3 AM
        "options": {"queue": "ingestion"},
    },
    "cleanup-old-history": {
        "task": "app.tasks.ingestion_tasks.cleanup_old_route_history",
        "schedule": crontab(day_of_week="0", hour="4", minute="0"),  # Every Sunday at 4 AM
        "options": {"queue": "maintenance"},
    },
}

# Queue routing
celery_app.conf.task_routes = {
    "app.tasks.ingestion_tasks.*": {"queue": "ingestion"},
}

logger.info("Celery app configured successfully")
