"use client";

import { useEffect, useRef } from "react";
import { MapContainer as LeafletMap, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet default marker icons in Next.js
if (typeof window !== "undefined") {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

interface MapContainerProps {
  onMapLoad?: (map: L.Map) => void;
  onBoundsChange?: (bounds: L.LatLngBounds) => void;
  onMapClick?: (e: L.LeafletMouseEvent) => void;
  pickMode?: string;
}

function MapEventHandler({ onMapLoad, onBoundsChange, onMapClick, pickMode }: MapContainerProps) {
  const map = useMap();
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (!hasLoadedRef.current && map) {
      hasLoadedRef.current = true;
      onMapLoad?.(map);
    }
  }, [map, onMapLoad]);

  useMapEvents({
    moveend: () => {
      if (map) {
        onBoundsChange?.(map.getBounds());
      }
    },
    click: (e) => {
      if (onMapClick) {
        onMapClick(e);
      }
    },
  });

  useEffect(() => {
    if (map) {
      const container = map.getContainer();
      container.style.cursor = pickMode && pickMode !== "none" ? "crosshair" : "";
    }
  }, [pickMode, map]);

  return null;
}

export function MapContainer({ onMapLoad, onBoundsChange, onMapClick, pickMode }: MapContainerProps) {
  return (
    <div className="w-full h-full relative">
      <LeafletMap
        center={[50.9097, -1.4044]} // Southampton, UK
        zoom={13}
        className="w-full h-full"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapEventHandler
          onMapLoad={onMapLoad}
          onBoundsChange={onBoundsChange}
          onMapClick={onMapClick}
          pickMode={pickMode}
        />
      </LeafletMap>
    </div>
  );
}
