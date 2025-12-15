"""Unit tests for route segmentation."""

import pytest
from shapely.geometry import LineString

from app.utils.segmentation import RouteSegment, segment_by_distance, segment_route_by_instructions


def test_segment_by_distance():
    """Test distance-based segmentation."""
    # Create a 1000m line (in projected coordinates)
    line = LineString([(0, 0), (1000, 0)])

    segments = segment_by_distance(line, segment_length_m=100.0, max_segments=200)

    # Should create ~10 segments
    assert 9 <= len(segments) <= 11
    assert all(isinstance(s, RouteSegment) for s in segments)
    assert all(s.length_m > 0 for s in segments)


def test_segment_by_distance_respects_max_segments():
    """Test that segmentation respects max segments limit."""
    # Create a very long line
    line = LineString([(0, 0), (50000, 0)])

    segments = segment_by_distance(line, segment_length_m=100.0, max_segments=200)

    # Should not exceed 200 segments
    assert len(segments) <= 200

    # Total length should be preserved
    total_segment_length = sum(s.length_m for s in segments)
    assert total_segment_length == pytest.approx(line.length, rel=0.01)


def test_segment_by_instructions():
    """Test instruction-based segmentation."""
    line = LineString([(0, 0), (1000, 0)])

    instructions = [
        {"distance": 300, "instruction": "Head north"},
        {"distance": 400, "instruction": "Turn right"},
        {"distance": 300, "instruction": "Arrive"},
    ]

    segments = segment_route_by_instructions(
        line, instructions, max_segment_length_m=200.0, max_segments=200
    )

    assert len(segments) > 0
    assert all(isinstance(s, RouteSegment) for s in segments)


def test_segment_by_instructions_subdivides_long_segments():
    """Test that long instruction segments are subdivided."""
    line = LineString([(0, 0), (1000, 0)])

    # Single long instruction
    instructions = [{"distance": 1000, "instruction": "Go straight"}]

    segments = segment_route_by_instructions(
        line, instructions, max_segment_length_m=200.0, max_segments=200
    )

    # Should be subdivided into multiple segments
    assert len(segments) > 1


def test_segment_respects_max_limit():
    """Test that segmentation never exceeds max_segments."""
    line = LineString([(0, 0), (100000, 0)])

    # Very long instructions
    instructions = [{"distance": 500, "instruction": f"Step {i}"} for i in range(300)]

    segments = segment_route_by_instructions(
        line, instructions, max_segment_length_m=100.0, max_segments=200
    )

    # Should stop at 200
    assert len(segments) <= 200
