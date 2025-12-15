"""Unit tests for geometry utilities."""

import pytest
from shapely.geometry import LineString

from app.utils.geometry import (
    calculate_length_m,
    geojson_to_shapely,
    reproject_to_4326,
    reproject_to_27700,
    simplify_geometry,
)


def test_geojson_to_shapely():
    """Test GeoJSON to Shapely conversion."""
    geojson = {"type": "LineString", "coordinates": [[0.0, 0.0], [1.0, 1.0], [2.0, 0.0]]}

    line = geojson_to_shapely(geojson)
    assert isinstance(line, LineString)
    assert len(line.coords) == 3
    assert line.coords[0] == (0.0, 0.0)


def test_geojson_to_shapely_invalid_type():
    """Test error handling for invalid geometry type."""
    geojson = {"type": "Point", "coordinates": [0.0, 0.0]}

    with pytest.raises(ValueError, match="Expected LineString"):
        geojson_to_shapely(geojson)


def test_reproject_to_27700():
    """Test reprojection from 4326 to 27700."""
    # Southampton coordinates in WGS84
    line_4326 = LineString([(-1.4044, 50.9097), (-1.4300, 50.9130)])

    line_27700 = reproject_to_27700(line_4326)
    assert isinstance(line_27700, LineString)

    # British National Grid coordinates should be in metres, much larger values
    x, y = line_27700.coords[0]
    assert x > 400000  # Approximate BNG x for Southampton
    assert y > 100000  # Approximate BNG y for Southampton


def test_reproject_to_4326():
    """Test reprojection from 27700 to 4326."""
    # British National Grid coordinates (approximate Southampton)
    line_27700 = LineString([(442000, 111000), (442100, 111100)])

    line_4326 = reproject_to_4326(line_27700)
    assert isinstance(line_4326, LineString)

    # WGS84 coordinates should be in degrees
    lng, lat = line_4326.coords[0]
    assert -2 < lng < -1  # Approximate longitude for Southampton
    assert 50 < lat < 51  # Approximate latitude for Southampton


def test_calculate_length_m():
    """Test length calculation in metres."""
    # Create a simple line in BNG (100m horizontal)
    line = LineString([(442000, 111000), (442100, 111000)])

    length = calculate_length_m(line)
    assert length == pytest.approx(100.0, 0.1)


def test_simplify_geometry():
    """Test geometry simplification."""
    # Create a line with many points
    coords = [(i, i % 10) for i in range(200)]
    line = LineString(coords)

    assert len(line.coords) == 200

    # Simplify to max 50 points
    simplified = simplify_geometry(line, max_points=50)
    assert len(simplified.coords) <= 50
    assert isinstance(simplified, LineString)


def test_simplify_geometry_already_simple():
    """Test that simple geometries are not over-simplified."""
    line = LineString([(0, 0), (1, 0), (2, 0)])

    simplified = simplify_geometry(line, max_points=100)
    assert len(simplified.coords) == 3
