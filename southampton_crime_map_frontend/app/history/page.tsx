"use client";

import { useEffect, useState } from "react";
import { useRouter } from 'next/navigation';
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/auth-context";
import { toast } from "sonner";
import {
  getRouteHistory,
  deleteRouteHistoryItem,
  deleteAllRouteHistory,
  type RouteHistoryItem,
} from "@/lib/api";
import { Map, Trash2, MapPin, Calendar, Clock } from 'lucide-react';
import { motion } from "framer-motion";

export default function HistoryPage() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [history, setHistory] = useState<RouteHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/auth/login");
    }
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    if (isAuthenticated) {
      loadHistory();
    }
  }, [isAuthenticated]);

  const loadHistory = async () => {
    try {
      const data = await getRouteHistory({ limit: 100 });
      setHistory(data.items);
    } catch (error) {
      toast.error("Failed to load history");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRouteHistoryItem(id);
      setHistory(history.filter((item) => item.id !== id));
      toast.success("Route removed from history");
    } catch (error) {
      toast.error("Failed to delete route");
    }
  };

  const handleDeleteAll = async () => {
    try {
      await deleteAllRouteHistory();
      setHistory([]);
      toast.success("All routes have been removed");
    } catch (error) {
      toast.error("Failed to clear history");
    }
  };

  const getRiskColor = (score: number) => {
    if (score >= 70) return "bg-risk-low/20 text-risk-low border-risk-low";
    if (score >= 40) return "bg-risk-medium/20 text-risk-medium border-risk-medium";
    return "bg-risk-high/20 text-risk-high border-risk-high";
  };

  const getRiskClass = (score: number) => {
    if (score >= 70) return "low";
    if (score >= 40) return "medium";
    return "high";
  };

  if (authLoading || !isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-4 pt-24 pb-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex items-center justify-between"
        >
          <div>
            <h1 className="text-4xl font-bold mb-2">Route History</h1>
            <p className="text-muted-foreground">
              {history.length} saved route{history.length !== 1 ? "s" : ""}
            </p>
          </div>

          {history.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear All
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all history?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all {history.length} saved routes.
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteAll}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </motion.div>

        {loading ? (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground">Loading history...</p>
          </Card>
        ) : history.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="p-12 text-center">
              <Map className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-bold mb-2">No routes yet</h3>
              <p className="text-muted-foreground mb-6">
                Start exploring and your routes will be saved here
              </p>
              <Button asChild>
                <Link href="/app">Find Routes</Link>
              </Button>
            </Card>
          </motion.div>
        ) : (
          <div className="space-y-4">
            {history.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="p-6 hover:shadow-lg transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-3">
                        <Badge variant="outline">
                          {item.mode === "foot-walking" ? "Walking" : "Cycling"}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={getRiskColor(item.safety_score_best)}
                        >
                          {getRiskClass(item.safety_score_best)} risk
                        </Badge>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">
                            Origin
                          </p>
                          <p className="text-sm font-mono">
                            {item.origin.lat.toFixed(4)}, {item.origin.lng.toFixed(4)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">
                            Destination
                          </p>
                          <p className="text-sm font-mono">
                            {item.destination.lat.toFixed(4)},{" "}
                            {item.destination.lng.toFixed(4)}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-4 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          {new Date(item.created_at).toLocaleDateString()}
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          {Math.round(item.duration_s_best / 60)} min
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <MapPin className="h-4 w-4" />
                          {(item.distance_m_best / 1000).toFixed(2)} km
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-2xl font-bold">
                            {item.safety_score_best.toFixed(1)}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            / 100 Safety Score
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-risk-low to-primary"
                            style={{
                              width: `${item.safety_score_best}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 ml-4">
                      <Button size="sm" variant="outline" asChild>
                        <Link
                          href={`/app?origin=${item.origin.lat},${item.origin.lng}&destination=${item.destination.lat},${item.destination.lng}`}
                        >
                          <Map className="h-4 w-4" />
                        </Link>
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this route?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will remove this route from your history. This
                              action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(item.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
