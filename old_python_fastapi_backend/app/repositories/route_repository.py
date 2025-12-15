"""Route history repository."""

import uuid
from datetime import date, datetime, timedelta
from typing import List, Optional, Tuple

from sqlalchemy import and_, desc, or_
from sqlalchemy.orm import Session

from app.models.route import RouteHistory


class RouteRepository:
    """Route history data access layer."""

    def __init__(self, db: Session):
        self.db = db

    def create_history(
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
        """Create a route history entry."""
        dialect_name = self.db.bind.dialect.name

        if dialect_name == "sqlite":
            # For SQLite: Use raw SQL to bypass GeoAlchemy2's GeomFromEWKT() wrapper
            import json
            from datetime import datetime

            from sqlalchemy import text

            history_id = str(uuid.uuid4()).replace("-", "")
            now = datetime.utcnow()

            self.db.execute(
                text(
                    """
                    INSERT INTO route_history (
                        id, user_id, created_at, origin_lat, origin_lng,
                        destination_lat, destination_lng, mode, safety_score_best,
                        distance_m_best, duration_s_best, request_meta, route_geom, deleted_at
                    ) VALUES (
                        :id, :user_id, :created_at, :origin_lat, :origin_lng,
                        :destination_lat, :destination_lng, :mode, :safety_score_best,
                        :distance_m_best, :duration_s_best, :request_meta, :route_geom, :deleted_at
                    )
                """
                ),
                {
                    "id": history_id,
                    "user_id": str(user_id).replace("-", ""),
                    "created_at": now,
                    "origin_lat": origin_lat,
                    "origin_lng": origin_lng,
                    "destination_lat": destination_lat,
                    "destination_lng": destination_lng,
                    "mode": mode,
                    "safety_score_best": safety_score_best,
                    "distance_m_best": distance_m_best,
                    "duration_s_best": duration_s_best,
                    "request_meta": json.dumps(request_meta),
                    "route_geom": route_geom,  # Store as plain string
                    "deleted_at": None,
                },
            )
            self.db.commit()

            # For SQLite: Don't fetch back (would trigger AsEWKB() on geometry column)
            # Instead, construct a RouteHistory object manually
            history = RouteHistory()
            history.id = uuid.UUID(history_id)
            history.user_id = user_id
            history.created_at = now
            history.origin_lat = origin_lat
            history.origin_lng = origin_lng
            history.destination_lat = destination_lat
            history.destination_lng = destination_lng
            history.mode = mode
            history.safety_score_best = safety_score_best
            history.distance_m_best = distance_m_best
            history.duration_s_best = duration_s_best
            history.request_meta = request_meta
            history.route_geom = route_geom
            history.deleted_at = None
            return history
        else:
            # For PostgreSQL/PostGIS: Use ORM with WKTElement
            geom_value = None
            if route_geom:
                from geoalchemy2 import WKTElement

                # Remove SRID prefix if present (WKTElement handles SRID separately)
                wkt_str = route_geom
                srid = 4326  # default
                if route_geom.startswith("SRID="):
                    parts = route_geom.split(";", 1)
                    srid = int(parts[0].replace("SRID=", ""))
                    wkt_str = parts[1]
                geom_value = WKTElement(wkt_str, srid=srid)

            history = RouteHistory(
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
                route_geom=geom_value,
            )
            self.db.add(history)
            self.db.commit()
            self.db.refresh(history)
            return history

    def get_user_history(
        self,
        user_id: uuid.UUID,
        limit: int = 20,
        offset: int = 0,
        mode: Optional[str] = None,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None,
    ) -> Tuple[List[RouteHistory], int]:
        """Get user's route history with pagination.

        Returns:
            Tuple of (history_list, total_count)
        """
        from sqlalchemy.orm import defer

        # For SQLite: defer loading route_geom to avoid AsEWKB() function call
        dialect_name = self.db.bind.dialect.name
        query_base = self.db.query(RouteHistory)
        if dialect_name == "sqlite":
            query_base = query_base.options(defer(RouteHistory.route_geom))

        query = query_base.filter(
            and_(
                RouteHistory.user_id == user_id,
                RouteHistory.deleted_at.is_(None),
            )
        )

        if mode:
            query = query.filter(RouteHistory.mode == mode)
        if from_date:
            query = query.filter(RouteHistory.created_at >= from_date)
        if to_date:
            query = query.filter(RouteHistory.created_at <= to_date)

        total = query.count()

        history = query.order_by(desc(RouteHistory.created_at)).limit(limit).offset(offset).all()

        return history, total

    def get_history_by_id(
        self, history_id: uuid.UUID, user_id: uuid.UUID
    ) -> Optional[RouteHistory]:
        """Get a specific history item for a user."""
        from sqlalchemy.orm import defer

        # For SQLite: defer loading route_geom to avoid AsEWKB() function call
        dialect_name = self.db.bind.dialect.name
        query = self.db.query(RouteHistory)
        if dialect_name == "sqlite":
            query = query.options(defer(RouteHistory.route_geom))

        return query.filter(
            and_(
                RouteHistory.id == history_id,
                RouteHistory.user_id == user_id,
                RouteHistory.deleted_at.is_(None),
            )
        ).first()

    def delete_history_item(self, history_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        """Soft delete a single history item."""
        history = self.get_history_by_id(history_id, user_id)
        if history:
            history.deleted_at = datetime.utcnow()
            self.db.commit()
            return True
        return False

    def delete_all_user_history(self, user_id: uuid.UUID) -> int:
        """Soft delete all history for a user.

        Returns:
            Number of items deleted
        """
        count = (
            self.db.query(RouteHistory)
            .filter(
                and_(
                    RouteHistory.user_id == user_id,
                    RouteHistory.deleted_at.is_(None),
                )
            )
            .update({"deleted_at": datetime.utcnow()})
        )
        self.db.commit()
        return count

    def hard_delete_old_records(self, days: int = 365) -> int:
        """Hard delete records older than specified days.

        Returns:
            Number of records deleted
        """
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        count = (
            self.db.query(RouteHistory)
            .filter(
                or_(
                    RouteHistory.deleted_at < cutoff_date,
                    and_(
                        RouteHistory.deleted_at.is_(None),
                        RouteHistory.created_at < cutoff_date,
                    ),
                )
            )
            .delete()
        )
        self.db.commit()
        return count
