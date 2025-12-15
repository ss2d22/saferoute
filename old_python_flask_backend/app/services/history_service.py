"""Route history service."""

import uuid
from datetime import date
from typing import List, Optional, Tuple

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.models.route import RouteHistory
from app.repositories.route_repository import RouteRepository


class HistoryService:
    """Manages user route history."""

    def __init__(self, db: Session):
        self.db = db
        self.repo = RouteRepository(db)

    def save_route_history(
        self,
        user_id: uuid.UUID,
        origin_lat: float,
        origin_lng: float,
        destination_lat: float,
        destination_lng: float,
        mode: str,
        safety_score_best: float,
        distance_m_best: int,
        duration_s_best: int,
        request_meta: dict,
        route_geom: Optional[str] = None,
    ) -> RouteHistory:
        """Save a route to user's history."""
        return self.repo.create_history(
            user_id=user_id,
            origin_lat=origin_lat,
            origin_lng=origin_lng,
            destination_lat=destination_lat,
            destination_lng=destination_lng,
            mode=mode,
            safety_score_best=safety_score_best,
            distance_m_best=distance_m_best,
            duration_s_best=duration_s_best,
            request_meta=request_meta,
            route_geom=route_geom,
        )

    def get_user_history(
        self,
        user_id: uuid.UUID,
        limit: int = 20,
        offset: int = 0,
        mode: Optional[str] = None,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None,
    ) -> Tuple[List[RouteHistory], int]:
        """Get user's route history with filters."""
        return self.repo.get_user_history(
            user_id=user_id,
            limit=limit,
            offset=offset,
            mode=mode,
            from_date=from_date,
            to_date=to_date,
        )

    def delete_history_item(self, history_id: uuid.UUID, user_id: uuid.UUID) -> None:
        """Delete a single history item.

        Raises:
            NotFoundError: If item not found
        """
        success = self.repo.delete_history_item(history_id, user_id)
        if not success:
            raise NotFoundError("History item not found")

    def delete_all_history(self, user_id: uuid.UUID) -> int:
        """Delete all history for a user.

        Returns:
            Number of items deleted
        """
        return self.repo.delete_all_user_history(user_id)
