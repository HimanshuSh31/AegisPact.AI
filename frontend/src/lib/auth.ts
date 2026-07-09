"use client";

import { useState, useEffect, useCallback } from "react";
import { authApi, TokenStore, type User } from "./api";

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface UseAuth extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    full_name: string;
    organization_name: string;
  }) => Promise<void>;
  logout: () => void;
  error: string | null;
  clearError: () => void;
}

export function useAuth(): UseAuth {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isLoading: true,
    isAuthenticated: false,
  });
  const [error, setError] = useState<string | null>(null);

  // Restore session from localStorage on mount
  useEffect(() => {
    const token = TokenStore.get();
    if (token) {
      setState({
        user: null,
        token,
        isLoading: false,
        isAuthenticated: true,
      });
    } else {
      setState((s) => ({ ...s, isLoading: false }));
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const tokenRes = await authApi.login(email, password);
      TokenStore.set(tokenRes.access_token);
      setState({
        user: null,
        token: tokenRes.access_token,
        isLoading: false,
        isAuthenticated: true,
      });
    } catch (err: any) {
      setError(err?.message || "Login failed. Check your credentials.");
      throw err;
    }
  }, []);

  const register = useCallback(
    async (data: {
      email: string;
      password: string;
      full_name: string;
      organization_name: string;
    }) => {
      setError(null);
      try {
        await authApi.register(data);
        // Auto-login after successful registration
        await login(data.email, data.password);
      } catch (err: any) {
        setError(err?.message || "Registration failed. Please try again.");
        throw err;
      }
    },
    [login]
  );

  const logout = useCallback(() => {
    TokenStore.clear();
    setState({ user: null, token: null, isLoading: false, isAuthenticated: false });
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { ...state, login, register, logout, error, clearError };
}
