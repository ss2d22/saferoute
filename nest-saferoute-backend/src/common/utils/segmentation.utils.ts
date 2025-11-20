import * as turf from '@turf/turf';
import { LineString, Position, Feature } from 'geojson';
import { Logger } from '@nestjs/common';
import { calculateLengthM, getPointAtDistance } from './geometry.utils';

const logger = new Logger('SegmentationUtils');

export class RouteSegment {
  constructor(
    public segmentId: number,
    public geometry: Feature<LineString>,
    public lengthM: number,
    public instructionIndex?: number,
  ) {}
}

/**
 * Split a route into segments based on turn-by-turn navigation instructions.
 * Long segments are subdivided to keep them under maxSegmentLengthM.
 */
export function segmentRouteByInstructions(
  routeGeom: Feature<LineString>,
  instructions: any[],
  maxSegmentLengthM: number = 200.0,
  maxSegments: number = 200,
): RouteSegment[] {
  const segments: RouteSegment[] = [];
  let segmentId = 0;
  const totalLength = calculateLengthM(routeGeom);

  if (!instructions || instructions.length === 0) {
    return segmentByDistance(routeGeom, maxSegmentLengthM, maxSegments);
  }

  let currentDistance = 0.0;

  for (let instIdx = 0; instIdx < instructions.length; instIdx++) {
    const instruction = instructions[instIdx];
    const instDistance = instruction.distance || 0;

    if (instDistance === 0) {
      continue;
    }

    const startFraction = currentDistance / totalLength;
    const endFraction = Math.min(
      (currentDistance + instDistance) / totalLength,
      1.0,
    );

    if (endFraction <= startFraction) {
      continue;
    }

    const segmentGeom = turf.lineSliceAlong(
      routeGeom,
      currentDistance,
      currentDistance + instDistance,
      { units: 'meters' },
    );
    const segmentLength = instDistance;

    if (segmentLength > maxSegmentLengthM && segments.length < maxSegments) {
      const numSubdivisions = Math.floor(segmentLength / maxSegmentLengthM) + 1;
      const subdivisionLength = segmentLength / numSubdivisions;

      for (let i = 0; i < numSubdivisions; i++) {
        if (segments.length >= maxSegments) {
          break;
        }

        const subStart = currentDistance + i * subdivisionLength;
        const subEnd = currentDistance + (i + 1) * subdivisionLength;

        const subGeom = turf.lineSliceAlong(routeGeom, subStart, subEnd, {
          units: 'meters',
        });

        segments.push(
          new RouteSegment(
            segmentId,
            subGeom,
            subdivisionLength,
            instIdx,
          ),
        );
        segmentId++;
      }
    } else {
      segments.push(
        new RouteSegment(
          segmentId,
          segmentGeom,
          segmentLength,
          instIdx,
        ),
      );
      segmentId++;
    }

    currentDistance += instDistance;

    if (segments.length >= maxSegments) {
      logger.warn(
        `Reached maximum segments (${maxSegments}). ` +
          `Remaining route length: ${Math.round(totalLength - currentDistance)}m`,
      );
      break;
    }
  }

  return segments;
}

/**
 * Split a route into equal-length segments.
 */
export function segmentByDistance(
  routeGeom: Feature<LineString>,
  segmentLengthM: number = 100.0,
  maxSegments: number = 200,
): RouteSegment[] {
  const segments: RouteSegment[] = [];
  const totalLength = calculateLengthM(routeGeom);

  const numSegments = Math.min(
    Math.floor(totalLength / segmentLengthM) + 1,
    maxSegments,
  );
  const actualSegmentLength = totalLength / numSegments;

  for (let i = 0; i < numSegments; i++) {
    const startDistance = i * actualSegmentLength;
    const endDistance = (i + 1) * actualSegmentLength;

    const segmentGeom = turf.lineSliceAlong(routeGeom, startDistance, endDistance, {
      units: 'meters',
    });

    segments.push(
      new RouteSegment(
        i,
        segmentGeom,
        actualSegmentLength,
        undefined,
      ),
    );
  }

  return segments;
}

export function getSegmentMidpoint(segment: RouteSegment): Position {
  const midpoint = turf.along(segment.geometry, segment.lengthM / 2, {
    units: 'meters',
  });
  return midpoint.geometry.coordinates;
}

export function getTotalSegmentsLength(segments: RouteSegment[]): number {
  return segments.reduce((total, seg) => total + seg.lengthM, 0);
}

export function filterSegmentsByMinLength(
  segments: RouteSegment[],
  minLengthM: number,
): RouteSegment[] {
  return segments.filter((seg) => seg.lengthM >= minLengthM);
}
