"""Crime data models."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from geoalchemy2 import Geometry
from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CrimeCategory(Base):
    """Crime category reference table."""

    __tablename__ = "crime_categories"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    harm_weight_default: Mapped[Decimal] = mapped_column(Float, default=1.0, nullable=False)
    is_personal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_property: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    def __repr__(self) -> str:
        return f"<CrimeCategory(id={self.id}, name={self.name})>"


class CrimeIncident(Base):
    """Crime incident from UK Police API."""

    __tablename__ = "crime_incidents"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    external_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    month: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    category_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("crime_categories.id"), nullable=False, index=True
    )
    crime_type: Mapped[str] = mapped_column(String(200), nullable=False)
    context: Mapped[str | None] = mapped_column(Text, nullable=True)
    persistent_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    lsoa_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    force_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    location_desc: Mapped[str] = mapped_column(Text, nullable=False)
    geom: Mapped[Any] = mapped_column(Geometry("POINT", srid=4326), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )

    __table_args__ = (
        Index("ix_crime_incidents_month_category", "month", "category_id"),
        Index("ix_crime_incidents_month_desc", "month"),
        Index("ix_crime_incidents_geom", "geom", postgresql_using="gist"),
    )

    def __repr__(self) -> str:
        return f"<CrimeIncident(id={self.id}, category={self.category_id}, month={self.month})>"


class SafetyCell(Base):
    """Pre-aggregated safety grid cell.

    Stores H3 hexagonal grid cells with crime statistics.
    Geometry is stored in WGS84 (EPSG:4326) to match H3's coordinate system.
    """

    __tablename__ = "safety_cells"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    cell_id: Mapped[str] = mapped_column(String(200), nullable=False, unique=True, index=True)
    geom: Mapped[Any] = mapped_column(Geometry("POLYGON", srid=4326), nullable=False)
    month: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    crime_count_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    crime_count_weighted: Mapped[Decimal] = mapped_column(Float, default=0, nullable=False)
    stats: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    __table_args__ = (
        Index("ix_safety_cells_geom", "geom", postgresql_using="gist"),
        Index("ix_safety_cells_month_desc", "month"),
    )

    def __repr__(self) -> str:
        return f"<SafetyCell(id={self.id}, cell_id={self.cell_id}, month={self.month})>"


class IngestionRun(Base):
    """Track crime data ingestion runs."""

    __tablename__ = "ingestion_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    area_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    month: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True
    )  # pending, running, success, failed, partial
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    records_ingested: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tiles_processed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tiles_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    __table_args__ = (
        Index("ix_ingestion_runs_area_month", "area_name", "month"),
        Index("ix_ingestion_runs_status", "status"),
    )

    def __repr__(self) -> str:
        return f"<IngestionRun(id={self.id}, area={self.area_name}, month={self.month}, status={self.status})>"
