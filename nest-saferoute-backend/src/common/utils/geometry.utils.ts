import * as turf from '@turf/turf';
import { LineString, Position, Feature, Point, BBox } from 'geojson';

/**
 * Convert GeoJSON LineString to a Turf feature.
 */
export function geojsonToTurf(geojsonGeom: any): Feature<LineString> {
  if (geojsonGeom.type !== 'LineString') {
    throw new Error(`Expected LineString, got ${geojsonGeom.type}`);
  }

  return turf.lineString(geojsonGeom.coordinates);
}

/**
 * Create a buffer polygon around a line and return as WKT.
 */
export function bufferLine(
  geom: Feature<LineString>,
  bufferM: number,
): string {
  const buffered = turf.buffer(geom, bufferM / 1000, { units: 'kilometers' });
  if (!buffered) {
    throw new Error('Buffer operation failed');
  }

  return geometryToWKT(buffered.geometry);
}

/**
 * Calculate line length in meters.
 */
export function calculateLengthM(geom: Feature<LineString>): number {
  return turf.length(geom, { units: 'meters' });
}

/**
 * Reduce line complexity using Douglas-Peucker simplification.
 */
export function simplifyGeometry(
  geom: Feature<LineString>,
  maxPoints: number = 100,
): Feature<LineString> {
  const coords = geom.geometry.coordinates;

  if (coords.length <= maxPoints) {
    return geom;
  }

  const lineLength = calculateLengthM(geom);
  let tolerance = lineLength / (maxPoints * 10);

  let simplified = turf.simplify(geom, {
    tolerance: tolerance / 1000,
    highQuality: true,
  });

  while (
    simplified.geometry.coordinates.length > maxPoints &&
    tolerance < lineLength
  ) {
    tolerance *= 1.5;
    simplified = turf.simplify(geom, {
      tolerance: tolerance / 1000,
      highQuality: true,
    });
  }

  return simplified as Feature<LineString>;
}

export function coordinatesToWKT(coords: Position[]): string {
  const points = coords.map((c) => `${c[0]} ${c[1]}`).join(', ');
  return `LINESTRING(${points})`;
}

export function geometryToWKT(geometry: any): string {
  if (geometry.type === 'LineString') {
    return coordinatesToWKT(geometry.coordinates);
  } else if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates
      .map((ring: Position[]) => {
        const points = ring.map((c: Position) => `${c[0]} ${c[1]}`).join(', ');
        return `(${points})`;
      })
      .join(', ');
    return `POLYGON(${rings})`;
  } else if (geometry.type === 'Point') {
    return `POINT(${geometry.coordinates[0]} ${geometry.coordinates[1]})`;
  }
  throw new Error(`Unsupported geometry type: ${geometry.type}`);
}

export function createBBox(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
): BBox {
  return [minLng, minLat, maxLng, maxLat];
}

export function isPointInBBox(
  point: Position,
  bbox: BBox,
): boolean {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const [lng, lat] = point;
  return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
}

export function getLineStringCenter(
  geom: Feature<LineString>,
): Position {
  const midpoint = turf.along(geom, calculateLengthM(geom) / 2, {
    units: 'meters',
  });
  return midpoint.geometry.coordinates;
}

export function createLineString(coords: Position[]): Feature<LineString> {
  return turf.lineString(coords);
}

export function createPoint(lng: number, lat: number): Feature<Point> {
  return turf.point([lng, lat]);
}

export function distanceBetweenPoints(
  point1: Position,
  point2: Position,
): number {
  const from = turf.point(point1);
  const to = turf.point(point2);
  return turf.distance(from, to, { units: 'meters' });
}

export function splitLineAtDistance(
  line: Feature<LineString>,
  distanceM: number,
): {
  before: Feature<LineString> | null;
  after: Feature<LineString> | null;
} {
  const totalLength = calculateLengthM(line);

  if (distanceM <= 0) {
    return { before: null, after: line };
  }

  if (distanceM >= totalLength) {
    return { before: line, after: null };
  }

  const sliced = turf.lineSliceAlong(line, 0, distanceM, { units: 'meters' });
  const remaining = turf.lineSliceAlong(line, distanceM, totalLength, {
    units: 'meters',
  });

  return {
    before: sliced,
    after: remaining,
  };
}

export function getPointAtDistance(
  line: Feature<LineString>,
  distanceM: number,
): Position {
  const point = turf.along(line, distanceM, { units: 'meters' });
  return point.geometry.coordinates;
}
