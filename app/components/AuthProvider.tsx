"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { watchAuthState } from "../lib/auth";
import { initAnalyticsIfSupported } from "../lib/firebase";

type AuthState = {
  user: User | null;
  loading: boolean;
};

const Ctx = createContext<AuthState>({ user: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  useEffect(() => {
    initAnalyticsIfSupported();
    const unsub = watchAuthState((user) => {
      setState({ user, loading: false });
    });
    return unsub;
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
