"""SafeRoute Geometry Transformation Utilities.

This module provides geometry transformation and manipulation functions for
converting between coordinate reference systems (CRS) and performing spatial
operations. Handles transformations between WGS84 (EPSG:4326) and British
National Grid (EPSG:27700) for accurate distance calculations.

Author: Sriram Sundar
Email: ss2d22@soton.ac.uk
Repository: https://github.com/ss2d22/saferoute
"""

import logging
from typing import cast

from pyproj import Transformer
from shapely.geometry import LineString
from shapely.ops import transform

logger = logging.getLogger(__name__)

# Transformers for CRS conversion
transformer_4326_to_27700 = Transformer.from_crs("EPSG:4326", "EPSG:27700", always_xy=True)
transformer_27700_to_4326 = Transformer.from_crs("EPSG:27700", "EPSG:4326", always_xy=True)


def geojson_to_shapely(geojson_geom: dict) -> LineString:
    """Convert GeoJSON LineString geometry to Shapely LineString.

    Args:
        geojson_geom: GeoJSON geometry dict (type: LineString)

    Returns:
        Shapely LineString in EPSG:4326
    """
    if geojson_geom["type"] != "LineString":
        raise ValueError(f"Expected LineString, got {geojson_geom['type']}")

    coordinates = geojson_geom["coordinates"]
    return LineString(coordinates)


def reproject_to_27700(geom: LineString) -> LineString:
    """Reproject geometry from EPSG:4326 to EPSG:27700.

    Args:
        geom: Shapely geometry in EPSG:4326

    Returns:
        Shapely geometry in EPSG:27700
    """
    return cast(LineString, transform(transformer_4326_to_27700.transform, geom))


def reproject_to_4326(geom: LineString) -> LineString:
    """Reproject geometry from EPSG:27700 to EPSG:4326.

    Args:
        geom: Shapely geometry in EPSG:27700

    Returns:
        Shapely geometry in EPSG:4326
    """
    return cast(LineString, transform(transformer_27700_to_4326.transform, geom))


def buffer_line(geom: LineString, buffer_m: float) -> str:
    """Create a buffer around a line geometry.

    Args:
        geom: Shapely LineString in EPSG:27700
        buffer_m: Buffer distance in metres

    Returns:
        WKT string of buffered polygon in EPSG:27700
    """
    buffered = geom.buffer(buffer_m)
    return buffered.wkt


def calculate_length_m(geom: LineString) -> float:
    """Calculate length of a line geometry in metres.

    Args:
        geom: Shapely LineString in EPSG:27700

    Returns:
        Length in metres
    """
    return geom.length


def simplify_geometry(geom: LineString, max_points: int = 100) -> LineString:
    """Simplify a line geometry to have at most max_points.

    Args:
        geom: Shapely LineString
        max_points: Maximum number of points

    Returns:
        Simplified LineString
    """
    if len(geom.coords) <= max_points:
        return geom

    # Calculate tolerance for simplification
    # Use Douglas-Peucker algorithm
    tolerance = geom.length / (max_points * 10)
    simplified = geom.simplify(tolerance, preserve_topology=True)

    # If still too many points, increase tolerance
    while len(simplified.coords) > max_points:
        tolerance *= 1.5
        simplified = geom.simplify(tolerance, preserve_topology=True)

    return simplified
