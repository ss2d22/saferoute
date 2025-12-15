"""User endpoints."""

import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.exceptions import SafeRouteException
from app.db.base import get_db
from app.dependencies import get_current_active_user
from app.models.user import User
from app.schemas.history import DeleteHistoryResponse, HistoryListResponse, RouteHistoryItem
from app.schemas.user import DeleteAccountRequest, UserSettings, UserSettingsUpdate
from app.services.history_service import HistoryService
from app.services.user_service import UserService

router = APIRouter()


@router.get("/me/history", response_model=HistoryListResponse)
async def get_user_history(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    mode: Optional[str] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get user's route history with pagination and filters."""
    try:
        history_service = HistoryService(db)
        history_list, total = history_service.get_user_history(
            user_id=current_user.id,
            limit=limit,
            offset=offset,
            mode=mode,
            from_date=from_date,
            to_date=to_date,
        )

        items = [
            RouteHistoryItem(
                id=str(h.id),
                created_at=h.created_at,
                origin={"lat": h.origin_lat, "lng": h.origin_lng},
                destination={"lat": h.destination_lat, "lng": h.destination_lng},
                mode=h.mode,
                safety_score_best=float(h.safety_score_best) if h.safety_score_best else None,
                distance_m_best=h.distance_m_best,
                duration_s_best=h.duration_s_best,
            )
            for h in history_list
        ]

        return HistoryListResponse(
            items=items,
            total=total,
            limit=limit,
            offset=offset,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching history: {str(e)}",
        )


@router.delete("/me/history", response_model=DeleteHistoryResponse)
async def delete_user_history(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Delete all user history."""
    try:
        history_service = HistoryService(db)
        count = history_service.delete_all_history(current_user.id)

        return DeleteHistoryResponse(
            message="History deleted successfully",
            deleted_count=count,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting history: {str(e)}",
        )


@router.delete("/me/history/{history_id}")
async def delete_history_item(
    history_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Delete a single history item."""
    try:
        history_service = HistoryService(db)
        history_service.delete_history_item(
            history_id=uuid.UUID(history_id),
            user_id=current_user.id,
        )

        return {"message": "History item deleted"}
    except SafeRouteException as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid history ID format",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting history item: {str(e)}",
        )


@router.get("/me/settings", response_model=UserSettings)
async def get_user_settings(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get user settings."""
    try:
        user_service = UserService(db)
        settings = user_service.get_user_settings(current_user.id)

        return UserSettings(**settings)
    except SafeRouteException as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.patch("/me/settings", response_model=UserSettings)
async def update_user_settings(
    settings_update: UserSettingsUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Update user settings."""
    try:
        user_service = UserService(db)

        # Build update dict from non-None values
        update_dict = {}
        if settings_update.history_enabled is not None:
            update_dict["history_enabled"] = settings_update.history_enabled
        if settings_update.history_retention_days is not None:
            update_dict["history_retention_days"] = settings_update.history_retention_days
        if settings_update.default_safety_weight is not None:
            update_dict["default_safety_weight"] = settings_update.default_safety_weight
        if settings_update.default_mode is not None:
            update_dict["default_mode"] = settings_update.default_mode

        updated_settings = user_service.update_user_settings(current_user.id, update_dict)

        return UserSettings(**updated_settings)
    except SafeRouteException as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.delete("/me")
async def delete_user_account(
    request: DeleteAccountRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Delete user account (requires password confirmation)."""
    try:
        user_service = UserService(db)
        user_service.delete_user_account(current_user.id, request.password)

        return {"message": "Account deleted successfully"}
    except SafeRouteException as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
