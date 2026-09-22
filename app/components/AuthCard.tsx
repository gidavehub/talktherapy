"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { signInWithEmail, signInWithGoogle, signUpWithEmail } from "../lib/auth";
import { SPRING_SOFT, SPRING_SNAP } from "./motion/primitives";
import { useAuth } from "./AuthProvider";
import { afterSignIn, safeNext } from "../lib/routing";
import type { AppUser } from "../lib/auth";

type Mode = "sign-in" | "sign-up";

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.24 1.05-3.72 1.05-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.56 6.56 0 0 1 5.46 12c0-.73.14-1.44.38-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.07.56 4.21 1.65l3.16-3.16C17.46 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

function nextParam(): string | null {
  if (typeof window === "undefined") return null;
  return safeNext(new URLSearchParams(window.location.search).get("next"));
}

export default function AuthCard({ mode }: { mode: Mode }) {
  const router = useRouter();
  const { user, profile, ready } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  // Already signed in? Then this page has nothing to offer — send them where
  // they belong instead of asking them to log in again. This was the bug:
  // every "get started" button led here, signed in or not.
  useEffect(() => {
    if (!ready || !user || !profile || busy) return;
    router.replace(afterSignIn(profile, nextParam()));
  }, [ready, user, profile, busy, router]);

  async function withCatch(fn: () => Promise<AppUser>) {
    setBusy(true);
    setError(null);
    try {
      const signedIn = await fn();
      // New accounts meet Talk, who does the onboarding by conversation;
      // everyone else goes home (or back where they were headed).
      router.push(afterSignIn(signedIn, nextParam()));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.replace("Firebase: ", ""));
    } finally {
      setBusy(false);
    }
  }

  const isSignUp = mode === "sign-up";

  return (
    <motion.div
      key={mode}
      initial={{ y: 60, opacity: 0, rotate: isSignUp ? 1.2 : -1.2 }}
      animate={{ y: 0, opacity: 1, rotate: 0 }}
      transition={{ ...SPRING_SOFT, mass: 1 }}
      className="w-full max-w-[440px] rounded-3xl bg-white shadow-[0_30px_80px_-30px_rgba(0,0,0,0.25)] p-6 sm:p-8 md:p-10"
    >
      <motion.p
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ ...SPRING_SOFT, delay: 0.15 }}
        className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]"
      >
        {isSignUp ? "Create your account" : "Welcome back"}
      </motion.p>
      <motion.h1
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...SPRING_SOFT, delay: 0.2 }}
        className="mt-3 text-[32px] md:text-[36px] leading-[1.05] tracking-tight font-medium whitespace-pre-line"
      >
        {isSignUp ? "Start your\nfirst session." : "Continue your\njourney."}
      </motion.h1>

      <motion.button
        type="button"
        disabled={busy}
        onClick={() => withCatch(() => signInWithGoogle("patient"))}
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...SPRING_SOFT, delay: 0.3 }}
        whileHover={{ y: -2, scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        className="mt-7 w-full h-12 rounded-full border border-[var(--border)] flex items-center justify-center gap-3 text-[14px] font-medium hover:bg-black/[.03] transition-colors disabled:opacity-50"
      >
        <GoogleGlyph />
        Continue with Google
      </motion.button>

      <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
        <span className="flex-1 h-px bg-[var(--border)]" />
        Or
        <span className="flex-1 h-px bg-[var(--border)]" />
      </div>

      <motion.form
        onSubmit={(e) => {
          e.preventDefault();
          if (isSignUp) {
            void withCatch(() => signUpWithEmail(email, password, name, "patient"));
          } else {
            void withCatch(() => signInWithEmail(email, password));
          }
        }}
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.07, delayChildren: 0.45 } },
        }}
        className="space-y-3"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {isSignUp ? (
            <motion.input
              key="name"
              type="text"
              required
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              initial={{ height: 0, opacity: 0, y: -20 }}
              animate={{ height: 48, opacity: 1, y: 0 }}
              exit={{ height: 0, opacity: 0, y: -10 }}
              transition={SPRING_SOFT}
              className="w-full h-12 rounded-2xl bg-[var(--background)] border border-[var(--border)] px-4 text-[14px] outline-none focus:border-[var(--accent)] transition-colors"
            />
          ) : null}
        </AnimatePresence>
        <motion.input
          variants={{
            hidden: { x: -28, opacity: 0 },
            show: { x: 0, opacity: 1, transition: SPRING_SOFT },
          }}
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className="w-full h-12 rounded-2xl bg-[var(--background)] border border-[var(--border)] px-4 text-[14px] outline-none focus:border-[var(--accent)] transition-colors"
        />
        <motion.input
          variants={{
            hidden: { x: 28, opacity: 0 },
            show: { x: 0, opacity: 1, transition: SPRING_SOFT },
          }}
          type="password"
          required
          minLength={6}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={isSignUp ? "new-password" : "current-password"}
          className="w-full h-12 rounded-2xl bg-[var(--background)] border border-[var(--border)] px-4 text-[14px] outline-none focus:border-[var(--accent)] transition-colors"
        />

        <AnimatePresence>
          {error ? (
            <motion.p
              key={error}
              initial={{ x: -16, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 16, opacity: 0 }}
              transition={SPRING_SNAP}
              className="text-[13px] text-[var(--accent)] leading-snug"
            >
              {error}
            </motion.p>
          ) : null}
        </AnimatePresence>

        <motion.button
          variants={{
            hidden: { y: 28, opacity: 0 },
            show: { y: 0, opacity: 1, transition: SPRING_SOFT },
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          type="submit"
          disabled={busy}
          className="w-full h-12 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-soft)] text-white text-[12px] uppercase tracking-[0.14em] font-medium flex items-center justify-center gap-3 transition-colors disabled:opacity-60"
        >
          {busy ? "Please wait…" : isSignUp ? "Create Account" : "Sign In"}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </motion.button>
      </motion.form>

      <motion.p
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...SPRING_SOFT, delay: 0.85 }}
        className="mt-6 text-[13px] text-[var(--muted)] text-center"
      >
        {isSignUp ? "Already have an account?" : "New here?"}{" "}
        <Link
          href={isSignUp ? "/sign-in" : "/sign-up"}
          className="text-[var(--foreground)] underline underline-offset-4"
        >
          {isSignUp ? "Sign in" : "Create an account"}
        </Link>
      </motion.p>
    </motion.div>
  );
}
