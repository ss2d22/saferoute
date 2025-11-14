"""SafeRoute Route Segmentation Utilities.

This module provides utilities for segmenting routes into smaller pieces for
granular safety analysis. Routes can be segmented based on turn-by-turn
navigation instructions or by fixed distance intervals.

Segmentation enables:
- Fine-grained safety scoring along routes
- Identification of specific dangerous sections
- Better visualization of route safety profiles

Author: Sriram Sundar
Email: ss2d22@soton.ac.uk
Repository: https://github.com/ss2d22/saferoute
"""

import logging
from typing import Any, Dict, List

from shapely import line_interpolate_point
from shapely.geometry import LineString

logger = logging.getLogger(__name__)


class RouteSegment:
    """Represents a segment of a route."""

    def __init__(
        self,
        segment_id: int,
        geometry: LineString,
        length_m: float,
        instruction_index: int | None = None,
    ):
        self.segment_id = segment_id
        self.geometry = geometry
        self.length_m = length_m
        self.instruction_index = instruction_index


def segment_route_by_instructions(
    route_geom: LineString,
    instructions: List[Dict[str, Any]],
    max_segment_length_m: float = 200.0,
    max_segments: int = 200,
) -> List[RouteSegment]:
    """Segment a route based on turn-by-turn instructions.

    Args:
        route_geom: Route geometry in EPSG:27700
        instructions: List of ORS instruction steps
        max_segment_length_m: Maximum length for a single segment (subdivide if longer)
        max_segments: Maximum total segments (stop subdividing if exceeded)

    Returns:
        List of RouteSegment objects
    """
    segments: List[RouteSegment] = []
    segment_id = 0
    total_length = route_geom.length

    # If no instructions, create segments by distance
    if not instructions:
        return segment_by_distance(route_geom, max_segment_length_m, max_segments)

    current_distance = 0.0

    for inst_idx, instruction in enumerate(instructions):
        inst_distance = instruction.get("distance", 0)

        if inst_distance == 0:
            continue

        # Get portion of route for this instruction
        start_fraction = current_distance / total_length
        end_fraction = min((current_distance + inst_distance) / total_length, 1.0)

        if end_fraction <= start_fraction:
            continue

        # Extract line segment
        start_point = line_interpolate_point(route_geom, start_fraction, normalized=True)
        end_point = line_interpolate_point(route_geom, end_fraction, normalized=True)

        # Create segment geometry (simplified - ideally use actual line portion)
        segment_geom = LineString([start_point, end_point])
        segment_length = inst_distance

        # Check if segment needs subdivision
        if segment_length > max_segment_length_m and len(segments) < max_segments:
            # Subdivide into smaller segments
            num_subdivisions = int(segment_length / max_segment_length_m) + 1
            subdivision_length = segment_length / num_subdivisions

            for i in range(num_subdivisions):
                if len(segments) >= max_segments:
                    break

                sub_start = start_fraction + (end_fraction - start_fraction) * (
                    i / num_subdivisions
                )
                sub_end = start_fraction + (end_fraction - start_fraction) * (
                    (i + 1) / num_subdivisions
                )

                sub_start_point = line_interpolate_point(route_geom, sub_start, normalized=True)
                sub_end_point = line_interpolate_point(route_geom, sub_end, normalized=True)

                sub_geom = LineString([sub_start_point, sub_end_point])

                segments.append(
                    RouteSegment(
                        segment_id=segment_id,
                        geometry=sub_geom,
                        length_m=subdivision_length,
                        instruction_index=inst_idx,
                    )
                )
                segment_id += 1
        else:
            segments.append(
                RouteSegment(
                    segment_id=segment_id,
                    geometry=segment_geom,
                    length_m=segment_length,
                    instruction_index=inst_idx,
                )
            )
            segment_id += 1

        current_distance += inst_distance

        # Stop if we've reached max segments
        if len(segments) >= max_segments:
            logger.warning(
                f"Reached maximum segments ({max_segments}). "
                f"Remaining route length: {total_length - current_distance:.0f}m"
            )
            break

    return segments


def segment_by_distance(
    route_geom: LineString,
    segment_length_m: float = 100.0,
    max_segments: int = 200,
) -> List[RouteSegment]:
    """Segment a route by fixed distance intervals.

    Args:
        route_geom: Route geometry in EPSG:27700
        segment_length_m: Target length for each segment
        max_segments: Maximum number of segments

    Returns:
        List of RouteSegment objects
    """
    segments: List[RouteSegment] = []
    total_length = route_geom.length

    num_segments = min(int(total_length / segment_length_m) + 1, max_segments)
    actual_segment_length = total_length / num_segments

    for i in range(num_segments):
        start_fraction = i / num_segments
        end_fraction = (i + 1) / num_segments

        start_point = line_interpolate_point(route_geom, start_fraction, normalized=True)
        end_point = line_interpolate_point(route_geom, end_fraction, normalized=True)

        segment_geom = LineString([start_point, end_point])

        segments.append(
            RouteSegment(
                segment_id=i,
                geometry=segment_geom,
                length_m=actual_segment_length,
                instruction_index=None,
            )
        )

    return segments
