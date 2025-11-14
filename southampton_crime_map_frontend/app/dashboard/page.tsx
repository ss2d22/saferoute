"use client";

import { useEffect, useState } from "react";
import { useRouter } from 'next/navigation';
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/auth-context";
import { getRouteHistory, type RouteHistoryItem } from "@/lib/api";
import { Map, History, Settings, TrendingUp, Shield } from 'lucide-react';
import { motion } from "framer-motion";

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
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
      const response = await getRouteHistory({ limit: 10 });
      setHistory(response.items || []);
    } catch (error) {
      console.error("Failed to load history:", error);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || !isAuthenticated) {
    return null;
  }

  const avgSafetyScore =
    history.length > 0
      ? history.reduce((acc, item) => acc + (item.safety_score_best || 0), 0) / history.length
      : 0;

  const getRiskColor = (score: number) => {
    if (score >= 70) return "text-risk-low";
    if (score >= 40) return "text-risk-medium";
    return "text-risk-high";
  };

  const getRiskClass = (score: number) => {
    if (score >= 70) return "low";
    if (score >= 40) return "medium";
    return "high";
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-4 pt-24 pb-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-bold mb-2">Welcome back!</h1>
          <p className="text-muted-foreground">{user?.email}</p>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Routes
                </CardTitle>
                <Map className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{history.length}</div>
                <p className="text-xs text-muted-foreground">
                  Routes in your history
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Avg Safety Score
                </CardTitle>
                <Shield className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {avgSafetyScore.toFixed(1)}
                  <span className="text-sm text-muted-foreground">/100</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Average of last {Math.min(history.length, 10)} routes
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  Safety Trend
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="h-12 flex items-end gap-1">
                  {history.slice(0, 10).reverse().map((item, index) => (
                    <div
                      key={index}
                      className="flex-1 bg-primary rounded-t"
                      style={{
                        height: `${(item.safety_score_best / 100) * 100}%`,
                        opacity: 0.5 + (index / 20),
                      }}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Last 10 routes
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardHeader>
                <Map className="h-8 w-8 text-primary mb-2" />
                <CardTitle>Open Map</CardTitle>
                <CardDescription>
                  Find safe routes in your city
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="w-full">
                  <Link href="/app">Go to Map</Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardHeader>
                <History className="h-8 w-8 text-primary mb-2" />
                <CardTitle>Route History</CardTitle>
                <CardDescription>
                  View and manage saved routes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/history">View History</Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardHeader>
                <Settings className="h-8 w-8 text-primary mb-2" />
                <CardTitle>Settings</CardTitle>
                <CardDescription>
                  Manage preferences and account
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/settings">Edit Settings</Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Recent Routes */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Recent Routes</CardTitle>
              <CardDescription>Your last few saved routes</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-center text-muted-foreground py-8">
                  Loading...
                </p>
              ) : history.length === 0 ? (
                <div className="text-center py-8">
                  <Map className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-muted-foreground mb-4">
                    No routes yet. Start exploring!
                  </p>
                  <Button asChild>
                    <Link href="/app">Find Routes</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {history.slice(0, 5).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">
                            {item.mode === "foot-walking" ? "Walking" : "Cycling"}
                          </span>
                          <span
                            className={`text-sm font-medium ${getRiskColor(
                              item.safety_score_best
                            )}`}
                          >
                            {getRiskClass(item.safety_score_best)}
                          </span>
                        </div>
                        <div className="flex gap-4 text-sm text-muted-foreground">
                          <span>
                            Safety: {item.safety_score_best.toFixed(1)}/100
                          </span>
                          <span>
                            {(item.distance_m_best / 1000).toFixed(2)} km
                          </span>
                          <span>{Math.round(item.duration_s_best / 60)} min</span>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(item.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
