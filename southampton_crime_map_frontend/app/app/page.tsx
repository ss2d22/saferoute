"use client";

import { Suspense } from "react";
import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/auth-context";
import { toast } from "sonner";
import {
  getSafetySnapshot,
  getSafeRoutes,
  type SafetyCell,
  type SafeRoute,
  type SafeRoutePayload,
  type SafetySnapshotResponse,
} from "@/lib/api";
import {
  MapPin,
  Navigation,
  Loader2,
  AlertTriangle,
  Info,
  Shield,
  Layers,
  TrendingUp,
  Clock,
  ArrowRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const MapContainer = dynamic(
  () =>
    import("@/components/map/map-container").then((mod) => mod.MapContainer),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-muted/20 animate-pulse flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    ),
  }
);

type PickMode = "none" | "origin" | "destination";
type LeafletMap = any;
type LeafletMarker = any;
type LeafletGeoJSON = any;
type LeafletLatLngBounds = any;
type LeafletMouseEvent = any;

function MapPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuth();
  const mapRef = useRef<LeafletMap | null>(null);
  const L = useRef<any>(null);

  // State
  const [loading, setLoading] = useState(false);
  const [pickMode, setPickMode] = useState<PickMode>("none");
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [destination, setDestination] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [routes, setRoutes] = useState<SafeRoute[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [safetyCells, setSafetyCells] = useState<SafetyCell[]>([]);
  const [showHeatmap, setShowHeatmap] = useState(true);

  // Filters
  const [lookbackMonths, setLookbackMonths] = useState(12);
  const [timeOfDay, setTimeOfDay] = useState<string>("all");
  const [mode, setMode] = useState<"foot-walking" | "cycling-regular">(
    "foot-walking"
  );

  const heatmapLayerRef = useRef<LeafletGeoJSON | null>(null);
  const routesLayersRef = useRef<LeafletGeoJSON[]>([]);
  const originMarkerRef = useRef<LeafletMarker | null>(null);
  const destinationMarkerRef = useRef<LeafletMarker | null>(null);

  useEffect(() => {
    import("leaflet").then((leaflet) => {
      L.current = leaflet.default;
    });
  }, []);

  const handleMapLoad = useCallback((map: LeafletMap) => {
    mapRef.current = map;
    loadSafetyHeatmap(map.getBounds());
  }, []);

  const renderHeatmap = useCallback(
    (cells: SafetyCell[]) => {
      const map = mapRef.current;
      if (!map || !L.current) {
        return;
      }

      // Remove existing heatmap layer
      if (heatmapLayerRef.current) {
        map.removeLayer(heatmapLayerRef.current);
        heatmapLayerRef.current = null;
      }

      // Don't render if heatmap is disabled or no cells
      if (!showHeatmap) {
        return;
      }

      if (cells.length === 0) {
        return;
      }

      if (!map.getPane("heatmapPane")) {
        const pane = map.createPane("heatmapPane");
        pane.style.zIndex = "400";
      }

      const geojsonLayer = L.current.geoJSON(
        {
          type: "FeatureCollection",
          features: cells.map((cell) => {
            return {
              type: "Feature" as const,
              properties: {
                risk_score: cell.risk_score,
                safety_score: cell.safety_score,
                crime_count: cell.crime_count,
                crime_breakdown: cell.crime_breakdown,
              },
              geometry: cell.geometry,
            };
          }),
        },
        {
          pane: "heatmapPane",
          style: (feature: any) => {
            const safetyScore = feature?.properties.safety_score || 0;
            let color = "#dc2626"; // strong red
            let fillOpacity = 0.4;

            if (safetyScore >= 75) {
              color = "#16a34a"; // strong green
              fillOpacity = 0.25;
            } else if (safetyScore >= 50) {
              color = "#ca8a04"; // strong yellow
              fillOpacity = 0.35;
            } else {
              fillOpacity = 0.5; // more visible for danger zones
            }

            return {
              fillColor: color,
              fillOpacity: fillOpacity,
              color: color,
              weight: 1,
              opacity: 0.8,
            };
          },
          onEachFeature: (feature: any, layer: any) => {
            layer.on("click", () => {
              const props = feature.properties;
              const crimeBreakdown = props.crime_breakdown || {};
              const topCategories = Object.entries(crimeBreakdown)
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .slice(0, 3);

              layer
                .bindPopup(
                  `
              <div class="p-3">
                <p class="font-bold mb-1">Safety: ${props.safety_score?.toFixed(
                  0
                )}/100</p>
                <p class="text-xs mb-2">Incidents: ${props.crime_count}</p>
                ${
                  topCategories.length > 0
                    ? topCategories
                        .map(
                          ([cat, count]) => `
                  <p class="text-xs text-muted-foreground">• ${cat}: ${count}</p>
                `
                        )
                        .join("")
                    : ""
                }
              </div>
            `
                )
                .openPopup();
            });
          },
        }
      );

      geojsonLayer.addTo(map);
      heatmapLayerRef.current = geojsonLayer;
    },
    [showHeatmap]
  );

  const loadSafetyHeatmap = useCallback(
    async (bounds: LeafletLatLngBounds) => {
      if (!mapRef.current || !L.current) {
        return;
      }

      const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;

      try {
        const response = await getSafetySnapshot({
          bbox,
          lookback_months: lookbackMonths,
          time_of_day: timeOfDay !== "all" ? (timeOfDay as any) : undefined,
        });
        setSafetyCells(response.cells);

        if (response.cells.length > 0) {
          renderHeatmap(response.cells);
        }
      } catch (error) {}
    },
    [lookbackMonths, timeOfDay, showHeatmap, renderHeatmap]
  );

  useEffect(() => {
    if (!mapRef.current || !L.current) return;

    if (!showHeatmap && heatmapLayerRef.current) {
      mapRef.current.removeLayer(heatmapLayerRef.current);
      heatmapLayerRef.current = null;
    } else if (
      showHeatmap &&
      safetyCells.length > 0 &&
      !heatmapLayerRef.current
    ) {
      renderHeatmap(safetyCells);
    }
  }, [showHeatmap, safetyCells, renderHeatmap]);

  const handleMapClick = useCallback(
    (e: LeafletMouseEvent) => {
      if (!L.current) return;

      const { lat, lng } = e.latlng;

      if (pickMode === "origin") {
        setOrigin({ lat, lng });
        if (originMarkerRef.current) {
          mapRef.current?.removeLayer(originMarkerRef.current);
        }
        const marker = L.current
          .marker([lat, lng], {
            icon: L.current.divIcon({
              className: "custom-marker-origin",
              html: '<div class="w-10 h-10 bg-primary rounded-full border-4 border-background shadow-xl flex items-center justify-center text-primary-foreground font-bold">A</div>',
              iconSize: [40, 40],
              iconAnchor: [20, 20],
            }),
          })
          .addTo(mapRef.current!);
        originMarkerRef.current = marker;
        setPickMode("none");
        toast.success("Origin set");
      } else if (pickMode === "destination") {
        setDestination({ lat, lng });
        if (destinationMarkerRef.current) {
          mapRef.current?.removeLayer(destinationMarkerRef.current);
        }
        const marker = L.current
          .marker([lat, lng], {
            icon: L.current.divIcon({
              className: "custom-marker-destination",
              html: '<div class="w-10 h-10 bg-destructive rounded-full border-4 border-background shadow-xl flex items-center justify-center text-destructive-foreground font-bold">B</div>',
              iconSize: [40, 40],
              iconAnchor: [20, 20],
            }),
          })
          .addTo(mapRef.current!);
        destinationMarkerRef.current = marker;
        setPickMode("none");
        toast.success("Destination set");
      }
    },
    [pickMode]
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (pickMode !== "none") {
      const container = map.getContainer();
      container.style.cursor = "crosshair";
      map.on("click", handleMapClick);
    } else {
      const container = map.getContainer();
      container.style.cursor = "";
      map.off("click", handleMapClick);
    }

    return () => {
      if (map) {
        map.off("click", handleMapClick);
        const container = map.getContainer();
        container.style.cursor = "";
      }
    };
  }, [pickMode, handleMapClick]);

  const findSafeRoutes = async () => {
    if (!origin || !destination) {
      toast.error("Please set both origin and destination");
      return;
    }

    setLoading(true);
    try {
      const payload: SafeRoutePayload = {
        origin,
        destination,
        mode,
        preferences: {
          lookback_months: lookbackMonths,
          time_of_day_sensitive: timeOfDay !== "all",
        },
      };

      const response = await getSafeRoutes(payload);
      const routesData = Array.isArray(response)
        ? response
        : (response as any).routes || [];

      setRoutes(routesData);
      if (routesData.length > 0) {
        const firstRouteId = routesData[0].route_id || `route-0`;
        setSelectedRouteId(firstRouteId);
        renderRoutes(routesData, firstRouteId);
      }

      toast.success(
        `Found ${routesData.length} safe route${
          routesData.length !== 1 ? "s" : ""
        }`
      );
    } catch (error) {
      console.error("Failed to find routes:", error);
      toast.error("Failed to find routes");
    } finally {
      setLoading(false);
    }
  };

  const renderRoutes = useCallback(
    (routes: SafeRoute[], selectedId?: string | null) => {
      const map = mapRef.current;
      if (!map || !L.current) return;

      // Clear existing route layers
      routesLayersRef.current.forEach((layer) => map.removeLayer(layer));
      routesLayersRef.current = [];

      if (routes.length === 0) return;

      if (!map.getPane("routesPane")) {
        const pane = map.createPane("routesPane");
        pane.style.zIndex = "450";
      }

      const currentSelectedId =
        selectedId !== undefined ? selectedId : selectedRouteId;

      routes.forEach((route, index) => {
        const routeId = route.route_id || `route-${index}`;
        const isSelected = routeId === currentSelectedId;

        if (!isSelected) {
          const layer = L.current.geoJSON(
            {
              type: "Feature",
              properties: {
                route_id: routeId,
              },
              geometry: route.geometry,
            },
            {
              pane: "routesPane",
              style: {
                color: "#64748b", // grey
                weight: 5,
                opacity: 0.3,
                lineJoin: "round",
                lineCap: "round",
              },
            }
          );
          layer.addTo(map);
          routesLayersRef.current.push(layer);
        } else {
          const segments = route.stats?.segments || [];
          const coordinates = route.geometry.coordinates; // Array of [lng, lat] pairs

          if (segments.length > 0 && coordinates.length > 0) {
            // Sort segments by index to ensure proper order
            const sortedSegments = [...segments].sort(
              (a, b) => (a.segment_index || 0) - (b.segment_index || 0)
            );

            sortedSegments.forEach((segment: any, segIdx: number) => {
              const riskScore = segment.risk_score || 0;

              let segmentColor = "#22c55e"; // green - safe
              if (riskScore > 15) {
                segmentColor = "#ef4444"; // red - critical risk
              } else if (riskScore > 10) {
                segmentColor = "#f97316"; // orange - high risk
              } else if (riskScore > 5) {
                segmentColor = "#eab308"; // yellow - moderate risk
              }

              // Each segment covers a portion of the route
              const totalSegments = sortedSegments.length;
              const coordsPerSegment = Math.ceil(
                coordinates.length / totalSegments
              );
              const startIdx = segIdx * coordsPerSegment;
              const endIdx = Math.min(
                (segIdx + 1) * coordsPerSegment,
                coordinates.length
              );

              // Extract coordinates for this segment
              const segmentCoords = coordinates
                .slice(startIdx, endIdx + 1)
                .map((coord: number[]) => {
                  const [lng, lat] = coord;
                  return [lat, lng];
                });

              if (segmentCoords.length > 1) {
                const segmentLayer = L.current.polyline(segmentCoords, {
                  pane: "routesPane",
                  color: segmentColor,
                  weight: 7,
                  opacity: 0.9,
                  lineJoin: "round",
                  lineCap: "round",
                });

                segmentLayer.addTo(map);
                routesLayersRef.current.push(segmentLayer);
              }
            });
          } else {
            let routeColor = "#22c55e"; // green
            if (route.safety_score < 50) routeColor = "#ef4444"; // red
            else if (route.safety_score < 75) routeColor = "#eab308"; // yellow

            const layer = L.current.geoJSON(
              {
                type: "Feature",
                properties: {
                  route_id: routeId,
                  safety_score: route.safety_score,
                },
                geometry: route.geometry,
              },
              {
                pane: "routesPane",
                style: {
                  color: routeColor,
                  weight: 7,
                  opacity: 0.9,
                  lineJoin: "round",
                  lineCap: "round",
                },
              }
            );
            layer.addTo(map);
            routesLayersRef.current.push(layer);
          }
        }
      });

      // Fit bounds to show all routes
      if (routes.length > 0) {
        const bounds = L.current.latLngBounds([]);
        routes.forEach((route) => {
          route.geometry.coordinates.forEach((coord: number[]) => {
            const lng = coord[0];
            const lat = coord[1];
            bounds.extend([lat, lng]);
          });
        });
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [80, 80] });
        }
      }
    },
    [selectedRouteId]
  );

  useEffect(() => {
    if (routes.length > 0 && selectedRouteId) {
      renderRoutes(routes, selectedRouteId);
    }
  }, [selectedRouteId, routes, renderRoutes]);

  const selectedRoute = routes.find((r, idx) => {
    const routeId = r.route_id || `route-${idx}`;
    return routeId === selectedRouteId;
  });

  const getRiskBadgeColor = (riskClass: string) => {
    switch (riskClass) {
      case "low":
        return "bg-risk-low/20 text-risk-low border-risk-low/30";
      case "medium":
        return "bg-risk-medium/20 text-risk-medium border-risk-medium/30";
      case "high":
        return "bg-risk-high/20 text-risk-high border-risk-high/30";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  useEffect(() => {
    const originParam = searchParams.get("origin");
    const destinationParam = searchParams.get("destination");

    if (originParam && destinationParam && mapRef.current && L.current) {
      try {
        const [originLat, originLng] = originParam.split(",").map(Number);
        const [destLat, destLng] = destinationParam.split(",").map(Number);

        if (
          !isNaN(originLat) &&
          !isNaN(originLng) &&
          !isNaN(destLat) &&
          !isNaN(destLng)
        ) {
          // Set origin and destination state
          const originCoords = { lat: originLat, lng: originLng };
          const destCoords = { lat: destLat, lng: destLng };

          setOrigin(originCoords);
          setDestination(destCoords);

          // Add markers to map
          if (originMarkerRef.current) {
            mapRef.current.removeLayer(originMarkerRef.current);
          }
          const originMarker = L.current
            .marker([originLat, originLng], {
              icon: L.current.divIcon({
                className: "custom-marker-origin",
                html: '<div class="w-10 h-10 bg-primary rounded-full border-4 border-background shadow-xl flex items-center justify-center text-primary-foreground font-bold">A</div>',
                iconSize: [40, 40],
                iconAnchor: [20, 20],
              }),
            })
            .addTo(mapRef.current);
          originMarkerRef.current = originMarker;

          if (destinationMarkerRef.current) {
            mapRef.current.removeLayer(destinationMarkerRef.current);
          }
          const destMarker = L.current
            .marker([destLat, destLng], {
              icon: L.current.divIcon({
                className: "custom-marker-destination",
                html: '<div class="w-10 h-10 bg-destructive rounded-full border-4 border-background shadow-xl flex items-center justify-center text-destructive-foreground font-bold">B</div>',
                iconSize: [40, 40],
                iconAnchor: [20, 20],
              }),
            })
            .addTo(mapRef.current);
          destinationMarkerRef.current = destMarker;

          // Auto-trigger route search
          setTimeout(() => {
            findSafeRoutes();
          }, 500);
        }
      } catch (error) {
        console.error("Failed to parse URL parameters:", error);
      }
    }
  }, [searchParams, mapRef.current, L.current]);

  return (
    <div className="h-screen flex flex-col bg-background">
      <Navbar />

      <div className="flex-1 flex pt-16 overflow-hidden">
        {/* Left Sidebar - Compact Controls */}
        <motion.div
          initial={{ x: -320 }}
          animate={{ x: 0 }}
          className="w-80 border-r border-border/50 bg-card/30 backdrop-blur-xl overflow-y-auto"
        >
          <div className="p-6 space-y-6">
            {/* Route Planning Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-1 bg-primary rounded-full" />
                <h2 className="text-lg font-bold">Plan Route</h2>
              </div>

              {!isAuthenticated && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Card className="p-3 bg-primary/5 border-primary/20">
                    <p className="text-xs flex items-center gap-2">
                      <Info className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>Sign in to save routes to history</span>
                    </p>
                  </Card>
                </motion.div>
              )}

              {/* Indicator when user is signed in that routes are auto-saved */}
              {isAuthenticated && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Card className="p-3 bg-primary/10 border-primary/30">
                    <p className="text-xs flex items-center gap-2 text-primary">
                      <Shield className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>
                        Routes are automatically saved to your history
                      </span>
                    </p>
                  </Card>
                </motion.div>
              )}

              {/* Origin/Destination Inputs */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Origin
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Click map to set"
                      value={
                        origin
                          ? `${origin.lat.toFixed(4)}, ${origin.lng.toFixed(4)}`
                          : ""
                      }
                      readOnly
                      className="text-sm h-9"
                    />
                    <Button
                      size="sm"
                      variant={pickMode === "origin" ? "default" : "outline"}
                      onClick={() =>
                        setPickMode(pickMode === "origin" ? "none" : "origin")
                      }
                      className="h-9 w-9 p-0"
                    >
                      <MapPin className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Destination
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Click map to set"
                      value={
                        destination
                          ? `${destination.lat.toFixed(
                              4
                            )}, ${destination.lng.toFixed(4)}`
                          : ""
                      }
                      readOnly
                      className="text-sm h-9"
                    />
                    <Button
                      size="sm"
                      variant={
                        pickMode === "destination" ? "default" : "outline"
                      }
                      onClick={() =>
                        setPickMode(
                          pickMode === "destination" ? "none" : "destination"
                        )
                      }
                      className="h-9 w-9 p-0"
                    >
                      <MapPin className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Mode
                  </Label>
                  <Select value={mode} onValueChange={(v) => setMode(v as any)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="foot-walking">Walking</SelectItem>
                      <SelectItem value="cycling-regular">Cycling</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  className="w-full h-10 font-medium"
                  onClick={findSafeRoutes}
                  disabled={loading || !origin || !destination}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Finding routes...
                    </>
                  ) : (
                    <>
                      <Navigation className="mr-2 h-4 w-4" />
                      Find Safe Routes
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Routes & Heatmap Tabs */}
            <Tabs defaultValue="routes" className="w-full">
              <TabsList className="grid w-full grid-cols-2 h-9">
                <TabsTrigger value="routes" className="text-xs">
                  Routes
                </TabsTrigger>
                <TabsTrigger value="heatmap" className="text-xs">
                  Heatmap
                </TabsTrigger>
              </TabsList>

              <TabsContent value="routes" className="mt-4 space-y-3">
                {routes.length === 0 ? (
                  <Card className="p-8 text-center border-dashed">
                    <Shield className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">
                      Set your route to view options
                    </p>
                  </Card>
                ) : (
                  <AnimatePresence mode="popLayout">
                    {routes.map((route, index) => {
                      const routeId = route.route_id || `route-${index}`;
                      const isSelected = selectedRouteId === routeId;

                      return (
                        <motion.div
                          key={routeId}
                          layout
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ delay: index * 0.05 }}
                        >
                          <Card
                            className={`p-4 cursor-pointer transition-all hover:shadow-md hover:border-primary/30 ${
                              isSelected
                                ? "ring-2 ring-primary shadow-lg border-primary/50"
                                : "border-border/50"
                            }`}
                            onClick={() => setSelectedRouteId(routeId)}
                          >
                            {route.is_recommended && (
                              <Badge className="mb-2 text-xs px-2 py-0.5">
                                Recommended
                              </Badge>
                            )}
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <div className="flex items-baseline gap-1">
                                  <p className="font-bold text-3xl">
                                    {route.safety_score.toFixed(1)}
                                  </p>
                                  <span className="text-sm text-muted-foreground">
                                    /100
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Safety Score
                                </p>
                              </div>
                              <Badge
                                variant="outline"
                                className={`${getRiskBadgeColor(
                                  route.risk_class
                                )} text-xs px-2`}
                              >
                                {route.risk_class}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <TrendingUp className="h-3 w-3" />
                                {(route.distance_m / 1000).toFixed(1)} km
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {Math.round(route.duration_s / 60)} min
                              </span>
                            </div>
                          </Card>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                )}
              </TabsContent>

              <TabsContent value="heatmap" className="mt-4 space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border-border/30">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm font-medium">Show Heatmap</Label>
                  </div>
                  <Switch
                    checked={showHeatmap}
                    onCheckedChange={setShowHeatmap}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Data Period: {lookbackMonths} months
                  </Label>
                  <Slider
                    value={[lookbackMonths]}
                    onValueChange={(v) => setLookbackMonths(v[0])}
                    min={3}
                    max={24}
                    step={1}
                    className="py-2"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Time of Day
                  </Label>
                  <Select value={timeOfDay} onValueChange={setTimeOfDay}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Day</SelectItem>
                      <SelectItem value="night">Night</SelectItem>
                      <SelectItem value="morning">Morning</SelectItem>
                      <SelectItem value="day">Day</SelectItem>
                      <SelectItem value="evening">Evening</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  variant="outline"
                  className="w-full h-9"
                  onClick={() =>
                    mapRef.current &&
                    loadSafetyHeatmap(mapRef.current.getBounds())
                  }
                >
                  Refresh Data
                </Button>

                {/* Legend */}
                <Card className="p-4 bg-muted/20 border-border/30">
                  <p className="text-xs font-semibold mb-3 text-muted-foreground">
                    Safety Legend
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-5 h-5 rounded border border-border/30 bg-risk-low/40" />
                      <span className="text-xs">Safe (75-100)</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="w-5 h-5 rounded border border-border/30 bg-risk-medium/40" />
                      <span className="text-xs">Moderate (50-74)</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="w-5 h-5 rounded border border-border/30 bg-risk-high/40" />
                      <span className="text-xs">High Risk (0-49)</span>
                    </div>
                  </div>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </motion.div>

        {/* Map Container */}
        <div className="flex-1 relative">
          <MapContainer
            onMapLoad={handleMapLoad}
            onBoundsChange={loadSafetyHeatmap}
            onMapClick={handleMapClick}
            pickMode={pickMode}
          />

          {/* Pick Mode Indicator */}
          <AnimatePresence>
            {pickMode !== "none" && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute top-6 left-1/2 -translate-x-1/2 z-[1000]"
              >
                <Card className="px-4 py-2.5 bg-card/95 backdrop-blur-xl border-primary/30 shadow-lg">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    Click map to set {pickMode}
                  </p>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Sidebar - Route Details */}
        <AnimatePresence mode="wait">
          {selectedRoute && (
            <motion.div
              key={selectedRouteId}
              initial={{ x: 384 }}
              animate={{ x: 0 }}
              exit={{ x: 384 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="w-96 border-l border-border/50 bg-card/30 backdrop-blur-xl overflow-y-auto"
            >
              <div className="p-6 space-y-6">
                {/* Header */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="h-8 w-1 bg-primary rounded-full" />
                    <h3 className="text-lg font-bold">Route Details</h3>
                  </div>
                  {selectedRoute.is_recommended && (
                    <Badge className="mb-4">Recommended Route</Badge>
                  )}
                </div>

                {/* Safety Score Card */}
                <Card className="p-5 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="flex items-baseline gap-1">
                        <p className="text-4xl font-bold">
                          {selectedRoute.safety_score.toFixed(1)}
                        </p>
                        <span className="text-lg text-muted-foreground">
                          /100
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Safety Score
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`${getRiskBadgeColor(
                        selectedRoute.risk_class
                      )} px-3 py-1`}
                    >
                      {selectedRoute.risk_class} risk
                    </Badge>
                  </div>

                  {/* Progress Bar */}
                  <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${selectedRoute.safety_score}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className="h-full bg-gradient-to-r from-risk-low via-risk-medium to-risk-high"
                    />
                  </div>
                </Card>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <Card className="p-4 border-border/30">
                    <TrendingUp className="h-4 w-4 text-muted-foreground mb-2" />
                    <p className="text-xs text-muted-foreground">Distance</p>
                    <p className="text-xl font-bold">
                      {(selectedRoute.distance_m / 1000).toFixed(2)} km
                    </p>
                  </Card>
                  <Card className="p-4 border-border/30">
                    <Clock className="h-4 w-4 text-muted-foreground mb-2" />
                    <p className="text-xs text-muted-foreground">Duration</p>
                    <p className="text-xl font-bold">
                      {Math.round(selectedRoute.duration_s / 60)} min
                    </p>
                  </Card>
                </div>

                {/* Hotspots - Condensed View */}
                {selectedRoute.stats.hotspots.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      <h4 className="font-semibold text-sm">
                        {selectedRoute.stats.hotspots.length} Risk{" "}
                        {selectedRoute.stats.hotspots.length === 1
                          ? "Area"
                          : "Areas"}
                      </h4>
                    </div>

                    <div className="space-y-2">
                      {selectedRoute.stats.hotspots
                        .slice(0, 3)
                        .map((hotspot, index) => (
                          <Card
                            key={index}
                            className="p-3 border-l-4 border-destructive/50 bg-destructive/5"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <p className="text-sm font-medium capitalize">
                                  {hotspot.risk_level} Risk
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                  {hotspot.description}
                                </p>
                              </div>
                              <Badge
                                variant="outline"
                                className="text-xs ml-2 flex-shrink-0"
                              >
                                {hotspot.risk_score.toFixed(1)}
                              </Badge>
                            </div>
                          </Card>
                        ))}

                      {selectedRoute.stats.hotspots.length > 3 && (
                        <p className="text-xs text-center text-muted-foreground py-2">
                          + {selectedRoute.stats.hotspots.length - 3} more risk
                          areas
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Turn-by-Turn - Collapsed by default */}
                {selectedRoute.instructions &&
                  selectedRoute.instructions.length > 0 && (
                    <details className="group">
                      <summary className="flex items-center justify-between cursor-pointer font-semibold text-sm mb-3">
                        <span>Turn-by-Turn Directions</span>
                        <ArrowRight className="h-4 w-4 transition-transform group-open:rotate-90" />
                      </summary>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {selectedRoute.instructions.map(
                          (instruction, index) => (
                            <div
                              key={index}
                              className="flex gap-3 text-sm p-2 rounded-lg hover:bg-muted/30 transition-colors"
                            >
                              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                                {index + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-xs">
                                  {instruction.instruction}
                                </p>
                                {instruction.name && (
                                  <p className="text-xs text-muted-foreground truncate">
                                    {instruction.name}
                                  </p>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground flex-shrink-0">
                                {instruction.distance}m
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </details>
                  )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function MapPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <MapPageContent />
    </Suspense>
  );
}
