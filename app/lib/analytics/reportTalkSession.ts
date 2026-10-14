"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { AiTierId } from "../models";
import type { Language, Risk } from "../ai/protocol";
import type { TalkKind, TalkMode, TalkRisk } from "../adminStatsCore";
import { ANALYTICS_ON, FUNCTIONS_BASE, randomId } from "./shared";

/**
 * Tells the staff numbers that a conversation with TALK began and how it went
 * — how long, how many turns, spoken or typed, in which language, whether it
 * reached its end — and never a word of what was said.
 *
 * The recordTalkSession function stores it with no uid (see
 * functions/src/adminStats.ts). This hook reports the start, the end — when
 * the conversation stops or the page moves on — and, as best it can, a page
 * closed mid-conversation: a keepalive request on `pagehide`, the one moment
 * a closing page still gets to send something.
 *
 * Calls the function over plain fetch rather than the callable SDK, because
 * the closing page's request must be `keepalive`, which the SDK cannot ask
 * for. Same wire format: `{ data }` in, with the person's ID token. Only that
 * one request is `keepalive`: some browsers refuse a keepalive request that
 * needs a CORS preflight, as this one does, and the ordinary end of a
 * conversation must not be lost to that.
 *
 * The page keeps one transcript and one "highest risk" for its whole life, so
 * a second conversation on the same page would inherit the first one's. Each
 * conversation's turns, safety flag and danger level are therefore counted
 * from where they stood when it began: a level is reported only when it rose
 * during this conversation.
 */

export type TalkSessionInput = {
  getToken: () => Promise<string | null>;
  /** A signed-in patient. Staff and providers never talk to TALK here. */
  enabled: boolean;
  active: boolean;
  kind: TalkKind;
  tier: AiTierId;
  language: Language | null;
  /** How many times the person has spoken, typed or tapped an answer on this page so far. */
  turns: number;
  /** The microphone was refused, so every turn was typed. */
  textOnly: boolean;
  /** TALK has everything she needs from the intake. */
  intakeDone: boolean;
  /** TALK has introduced the providers who fit. */
  matched: boolean;
  /** A paid conversation is held. */
  paid: boolean;
  /**
   * What the conversation touched, from the fixed list of concerns — never
   * their words. Getting to know somebody, it is the concerns TALK heard;
   * any other time, the topics she tagged this conversation's turns with.
   * Both are given because a finished intake turns the page to companion
   * mid-conversation, and the kind a conversation began as is what counts.
   */
  concerns: readonly string[];
  topics: readonly string[];
  /** Anything on this page so far suggested danger. */
  safetyFlagged: boolean;
  /** The highest safety level TALK has rated anything on this page so far. */
  risk: Risk;
};

type Session = {
  id: string;
  startedAt: number;
  /** Fixed when it starts: finishing the intake flips the page to companion mid-conversation. */
  kind: TalkKind;
  tier: AiTierId;
  /** The page's turn count, whether it was already flagged, and its highest risk, when this conversation began. */
  turnsBefore: number;
  flaggedBefore: boolean;
  riskBefore: Risk;
  /** Turns sent from the keyboard or by tapping an answer — not out loud. */
  typed: number;
  token: string | null;
};

const ENDPOINT = `${FUNCTIONS_BASE}/recordTalkSession`;
/** ID tokens last an hour; a conversation is half that at most. */
const TOKEN_REFRESH_MS = 10 * 60_000;

function post(token: string | null, data: Record<string, unknown>, keepalive = false): Promise<void> {
  if (!token) return Promise.resolve();
  return fetch(ENDPOINT, {
    method: "POST",
    keepalive,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  }).then(
    () => undefined,
    // Counting a conversation must never interrupt one.
    () => undefined,
  );
}

const RISK_RANK: Record<Risk, number> = { none: 0, low: 1, elevated: 2, urgent: 3 };

function topicsOf(kind: TalkKind, input: TalkSessionInput): string[] {
  return [...(kind === "intake" ? input.concerns : input.topics)];
}

/** The danger level this conversation reached, when it rose past where the page stood as it began. */
function riskReached(now: Risk, before: Risk): TalkRisk | null {
  if (RISK_RANK[now] <= RISK_RANK[before]) return null;
  return now === "elevated" || now === "urgent" ? now : null;
}

function modeOf(turns: number, typed: number, textOnly: boolean): TalkMode | null {
  // Tapping the language adds no line, so `typed` can run ahead of `turns`.
  if (turns === 0) return null;
  if (textOnly || typed >= turns) return "typed";
  return typed === 0 ? "voice" : "mixed";
}

/**
 * The end report. `inApp` is false when the page is being closed: a
 * companion conversation counts as completed only when it was ended in the
 * app after at least one turn, an intake only when TALK reached its end.
 */
function endReport(session: Session, now: TalkSessionInput, inApp: boolean) {
  const turns = Math.max(0, now.turns - session.turnsBefore);
  return {
    id: session.id,
    phase: "end",
    kind: session.kind,
    tier: session.tier,
    language: now.language,
    elapsedSec: Math.round((Date.now() - session.startedAt) / 1000),
    turns,
    mode: modeOf(turns, session.typed, now.textOnly),
    completed: session.kind === "intake" ? now.intakeDone : inApp && turns > 0,
    matched: now.matched,
    paid: now.paid,
    topics: topicsOf(session.kind, now),
    safetyFlagged: now.safetyFlagged && !session.flaggedBefore,
    risk: riskReached(now.risk, session.riskBefore),
  };
}

/**
 * Report this page's TALK conversation. Call `typed()` for each message sent
 * from the keyboard and each answer tapped, so spoken and typed can be told
 * apart.
 */
export function useTalkSessionReport(input: TalkSessionInput): { typed: () => void } {
  // The latest values, read when a report is sent — never during render. A
  // layout effect, so it is current before the effect below cleans up: the
  // render that ends a conversation is the one whose figures the end reports.
  const latest = useRef(input);
  useLayoutEffect(() => {
    latest.current = input;
  });
  const session = useRef<Session | null>(null);

  const { active, enabled } = input;
  useEffect(() => {
    if (!ANALYTICS_ON || !enabled || !active) return;
    const start = latest.current;
    const s: Session = {
      id: randomId(),
      startedAt: Date.now(),
      kind: start.kind,
      tier: start.tier,
      turnsBefore: start.turns,
      flaggedBefore: start.safetyFlagged,
      riskBefore: start.risk,
      typed: 0,
      token: null,
    };
    session.current = s;

    const refresh = () =>
      latest.current
        .getToken()
        .then((token) => {
          s.token = token ?? s.token;
        })
        .catch(() => {});
    const ready = refresh().then(() =>
      post(s.token, {
        id: s.id,
        phase: "start",
        kind: s.kind,
        tier: s.tier,
        language: start.language,
        paid: start.paid,
        topics: topicsOf(s.kind, start),
        safetyFlagged: false,
      }),
    );
    const timer = setInterval(() => void refresh(), TOKEN_REFRESH_MS);
    const closing = () => void post(s.token, endReport(s, latest.current, false), true);
    window.addEventListener("pagehide", closing);

    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", closing);
      if (session.current === s) session.current = null;
      // Read now: by the time the start's request has settled, `latest` may
      // already belong to the next conversation.
      const end = endReport(s, latest.current, true);
      void ready.then(() => post(s.token, end));
    };
  }, [active, enabled]);

  const typed = useCallback(() => {
    if (session.current) session.current.typed += 1;
  }, []);
  return { typed };
}
