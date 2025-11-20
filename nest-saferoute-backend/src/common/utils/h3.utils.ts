/**
 * H3 Hexagonal Grid Utilities
 *
 * Utilities for working with H3 hexagonal spatial indexing system.
 * H3 provides a hierarchical hexagonal grid system for geospatial indexing.
 */

import { latLngToCell, cellToBoundary, gridDisk, cellToLatLng } from 'h3-js';
import { Position } from 'geojson';

/**
 * Get H3 cell ID for a given lat/lng coordinate at specified resolution
 *
 * @param lat - Latitude
 * @param lng - Longitude
 * @param resolution - H3 resolution level (0-15), default 10
 * @returns H3 cell ID
 */
export function getCellId(
  lat: number,
  lng: number,
  resolution: number = 10,
): string {
  return latLngToCell(lat, lng, resolution);
}

/**
 * Get boundary coordinates of an H3 cell
 *
 * @param cellId - H3 cell ID
 * @returns Array of [lng, lat] coordinates forming the hexagon boundary
 */
export function getCellBoundary(cellId: string): Position[] {
  const boundary = cellToBoundary(cellId);
  // Convert from [lat, lng] to [lng, lat] for GeoJSON compliance
  return boundary.map(([lat, lng]) => [lng, lat]);
}

/**
 * Get center coordinates of an H3 cell
 *
 * @param cellId - H3 cell ID
 * @returns [lng, lat] coordinates of cell center
 */
export function getCellCenter(cellId: string): Position {
  const [lat, lng] = cellToLatLng(cellId);
  return [lng, lat];
}

/**
 * Get all H3 cells within k rings (distance) from origin cell
 *
 * @param cellId - Origin H3 cell ID
 * @param k - Number of rings (distance)
 * @returns Array of H3 cell IDs including the origin
 */
export function getCellsInRadius(cellId: string, k: number = 1): string[] {
  return gridDisk(cellId, k);
}

/**
 * Get all H3 cells for a list of points
 *
 * @param points - Array of [lng, lat] coordinates
 * @param resolution - H3 resolution level
 * @returns Array of unique H3 cell IDs
 */
export function getCellsForPoints(
  points: Position[],
  resolution: number = 10,
): string[] {
  const cellIds = new Set<string>();

  for (const [lng, lat] of points) {
    const cellId = getCellId(lat, lng, resolution);
    cellIds.add(cellId);
  }

  return Array.from(cellIds);
}

/**
 * Get H3 cells along a line (route)
 *
 * @param coordinates - Array of [lng, lat] coordinates forming a line
 * @param resolution - H3 resolution level
 * @returns Array of unique H3 cell IDs along the line
 */
export function getCellsAlongLine(
  coordinates: Position[],
  resolution: number = 10,
): string[] {
  const cellIds = new Set<string>();

  for (const [lng, lat] of coordinates) {
    const cellId = getCellId(lat, lng, resolution);
    cellIds.add(cellId);

    // Also add neighboring cells to ensure coverage
    const neighbors = getCellsInRadius(cellId, 1);
    neighbors.forEach((id) => cellIds.add(id));
  }

  return Array.from(cellIds);
}

/**
 * Convert H3 cell to GeoJSON Polygon feature
 *
 * @param cellId - H3 cell ID
 * @returns GeoJSON Polygon geometry
 */
export function cellToPolygon(cellId: string): {
  type: 'Polygon';
  coordinates: Position[][];
} {
  const boundary = getCellBoundary(cellId);
  // Close the polygon by adding the first point at the end
  const closedBoundary = [...boundary, boundary[0]];

  return {
    type: 'Polygon',
    coordinates: [closedBoundary],
  };
}

/**
 * Get approximate edge length of H3 cell at given resolution (in meters)
 *
 * Source: https://h3geo.org/docs/core-library/restable/
 */
export function getEdgeLengthM(resolution: number): number {
  const edgeLengths: Record<number, number> = {
    0: 1107712.591,
    1: 418676.005,
    2: 158244.655,
    3: 59810.857,
    4: 22606.379,
    5: 8544.408,
    6: 3229.482,
    7: 1220.629,
    8: 461.354,
    9: 174.375,
    10: 65.907,
    11: 24.910,
    12: 9.415,
    13: 3.559,
    14: 1.348,
    15: 0.509,
  };

  return edgeLengths[resolution] || 65.907; // Default to resolution 10
}

/**
 * Get approximate area of H3 cell at given resolution (in square meters)
 *
 * Source: https://h3geo.org/docs/core-library/restable/
 */
export function getAreaM2(resolution: number): number {
  const areas: Record<number, number> = {
    0: 4250546848655.744,
    1: 607220986124.304,
    2: 86745854013.544,
    3: 12392264889.484,
    4: 1770347654.491,
    5: 252903858.182,
    6: 36129062.164,
    7: 5161293.360,
    8: 737327.598,
    9: 105332.513,
    10: 15047.502,
    11: 2149.643,
    12: 307.092,
    13: 43.870,
    14: 6.267,
    15: 0.895,
  };

  return areas[resolution] || 15047.502; // Default to resolution 10
}
