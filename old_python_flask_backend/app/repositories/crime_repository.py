"""Crime data repository."""

from datetime import date, datetime
from typing import Any, Dict, List, Optional

from geoalchemy2 import WKTElement
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.models.crime import CrimeCategory, CrimeIncident, IngestionRun, SafetyCell


class CrimeRepository:
    """Crime data access layer."""

    def __init__(self, db: Session):
        self.db = db

    # Crime Categories
    def get_category(self, category_id: str) -> Optional[CrimeCategory]:
        """Get crime category by ID."""
        return self.db.query(CrimeCategory).filter(CrimeCategory.id == category_id).first()

    def get_all_categories(self) -> List[CrimeCategory]:
        """Get all crime categories."""
        return self.db.query(CrimeCategory).all()

    def create_category(
        self,
        id: str,
        name: str,
        harm_weight: float = 1.0,
        is_personal: bool = False,
        is_property: bool = False,
    ) -> CrimeCategory:
        """Create a crime category."""
        category = CrimeCategory(
            id=id,
            name=name,
            harm_weight_default=harm_weight,
            is_personal=is_personal,
            is_property=is_property,
        )
        self.db.add(category)
        self.db.commit()
        self.db.refresh(category)
        return category

    # Crime Incidents
    def create_incident(
        self,
        month: date,
        category_id: str,
        crime_type: str,
        force_id: str,
        location_desc: str,
        latitude: float,
        longitude: float,
        external_id: Optional[str] = None,
        context: Optional[str] = None,
        persistent_id: Optional[str] = None,
        lsoa_code: Optional[str] = None,
    ) -> CrimeIncident:
        """Create a crime incident."""
        # Detect if we're using SQLite or PostgreSQL
        dialect_name = self.db.bind.dialect.name

        if dialect_name == "sqlite":
            # For SQLite, store as WKT string
            geom_value = f"SRID=4326;POINT({longitude} {latitude})"
        else:
            # For PostgreSQL/PostGIS, use WKTElement
            geom_value = WKTElement(f"POINT({longitude} {latitude})", srid=4326)

        incident = CrimeIncident(
            external_id=external_id,
            month=month,
            category_id=category_id,
            crime_type=crime_type,
            context=context,
            persistent_id=persistent_id,
            lsoa_code=lsoa_code,
            force_id=force_id,
            location_desc=location_desc,
            geom=geom_value,
        )
        self.db.add(incident)
        self.db.commit()
        self.db.refresh(incident)
        return incident

    def get_incidents_by_month(
        self, month: date, force_id: Optional[str] = None
    ) -> List[CrimeIncident]:
        """Get all incidents for a specific month."""
        query = self.db.query(CrimeIncident).filter(CrimeIncident.month == month)
        if force_id:
            query = query.filter(CrimeIncident.force_id == force_id)
        return query.all()

    # Safety Cells
    def create_or_update_cell(
        self,
        cell_id: str,
        geom_wkt: str,
        month: date,
        crime_count_total: int,
        crime_count_weighted: float,
        stats: Dict[str, Any],
    ) -> SafetyCell:
        """Create or update a safety cell."""
        # Detect dialect first
        dialect_name = self.db.bind.dialect.name

        # Check if cell exists
        query = self.db.query(SafetyCell).filter(SafetyCell.cell_id == cell_id)

        # For SQLite, defer loading the geom column to avoid PostGIS functions
        if dialect_name == "sqlite":
            from sqlalchemy.orm import defer

            query = query.options(defer(SafetyCell.geom))

        cell = query.first()

        if cell:
            # Update existing
            cell.crime_count_total = crime_count_total
            cell.crime_count_weighted = crime_count_weighted
            cell.stats = stats
            cell.updated_at = datetime.utcnow()
        else:
            # Detect if we're using SQLite or PostgreSQL
            dialect_name = self.db.bind.dialect.name

            if dialect_name == "sqlite":
                # For SQLite, store as WKT string
                geom_value = geom_wkt
            else:
                # For PostgreSQL/PostGIS, use WKTElement
                # Check if SRID is already in WKT string
                if "SRID=" in geom_wkt:
                    # Extract SRID from WKT string (e.g., "SRID=4326;POLYGON(...)")
                    srid_str, wkt_geom = geom_wkt.split(";", 1)
                    srid = int(srid_str.split("=")[1])
                    geom_value = WKTElement(wkt_geom, srid=srid)
                else:
                    # Default to EPSG:27700 for backward compatibility
                    geom_value = WKTElement(geom_wkt, srid=27700)

            cell = SafetyCell(
                cell_id=cell_id,
                geom=geom_value,
                month=month,
                crime_count_total=crime_count_total,
                crime_count_weighted=crime_count_weighted,
                stats=stats,
            )
            self.db.add(cell)

        self.db.commit()
        self.db.refresh(cell)
        return cell

    def get_cells_by_month(self, month: date) -> List[SafetyCell]:
        """Get all safety cells for a specific month."""
        from sqlalchemy.orm import defer

        # For SQLite: defer loading geom to avoid AsEWKB() function call
        dialect_name = self.db.bind.dialect.name
        query_base = self.db.query(SafetyCell)
        if dialect_name == "sqlite":
            query_base = query_base.options(defer(SafetyCell.geom))

        return query_base.filter(SafetyCell.month == month).all()

    # Ingestion Runs
    def create_ingestion_run(
        self,
        area_name: str,
        month: date,
        tiles_total: int = 0,
    ) -> IngestionRun:
        """Create an ingestion run record."""
        run = IngestionRun(
            area_name=area_name,
            month=month,
            status="pending",
            tiles_total=tiles_total,
        )
        self.db.add(run)
        self.db.commit()
        self.db.refresh(run)
        return run

    def update_ingestion_run(
        self,
        run_id: str,
        status: Optional[str] = None,
        finished_at: Optional[datetime] = None,
        error_message: Optional[str] = None,
        records_ingested: Optional[int] = None,
        tiles_processed: Optional[int] = None,
    ) -> Optional[IngestionRun]:
        """Update an ingestion run."""
        run = self.db.query(IngestionRun).filter(IngestionRun.id == run_id).first()
        if not run:
            return None

        if status:
            run.status = status
        if finished_at:
            run.finished_at = finished_at
        if error_message:
            run.error_message = error_message
        if records_ingested is not None:
            run.records_ingested = records_ingested
        if tiles_processed is not None:
            run.tiles_processed = tiles_processed

        self.db.commit()
        self.db.refresh(run)
        return run

    def get_latest_ingestion_run(self, area_name: str, month: date) -> Optional[IngestionRun]:
        """Get the latest ingestion run for an area and month."""
        return (
            self.db.query(IngestionRun)
            .filter(
                and_(
                    IngestionRun.area_name == area_name,
                    IngestionRun.month == month,
                )
            )
            .order_by(IngestionRun.started_at.desc())
            .first()
        )
