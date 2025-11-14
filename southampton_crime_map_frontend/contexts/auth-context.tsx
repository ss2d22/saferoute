"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
  getCurrentUser,
  setTokens,
  clearTokens,
  getTokens,
  type AuthTokens,
  type User,
  type LoginPayload,
  type RegisterPayload,
} from "@/lib/api";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    const tokens = getTokens();
    if (tokens) {
      getCurrentUser()
        .then((userData) => {
          setUser(userData);
        })
        .catch(() => {
          clearTokens();
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (payload: LoginPayload) => {
    const tokens: AuthTokens = await apiLogin(payload);
    setTokens(tokens);
    const userData = await getCurrentUser();
    setUser(userData);
  };

  const register = async (payload: RegisterPayload) => {
    const tokens: AuthTokens = await apiRegister(payload);
    setTokens(tokens);
    const userData = await getCurrentUser();
    setUser(userData);
  };

  const logout = async () => {
    try {
      await apiLogout();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      clearTokens();
      setUser(null);
    }
  };

  const refreshUser = async () => {
    const userData = await getCurrentUser();
    setUser(userData);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
