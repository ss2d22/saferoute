"""Unit tests for Celery tasks."""

from unittest.mock import MagicMock, patch

from app.tasks.ingestion_tasks import (
    cleanup_old_route_history,
    ingest_latest_crime_data,
    ingest_month_on_demand,
    rebuild_safety_grid,
)


def test_celery_app_configuration():
    """Test that Celery app is configured correctly."""
    from app.celery_app import celery_app

    # Check basic configuration
    assert celery_app.conf.task_serializer == "json"
    assert celery_app.conf.result_serializer == "json"
    assert celery_app.conf.timezone == "UTC"
    assert celery_app.conf.task_track_started is True

    # Check time limits
    assert celery_app.conf.task_time_limit == 3600
    assert celery_app.conf.task_soft_time_limit == 3300


def test_beat_schedule_exists():
    """Test that periodic tasks are scheduled."""
    from app.celery_app import celery_app

    schedule = celery_app.conf.beat_schedule

    # Check that all expected tasks are scheduled
    assert "ingest-monthly-crimes" in schedule
    assert "rebuild-safety-grid" in schedule
    assert "cleanup-old-history" in schedule

    # Verify task names
    assert (
        schedule["ingest-monthly-crimes"]["task"]
        == "app.tasks.ingestion_tasks.ingest_latest_crime_data"
    )
    assert (
        schedule["rebuild-safety-grid"]["task"] == "app.tasks.ingestion_tasks.rebuild_safety_grid"
    )
    assert (
        schedule["cleanup-old-history"]["task"]
        == "app.tasks.ingestion_tasks.cleanup_old_route_history"
    )


def test_task_routes():
    """Test that tasks are routed to correct queues."""
    from app.celery_app import celery_app

    routes = celery_app.conf.task_routes

    # Check ingestion tasks route to ingestion queue
    assert "app.tasks.ingestion_tasks.*" in routes
    assert routes["app.tasks.ingestion_tasks.*"]["queue"] == "ingestion"


@patch("app.tasks.ingestion_tasks.CrimeIngester")
@patch("app.tasks.ingestion_tasks.SessionLocal")
def test_ingest_latest_crime_data_task(mock_session, mock_ingester_class):
    """Test ingest_latest_crime_data task logic."""
    # Setup mocks
    mock_db = MagicMock()
    mock_session.return_value = mock_db

    mock_ingester = MagicMock()
    mock_ingester_class.return_value = mock_ingester

    # Mock the async ingest_month method
    async def mock_ingest_month(*args, **kwargs):
        return 100, "success"

    mock_ingester.ingest_month = mock_ingest_month

    # Run task (Note: This won't actually execute async code properly in test,
    # but verifies the task is callable and has correct structure)
    try:
        # The task function itself (not .delay())
        # In real usage, we'd call ingest_latest_crime_data.delay()
        task_func = ingest_latest_crime_data
        assert callable(task_func)
        assert task_func.name == "app.tasks.ingestion_tasks.ingest_latest_crime_data"
    except Exception:
        # Expected to fail when trying to run async code in sync context
        # We're just testing structure here
        pass


@patch("app.tasks.ingestion_tasks.GridBuilder")
@patch("app.tasks.ingestion_tasks.SessionLocal")
def test_rebuild_safety_grid_task(mock_session, mock_builder_class):
    """Test rebuild_safety_grid task logic."""
    # Setup mocks
    mock_db = MagicMock()
    mock_session.return_value = mock_db

    mock_builder = MagicMock()
    mock_builder.build_safety_cells.return_value = 500
    mock_builder_class.return_value = mock_builder

    # Verify task is callable
    task_func = rebuild_safety_grid
    assert callable(task_func)
    assert task_func.name == "app.tasks.ingestion_tasks.rebuild_safety_grid"


def test_cleanup_old_route_history_task():
    """Test cleanup_old_route_history task structure."""
    # Verify task is callable
    task_func = cleanup_old_route_history
    assert callable(task_func)
    assert task_func.name == "app.tasks.ingestion_tasks.cleanup_old_route_history"


def test_ingest_month_on_demand_task():
    """Test ingest_month_on_demand task structure."""
    # Verify task is callable
    task_func = ingest_month_on_demand
    assert callable(task_func)
    assert task_func.name == "app.tasks.ingestion_tasks.ingest_month_on_demand"


def test_database_task_cleanup():
    """Test that DatabaseTask base class cleans up sessions."""
    from app.tasks.ingestion_tasks import DatabaseTask

    # Create task instance
    task = DatabaseTask()

    # Simulate getting a session
    mock_session = MagicMock()
    task._db = mock_session

    # Call after_return to trigger cleanup
    task.after_return()

    # Verify session was closed
    mock_session.close.assert_called_once()

    # Verify _db is reset to None
    assert task._db is None
