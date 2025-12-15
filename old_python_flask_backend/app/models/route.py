"""Route history model."""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from geoalchemy2 import Geometry
from sqlalchemy import JSON, DateTime, Float, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RouteHistory(Base):
    """Route history model for storing user's route requests."""

    __tablename__ = "route_history"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )
    origin_lat: Mapped[float] = mapped_column(Float, nullable=False)
    origin_lng: Mapped[float] = mapped_column(Float, nullable=False)
    destination_lat: Mapped[float] = mapped_column(Float, nullable=False)
    destination_lng: Mapped[float] = mapped_column(Float, nullable=False)
    mode: Mapped[str] = mapped_column(String(50), nullable=False)
    safety_score_best: Mapped[Decimal | None] = mapped_column(Float, nullable=True)  # 0-100
    distance_m_best: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_s_best: Mapped[int | None] = mapped_column(Integer, nullable=True)
    request_meta: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    route_geom: Mapped[Any | None] = mapped_column(Geometry("LINESTRING", srid=4326), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_route_history_user_created", "user_id", "created_at"),
        Index(
            "ix_route_history_active",
            "user_id",
            "deleted_at",
            postgresql_where="deleted_at IS NULL",
        ),
        Index(
            "ix_route_history_geom",
            "route_geom",
            postgresql_using="gist",
            postgresql_where="route_geom IS NOT NULL",
        ),
    )

    def __repr__(self) -> str:
        return f"<RouteHistory(id={self.id}, user_id={self.user_id}, mode={self.mode})>"
