"""Admin endpoints for manual task triggering."""

from typing import Dict

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.tasks.ingestion_tasks import (
    cleanup_old_route_history,
    ingest_latest_crime_data,
    ingest_month_on_demand,
    rebuild_safety_grid,
)

router = APIRouter()


class TaskResponse(BaseModel):
    """Response for task submission."""

    task_id: str
    task_name: str
    status: str
    message: str


class IngestMonthRequest(BaseModel):
    """Request to ingest a specific month."""

    year: int = Field(..., ge=2010, le=2030, description="Year (2010-2030)")
    month: int = Field(..., ge=1, le=12, description="Month (1-12)")


@router.post(
    "/tasks/ingest-latest",
    response_model=TaskResponse,
    summary="Trigger latest crime data ingestion",
    description="""
    Manually trigger ingestion of the latest available crime data from UK Police API.

    **What it does:**
    - Fetches crime data for all forces and areas for the latest month
    - Stores crime records in the database
    - Invalidates safety snapshot cache to ensure fresh data
    - Runs as a background Celery task

    **Scheduled Task:**
    This task runs automatically on the 2nd of each month at 2:00 AM UTC.

    **Typical Duration:** 10-30 minutes depending on data volume
    """,
    tags=["admin", "tasks"],
)
async def trigger_ingest_latest():
    """Manually trigger ingestion of latest crime data from UK Police API.

    This endpoint submits a background task to fetch the most recent month of
    crime data. The task runs asynchronously via Celery.

    Use the task ID with `GET /admin/tasks/{task_id}` to monitor progress.
    """
    try:
        # Submit task to Celery
        task = ingest_latest_crime_data.delay()

        return TaskResponse(
            task_id=task.id,
            task_name="ingest_latest_crime_data",
            status="submitted",
            message="Crime data ingestion task submitted successfully",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to submit ingestion task: {str(e)}",
        )


@router.post("/tasks/ingest-month", response_model=TaskResponse)
async def trigger_ingest_month(request: IngestMonthRequest):
    """Manually trigger ingestion for a specific month.

    This endpoint allows admins to ingest historical crime data for a
    specific month.

    Args:
        request: Month and year to ingest

    Returns:
        TaskResponse with task ID and status
    """
    try:
        # Submit task to Celery
        task = ingest_month_on_demand.delay(year=request.year, month=request.month)

        return TaskResponse(
            task_id=task.id,
            task_name="ingest_month_on_demand",
            status="submitted",
            message=f"Ingestion task for {request.year}-{request.month:02d} submitted successfully",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to submit ingestion task: {str(e)}",
        )


@router.post("/tasks/rebuild-grid", response_model=TaskResponse)
async def trigger_rebuild_grid(months: int = 12):
    """Manually trigger safety grid rebuild.

    This endpoint allows admins to rebuild the safety cell grid from
    existing crime data.

    Args:
        months: Number of months of data to process (default: 12)

    Returns:
        TaskResponse with task ID and status
    """
    try:
        if months < 1 or months > 24:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Months must be between 1 and 24",
            )

        # Submit task to Celery
        task = rebuild_safety_grid.delay(months=months)

        return TaskResponse(
            task_id=task.id,
            task_name="rebuild_safety_grid",
            status="submitted",
            message=f"Grid rebuild task submitted for {months} months of data",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to submit grid rebuild task: {str(e)}",
        )


@router.post("/tasks/cleanup-history", response_model=TaskResponse)
async def trigger_cleanup_history(retention_days: int = 90):
    """Manually trigger route history cleanup.

    This endpoint allows admins to clean up old route history records.

    Args:
        retention_days: Number of days to retain (default: 90)

    Returns:
        TaskResponse with task ID and status
    """
    try:
        if retention_days < 1 or retention_days > 365:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Retention days must be between 1 and 365",
            )

        # Submit task to Celery
        task = cleanup_old_route_history.delay(retention_days=retention_days)

        return TaskResponse(
            task_id=task.id,
            task_name="cleanup_old_route_history",
            status="submitted",
            message=f"History cleanup task submitted (retention: {retention_days} days)",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to submit cleanup task: {str(e)}",
        )


@router.get("/tasks/{task_id}")
async def get_task_status(task_id: str) -> Dict:
    """Get the status of a background task.

    Args:
        task_id: Celery task ID

    Returns:
        Task status information
    """
    try:
        from celery.result import AsyncResult

        from app.celery_app import celery_app

        task_result = AsyncResult(task_id, app=celery_app)

        response = {
            "task_id": task_id,
            "status": task_result.state,
            "ready": task_result.ready(),
            "successful": task_result.successful() if task_result.ready() else None,
        }

        if task_result.ready():
            if task_result.successful():
                response["result"] = task_result.result
            elif task_result.failed():
                response["error"] = str(task_result.info)

        return response

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve task status: {str(e)}",
        )
