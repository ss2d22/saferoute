"""H3 hexagonal safety grid builder.

Aggregates crime incidents into H3 hexagonal cells at resolution 10 (~73m edge).
Calculates crime counts, weighted scores, and category breakdowns per cell/month.
"""

import logging
from collections import defaultdict
from datetime import date, timedelta
from typing import Any, Dict, List, Tuple

import h3
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.repositories.crime_repository import CrimeRepository

logger = logging.getLogger(__name__)
settings = get_settings()

# H3 Resolution 10 chosen for optimal balance:
# - Edge length: ~73m (close to our 100m target cell size)
# - Cell area: ~13,781 m²
# - Resolution 9 would be too large (~193m edge)
# - Resolution 11 would be too fine-grained (~28m edge)
H3_RESOLUTION = 10


class GridBuilder:
    """Aggregates crime data into H3 hexagonal cells.

    Calculates crime counts, weighted scores, and category breakdowns
    for each cell and month.
    """

    def __init__(self, db: Session):
        self.db = db
        self.repo = CrimeRepository(db)

    def _generate_hex_grid(
        self, bbox: Tuple[float, float, float, float], cell_size_m: int = 100
    ) -> List[Tuple[str, str]]:
        """Generate hexagonal grid cells for bounding box.

        Args:
            bbox: (lat_min, lng_min, lat_max, lng_max) in WGS84
            cell_size_m: Hexagon edge length in meters

        Returns:
            List of (cell_id, geom_wkt) tuples
        """
        # Simple square grid in British National Grid (EPSG:27700)
        # TODO: Use PostGIS ST_HexagonGrid for true hexagons

        lat_min, lng_min, lat_max, lng_max = bbox

        # Convert to British National Grid approximate values
        # This is simplified - in production, use proper CRS transformation
        x_min = lng_min * 100000  # Rough approximation
        y_min = lat_min * 100000
        x_max = lng_max * 100000
        y_max = lat_max * 100000

        cells = []
        cell_idx = 0

        y = y_min
        while y < y_max:
            x = x_min
            while x < x_max:
                # Create a square cell (simplified)
                x2 = x + cell_size_m
                y2 = y + cell_size_m

                # Create WKT polygon
                geom_wkt = f"POLYGON(({x} {y}, {x2} {y}, {x2} {y2}, {x} {y2}, {x} {y}))"

                cell_id = f"sq_{int(x)}_{int(y)}"
                cells.append((cell_id, geom_wkt))

                x += cell_size_m
                cell_idx += 1
            y += cell_size_m

        logger.info(f"Generated {len(cells)} grid cells")
        return cells

    def build_safety_cells(self, months: int = 12) -> int:
        """Build safety cells from crime incidents for the last N months.

        Uses PostGIS to create a hex grid and aggregate crimes spatially.

        Args:
            months: Number of months to process (counting backwards from current)

        Returns:
            Number of cells created/updated
        """
        logger.info(f"Building safety cells for last {months} months")

        # Parse Southampton bbox (lat_min, lng_min, lat_max, lng_max)
        bbox_parts = settings.SOUTHAMPTON_BBOX.split(",")
        lat_min, lng_min, lat_max, lng_max = map(float, bbox_parts)

        # Get month range
        end_date = date.today().replace(day=1)
        start_date = end_date - timedelta(days=30 * months)

        cells_created = 0

        # For each month in range
        current_month = start_date
        while current_month <= end_date:
            logger.info(f"Processing month: {current_month.strftime('%Y-%m')}")

            # Get all incidents for this month
            incidents = self.repo.get_incidents_by_month(current_month)

            if not incidents:
                logger.info(f"No incidents found for {current_month}")
                current_month = (current_month.replace(day=28) + timedelta(days=4)).replace(day=1)
                continue

            logger.info(f"Found {len(incidents)} incidents for {current_month.strftime('%Y-%m')}")

            # Build cells using simple grid aggregation
            # TODO: Implement true hexagonal grid using H3 or PostGIS extensions
            cells_created += self._build_cells_simple(current_month, incidents)

            # Move to next month
            current_month = (current_month.replace(day=28) + timedelta(days=4)).replace(day=1)

        logger.info(f"Safety cells build complete. Created/updated {cells_created} cells")
        return cells_created

    def _build_cells_simple(self, month: date, incidents: List) -> int:
        """Build H3 hexagonal cells from crime incidents.

        Uses H3 resolution 9 (~100m hexagons) for fine-grained spatial analysis.
        """
        cells_created = 0

        # SQL query to get crimes with coordinates and categories
        sql = text(
            """
            SELECT
                c.id,
                c.category_id,
                cat.harm_weight_default,
                ST_Y(c.geom) as lat,
                ST_X(c.geom) as lng
            FROM crime_incidents c
            LEFT JOIN crime_categories cat ON c.category_id = cat.id
            WHERE c.month = :month
        """
        )

        try:
            result = self.db.execute(sql, {"month": month})

            # Group crimes by H3 cell
            h3_cells: Dict[str, Dict[str, Any]] = defaultdict(
                lambda: {
                    "crime_count": 0,
                    "weighted_count": 0.0,
                    "category_stats": defaultdict(int),
                }
            )

            for row in result:
                # Convert crime location to H3 cell
                h3_index = h3.latlng_to_cell(row.lat, row.lng, H3_RESOLUTION)

                # Aggregate crime data
                h3_cells[h3_index]["crime_count"] += 1
                h3_cells[h3_index]["weighted_count"] += float(row.harm_weight_default or 1.0)
                h3_cells[h3_index]["category_stats"][row.category_id] += 1

            # Create safety cells for each H3 hexagon
            for h3_index, data in h3_cells.items():
                # Get H3 cell boundary as WKT polygon
                boundary = h3.cell_to_boundary(h3_index)
                # boundary is list of (lat, lng) tuples - H3 returns in WGS84 (EPSG:4326)
                # Convert to WKT: POLYGON((lng lat, lng lat, ...))
                wkt_coords = ", ".join([f"{lng} {lat}" for lat, lng in boundary])
                # Close the polygon by repeating first point
                first_point = boundary[0]
                geom_wkt = f"SRID=4326;POLYGON(({wkt_coords}, {first_point[1]} {first_point[0]}))"

                cell_id = f"{h3_index}_{month.strftime('%Y%m')}"

                self.repo.create_or_update_cell(
                    cell_id=cell_id,
                    geom_wkt=geom_wkt,
                    month=month,
                    crime_count_total=data["crime_count"],
                    crime_count_weighted=data["weighted_count"],
                    stats=dict(data["category_stats"]),
                )
                cells_created += 1

            logger.info(
                f"Created {cells_created} H3 hexagonal cells (resolution {H3_RESOLUTION}) for {month.strftime('%Y-%m')}"
            )

        except Exception as e:
            logger.error(f"Error building H3 grid: {str(e)}", exc_info=True)
            self.db.rollback()

        return cells_created
