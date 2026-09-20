"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_SOFT } from "../motion/primitives";

/**
 * Toasts.
 *
 * Slides in from the right rather than fading, per the motion rules at the top
 * of `motion/primitives.tsx`. Mounted once in the root layout; call `useToast()`
 * anywhere below it.
 *
 * Deliberately capped and auto-dismissed — a mental-health app should not be
 * stacking six notifications over someone's journal.
 */

type ToastTone = "info" | "success" | "warning" | "error";

type Toast = {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
};

type ToastApi = {
  toast: (input: Omit<Toast, "id">) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  dismiss: (id: number) => void;
};

const Ctx = createContext<ToastApi | null>(null);

const MAX_VISIBLE = 3;
const DISMISS_MS = 5000;

const TONES: Record<ToastTone, string> = {
  info: "bg-[var(--dark)] text-white",
  success: "bg-[var(--success)] text-white",
  warning: "bg-[var(--warning)] text-white",
  error: "bg-[var(--danger)] text-white",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  // Timers are tracked so a manual dismiss cancels the pending auto-dismiss
  // rather than leaving it to fire against an id that no longer exists.
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (input: Omit<Toast, "id">) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { ...input, id }].slice(-MAX_VISIBLE));
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DISMISS_MS),
      );
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (title, description) => toast({ tone: "success", title, description }),
      error: (title, description) => toast({ tone: "error", title, description }),
      dismiss,
    }),
    [toast, dismiss],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed z-[60] bottom-4 right-4 left-4 md:left-auto md:w-[380px] flex flex-col gap-2 pointer-events-none"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ x: 60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 60, opacity: 0 }}
              transition={SPRING_SOFT}
              className={`pointer-events-auto rounded-2xl px-5 py-4 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.4)] ${TONES[t.tone]}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium leading-snug">{t.title}</p>
                  {t.description ? (
                    <p className="mt-1 text-[12px] leading-relaxed text-white/80">
                      {t.description}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss"
                  className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return ctx;
}
