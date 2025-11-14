"use client";

import { useEffect, useState } from "react";
import { useRouter } from 'next/navigation';
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
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
import { getUserSettings, updateUserSettings, deleteAccount, type UserSettings } from "@/lib/api";
import { Settings, AlertTriangle, Loader2 } from 'lucide-react';
import { motion } from "framer-motion";

export default function SettingsPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [settings, setSettings] = useState<UserSettings>({
    save_history: true,
    default_mode: "foot-walking",
    safety_preferences: {
      lookback_months: 12,
      time_of_day_sensitive: true,
    },
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/auth/login");
    }
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    if (isAuthenticated) {
      loadSettings();
    }
  }, [isAuthenticated]);

  const loadSettings = async () => {
    try {
      const data = await getUserSettings();
      setSettings({
        ...data,
        safety_preferences: data.safety_preferences || {
          lookback_months: 12,
          time_of_day_sensitive: true,
        },
      });
    } catch (error) {
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateUserSettings(settings);
      toast.success("Your preferences have been updated");
    } catch (error) {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      toast.error("Please enter your password to confirm");
      return;
    }

    setDeleting(true);
    try {
      await deleteAccount(deletePassword);
      toast.success("Your account has been permanently deleted");
      await logout();
      router.push("/");
    } catch (error) {
      toast.error("Failed to delete account. Check your password.");
    } finally {
      setDeleting(false);
    }
  };

  if (authLoading || !isAuthenticated || loading) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-4 pt-24 pb-12 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-bold mb-2">Settings</h1>
          <p className="text-muted-foreground">
            Manage your account and preferences
          </p>
        </motion.div>

        <div className="space-y-6">
          {/* Account Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card>
              <CardHeader>
                <CardTitle>Account Information</CardTitle>
                <CardDescription>Your SafeRoute account details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Email</Label>
                  <Input value={user?.email || ""} disabled />
                </div>
                <div>
                  <Label>Member Since</Label>
                  <Input
                    value={
                      user?.created_at
                        ? new Date(user.created_at).toLocaleDateString()
                        : ""
                    }
                    disabled
                  />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Route Preferences */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card>
              <CardHeader>
                <CardTitle>Route Preferences</CardTitle>
                <CardDescription>
                  Customize your routing experience
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Save Route History</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically save routes you search
                    </p>
                  </div>
                  <Switch
                    checked={settings.save_history}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, save_history: checked })
                    }
                  />
                </div>

                <div>
                  <Label>Default Travel Mode</Label>
                  <Select
                    value={settings.default_mode}
                    onValueChange={(value: any) =>
                      setSettings({ ...settings, default_mode: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="foot-walking">Walking</SelectItem>
                      <SelectItem value="cycling-regular">Cycling</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Safety Preferences */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card>
              <CardHeader>
                <CardTitle>Safety Preferences</CardTitle>
                <CardDescription>
                  Adjust how safety is calculated
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label>
                    Lookback Months: {settings.safety_preferences?.lookback_months ?? 12}
                  </Label>
                  <p className="text-sm text-muted-foreground mb-2">
                    How many months of crime data to analyze
                  </p>
                  <Slider
                    value={[settings.safety_preferences?.lookback_months ?? 12]}
                    onValueChange={(value) =>
                      setSettings({
                        ...settings,
                        safety_preferences: {
                          ...(settings.safety_preferences || {}),
                          lookback_months: value[0],
                        },
                      })
                    }
                    min={3}
                    max={24}
                    step={1}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Time-of-Day Sensitivity</Label>
                    <p className="text-sm text-muted-foreground">
                      Weight crimes based on when you travel
                    </p>
                  </div>
                  <Switch
                    checked={settings.safety_preferences?.time_of_day_sensitive ?? true}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        safety_preferences: {
                          ...(settings.safety_preferences || {}),
                          time_of_day_sensitive: checked,
                        },
                      })
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Save Button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Settings className="mr-2 h-4 w-4" />
                  Save Settings
                </>
              )}
            </Button>
          </motion.div>

          {/* Danger Zone */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Danger Zone
                </CardTitle>
                <CardDescription>
                  Irreversible actions for your account
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full">
                      Delete Account
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete
                        your account and remove all your data from our servers.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="my-4">
                      <Label htmlFor="confirm-password">
                        Enter your password to confirm
                      </Label>
                      <Input
                        id="confirm-password"
                        type="password"
                        placeholder="Your password"
                        value={deletePassword}
                        onChange={(e) => setDeletePassword(e.target.value)}
                      />
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDeleteAccount}
                        disabled={deleting}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {deleting ? "Deleting..." : "Delete Account"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
