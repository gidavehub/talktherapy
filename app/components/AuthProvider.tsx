"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { watchAuthState, watchUserDoc } from "../lib/auth";
import { initAnalyticsIfSupported } from "../lib/firebase";
import type { AppRole, UserDoc } from "../lib/models";

/**
 * Auth + profile context.
 *
 * Two separate loading flags, because they resolve at different times and
 * conflating them causes flicker: `loading` covers "do we know whether anyone
 * is signed in", `profileLoading` covers "have we fetched their Firestore
 * document". A guard that needs the role must wait for both — see `ready`.
 */
type AuthState = {
  user: User | null;
  profile: UserDoc | null;
  role: AppRole | null;
  loading: boolean;
  profileLoading: boolean;
  /** True once both auth state and (if signed in) the profile have settled. */
  ready: boolean;
  /** Signed in, and a profile document exists. */
  isAuthenticated: boolean;
};

const INITIAL: AuthState = {
  user: null,
  profile: null,
  role: null,
  loading: true,
  profileLoading: false,
  ready: false,
  isAuthenticated: false,
};

const Ctx = createContext<AuthState>(INITIAL);

/**
 * The profile is stored together with the uid it belongs to, rather than
 * alongside a separate boolean. That makes "still loading" a derived value
 * (`loaded.uid !== user.uid`) instead of something an effect has to set
 * synchronously, and it structurally prevents the bug where a previous
 * account's role is briefly readable after switching users.
 */
type LoadedProfile = { uid: string; profile: UserDoc | null };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState<LoadedProfile | null>(null);

  useEffect(() => {
    initAnalyticsIfSupported();
    return watchAuthState((nextUser) => {
      setUser(nextUser);
      setLoading(false);
      if (!nextUser) setLoaded(null);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    return watchUserDoc(uid, (profile) => setLoaded({ uid, profile }));
  }, [user]);

  const value = useMemo<AuthState>(() => {
    const profile = loaded && user && loaded.uid === user.uid ? loaded.profile : null;
    const profileLoading = Boolean(user) && loaded?.uid !== user?.uid;
    const ready = !loading && (!user || !profileLoading);

    return {
      user,
      profile,
      role: profile?.role ?? null,
      loading,
      profileLoading,
      ready,
      isAuthenticated: Boolean(user && profile),
    };
  }, [user, loaded, loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}

/** Convenience for role checks that would otherwise repeat the null handling. */
export function useRole() {
  const { role, profile, ready } = useAuth();
  return {
    role,
    ready,
    isPatient: role === "patient",
    isCounsellor: role === "counsellor",
    /** A counsellor who has cleared credential review. */
    isVerifiedCounsellor: role === "counsellor" && Boolean(profile?.verified),
    isAdmin: role === "admin",
    isOrgAdmin: role === "org_admin",
  };
}
