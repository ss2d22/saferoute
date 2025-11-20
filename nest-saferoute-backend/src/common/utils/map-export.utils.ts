/**
 * Sample waypoints evenly from route coordinates for Google Maps export.
 * Limits to ~10 waypoints due to URL parameter constraints.
 */
export function sampleWaypoints(
  coordinates: number[][],
  maxWaypoints: number = 9,
): number[][] {
  if (!coordinates || coordinates.length <= 2) {
    return [];
  }

  const routePoints = coordinates.slice(1, coordinates.length - 1);

  if (routePoints.length === 0) {
    return [];
  }

  if (routePoints.length <= maxWaypoints) {
    return routePoints;
  }

  const waypoints: number[][] = [];
  const step = routePoints.length / maxWaypoints;

  for (let i = 0; i < maxWaypoints; i++) {
    const index = Math.floor(i * step);
    waypoints.push(routePoints[index]);
  }

  return waypoints;
}

/**
 * Build a Google Maps URL with origin, destination, and sampled waypoints.
 */
export function generateGoogleMapsUrl(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  routeCoordinates: number[][],
  travelMode: string = 'walking',
): string {
  const baseUrl = 'https://www.google.com/maps/dir/';
  const params = new URLSearchParams();

  params.append('api', '1');
  params.append('origin', `${originLat},${originLng}`);
  params.append('destination', `${destLat},${destLng}`);

  const googleTravelMode = travelMode === 'foot-walking' ? 'walking' : travelMode;
  params.append('travelmode', googleTravelMode);

  const waypoints = sampleWaypoints(routeCoordinates, 9);

  if (waypoints.length > 0) {
    const waypointsStr = waypoints
      .map(coord => `${coord[1]},${coord[0]}`)
      .join('|');
    params.append('waypoints', waypointsStr);
  }

  return `${baseUrl}?${params.toString()}`;
}

/**
 * Generate Apple Maps URL (no waypoint support).
 */
export function generateAppleMapsUrl(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  travelMode: string = 'walking',
): string {
  const baseUrl = 'https://maps.apple.com/';
  const params = new URLSearchParams();

  params.append('saddr', `${originLat},${originLng}`);
  params.append('daddr', `${destLat},${destLng}`);

  const appleDirFlag = travelMode === 'foot-walking' ? 'w' : 'd';
  params.append('dirflg', appleDirFlag);

  return `${baseUrl}?${params.toString()}`;
}

/**
 * Generate map export URLs for both Google Maps and Apple Maps.
 */
export function generateMapExportUrls(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  routeCoordinates: number[][],
  travelMode: string = 'walking',
): { googleMapsUrl: string; appleMapsUrl: string } {
  return {
    googleMapsUrl: generateGoogleMapsUrl(
      originLat,
      originLng,
      destLat,
      destLng,
      routeCoordinates,
      travelMode,
    ),
    appleMapsUrl: generateAppleMapsUrl(
      originLat,
      originLng,
      destLat,
      destLng,
      travelMode,
    ),
  };
}
