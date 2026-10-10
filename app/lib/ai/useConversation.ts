"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioLevel } from "../audio/useAudioLevel";
import { UtteranceCapture } from "../audio/capture";
import { StreamPlayer } from "../audio/player";
import type { AudioFeed } from "../audio/analysis";
import type { BlobState } from "../../components/voice/TalkBlob";
import { EMPTY_INTAKE, missingFields, type Intake } from "../matching";
import {
  FOLD_TURNS,
  LANGUAGE_ALIASES,
  LANGUAGE_CHOICES,
  MAX_HISTORY_TURNS,
  type Choice,
  type ConversationMode,
  type HistoryTurn,
  type Language,
  type Risk,
  type TurnEvent,
} from "./protocol";
import { COMPANION } from "./endpoints";
import { matchChoice } from "./choiceMatch";

/**
 * The voice conversation, end to end, on the client.
 *
 *   (greeting) ─► listening ──(speech)──► hearing ──(pause)──► thinking ──► speaking ──┐
 *                    ▲                                                               │
 *                    └───────────────────────────────────────────────────────────────┘
 *
 * Turn-based on purpose: the microphone stays open (so the blob keeps
 * reacting) but utterances are only captured while listening. Tapping while
 * Talk is thinking or speaking interrupts her and hands the floor back.
 *
 * In intake mode this IS the onboarding: Talk speaks first, every turn
 * carries what she has learned so far, and once she has everything she needs
 * `onIntakeDone` fires after she finishes her closing line.
 */

export type Phase = "idle" | "starting" | "listening" | "hearing" | "thinking" | "speaking";

export type Line = {
  id: number;
  role: "user" | "talk";
  text: string;
  /** English rendering when `text` is in another language. */
  english?: string;
  language?: Language;
};

export type ConversationError =
  | { kind: "auth"; message: string }
  /** The consultation is not paid for — or the browser's token predates the payment. */
  | { kind: "payment"; message: string }
  | { kind: "busy"; message: string }
  | { kind: "failed"; message: string }
  | { kind: "voice"; message: string };

type Options = {
  getToken: () => Promise<string | null>;
  mode?: ConversationMode;
  /** Intake mode: what is already known (resuming a half-finished intake). */
  initialIntake?: Intake | null;
  displayName?: string | null;
  /** Intake mode: fires after every turn that learned something. Persist it here. */
  onIntake?: (intake: Intake) => void;
  /** Intake mode: fires once Talk has everything and has finished speaking. */
  onIntakeDone?: (intake: Intake) => void;
  /**
   * An option was chosen OUT LOUD. The page decides what choosing it means —
   * the same handler a tap goes through, so saying an option and tapping it
   * can never do different things.
   */
  onChoiceHeard?: (choice: Choice) => void;
  /**
   * Whether they have already heard and agreed to the consent. When false,
   * Talk says it — after the language, before the first question — and waits
   * for a yes, spoken or tapped.
   */
  consented?: boolean;
  /** They said yes. Record it; this hook only reports it. */
  onConsent?: (consent: { how: "spoken" | "tapped"; version: string | null; language: Language | null }) => void;
};

/**
 * What a turn heard that the client has to act on once that turn's stream has
 * ended. Acting mid-stream would start a second request while the first one's
 * reply was still arriving.
 */
type Heard = { kind: "language"; language: Language } | { kind: "choice"; choice: Choice };

const RISK_RANK: Record<Risk, number> = { none: 0, low: 1, elevated: 2, urgent: 3 };
/** Pause after Talk stops before listening again, so her tail is not heard. */
const AFTER_SPEAKING_MS = 250;

let lineId = 0;

export function useConversation({
  getToken,
  mode = "companion",
  initialIntake = null,
  displayName = null,
  onIntake,
  onIntakeDone,
  onChoiceHeard,
  consented,
  onConsent,
}: Options) {
  const mic = useAudioLevel();
  // The hook returns a fresh object every render; its functions are stable.
  // Depending on `mic` itself would re-create stop() each render, and the
  // unmount effect below would then end the session on every render.
  const { start: micStart, stop: micStop, graph: micGraph } = mic;
  const [phase, setPhase] = useState<Phase>("idle");
  const [lines, setLines] = useState<Line[]>([]);
  /** Highest risk seen this session. Sticky: help stays on screen once needed. */
  const [risk, setRisk] = useState<Risk>("none");
  const [heardLanguage, setLanguage] = useState<Language | null>(null);
  const [error, setError] = useState<ConversationError | null>(null);
  const [talkFeed, setTalkFeed] = useState<AudioFeed | null>(null);
  /** The microphone was refused: Talk still speaks, the person types. */
  const [textOnly, setTextOnly] = useState(false);
  // What this session has learned. Until the first turn returns, the saved
  // intake from the profile stands in — derived, not copied, so a profile
  // that loads after mount needs no effect to sync it.
  const [sessionIntake, setIntake] = useState<Intake | null>(null);
  /** Options for the question Talk just asked, shown as buttons. */
  const [choices, setChoices] = useState<Choice[]>([]);
  const [awaitingLanguage, setAwaitingLanguage] = useState(false);
  const awaitingLanguageRef = useRef(false);
  /** Talk has spoken the consent and is waiting for a yes. */
  const [awaitingConsent, setAwaitingConsent] = useState(false);
  const awaitingConsentRef = useRef(false);
  /** Agreed this session — so a later greeting does not ask again. */
  const consentedRef = useRef(false);
  /**
   * The page has silenced the microphone (it is reading something aloud). A
   * line of Talk's ending must not switch it back on underneath.
   */
  const mutedRef = useRef(false);
  /**
   * The options on screen right now — the question that was just asked. Kept
   * in a ref beside the state so a turn's answer is matched against what was
   * actually shown, not against a render that has not happened yet.
   */
  const choicesRef = useRef<Choice[]>([]);
  const intake = sessionIntake ?? initialIntake ?? EMPTY_INTAKE;
  const language = heardLanguage ?? intake.language;

  const phaseRef = useRef<Phase>("idle");
  const activeRef = useRef(false);
  const captureRef = useRef<UtteranceCapture | null>(null);
  const playerRef = useRef<StreamPlayer | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const historyRef = useRef<HistoryTurn[]>([]);
  const summaryRef = useRef("");
  const foldingRef = useRef(false);
  const intakeRef = useRef<Intake>(initialIntake ?? EMPTY_INTAKE);
  const doneRef = useRef(false);
  /** When this conversation began — the intake has eight minutes. */
  const startedAtRef = useRef(0);
  /**
   * How fast this person speaks, averaged over their turns. Each utterance
   * gives a duration and the transcript gives the words, so their pace is
   * free; Talk is then spoken back at it.
   */
  const paceRef = useRef<number | null>(null);
  const lastUtteranceSec = useRef(0);
  const rafRef = useRef(0);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest callbacks and settings, read at call time so the session never
  // needs rebuilding when the page re-renders with new closures.
  const opts = useRef({
    getToken,
    mode,
    displayName,
    onIntake,
    onIntakeDone,
    onChoiceHeard,
    intake,
    consented,
    onConsent,
  });

  useEffect(() => {
    opts.current = {
      getToken,
      mode,
      displayName,
      onIntake,
      onIntakeDone,
      onChoiceHeard,
      intake,
      consented,
      onConsent,
    };
  }, [getToken, mode, displayName, onIntake, onIntakeDone, onChoiceHeard, intake, consented, onConsent]);

  /** Spoken consent is on file, or was given in this session. */
  const hasConsent = useCallback(() => consentedRef.current || opts.current.consented !== false, []);

  const go = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const listen = useCallback(() => {
    if (!activeRef.current) return;
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = null;
    captureRef.current?.setEnabled(!mutedRef.current);
    go("listening");
  }, [go]);

  /** Talk has finished a line: listen again — or, if the intake is done, hand over. */
  const afterSpeaking = useCallback(() => {
    if (doneRef.current) {
      opts.current.onIntakeDone?.(intakeRef.current);
      return;
    }
    listen();
  }, [listen]);

  const authHeader = useCallback(async (): Promise<Record<string, string>> => {
    const token = await opts.current.getToken().catch(() => null);
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  /** Fold the oldest turns into the summary, in the background. */
  const maybeFold = useCallback(async () => {
    if (foldingRef.current || historyRef.current.length <= MAX_HISTORY_TURNS) return;
    foldingRef.current = true;
    const folded = historyRef.current.slice(0, FOLD_TURNS);
    try {
      const res = await fetch(COMPANION.summarize, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ summary: summaryRef.current, turns: folded }),
      });
      if (res.ok) {
        const { summary } = (await res.json()) as { summary: string };
        summaryRef.current = summary;
        historyRef.current = historyRef.current.filter((t) => !folded.includes(t));
      }
    } catch {
      // Keep the turns; the server only sends the newest window anyway.
    } finally {
      foldingRef.current = false;
    }
  }, [authHeader]);

  /**
   * One request that makes Talk speak — a turn or the greeting. Streams the
   * words, then her voice, then hands the floor back.
   */
  const speakRequest = useCallback(
    async (
      path: string,
      body: Record<string, unknown>,
      /**
       * This turn carries an option already chosen — tapped, or heard and
       * resolved. Its own reply is never matched against the options again:
       * that is what would loop.
       */
      { answered = false }: { answered?: boolean } = {},
    ) => {
      if (!activeRef.current) return;
      captureRef.current?.setEnabled(false);
      go("thinking");
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;
      const player = playerRef.current;
      let replied = false;
      let speaking = false;
      // Set inside the event handler, read after the stream. A holder rather
      // than a `let`, because TypeScript cannot see a closure assign it.
      const result: { heard: Heard | null } = { heard: null };

      try {
        const res = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeader()) },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const payload = (await res.json().catch(() => ({}))) as { error?: string };
          if (res.status === 401) {
            setError({ kind: "auth", message: payload.error ?? "Sign in to talk to Talk." });
            return; // the auth effect below ends the session
          }
          if (res.status === 402) {
            // Ends the session too: nothing will succeed until it is paid for,
            // and the page knows how to sort that out.
            setError({ kind: "payment", message: payload.error ?? "Your consultation has not been paid for yet." });
            return;
          }
          setError({
            kind: res.status === 429 ? "busy" : "failed",
            message: payload.error ?? "Talk couldn't respond just then. Please try again.",
          });
          listen();
          return;
        }

        const handle = (ev: TurnEvent) => {
          if (ev.type === "turn") {
            if (!ev.transcript && !ev.blocked && !ev.greeting) return; // nothing intelligible was said
            const lang = ev.language === "none" ? undefined : ev.language;

            // ---- Was an option on screen just answered out loud? ----------
            //
            // Many people using Talk cannot read the buttons, so whatever they
            // SAY has to land on the right one. When it does, the server's own
            // reply to this turn is set aside — it was a reply to an answer it
            // did not understand — and the choice is acted on once this stream
            // has ended.
            const asked = choicesRef.current;
            const wasAwaitingLanguage = awaitingLanguageRef.current;
            const before = intakeRef.current;
            let setAside = false;
            // A reply about danger is NEVER set aside, whatever else was
            // heard: it carries the emergency numbers, and somebody who
            // cannot read the panel on screen only has her voice.
            const mayActHere =
              !answered &&
              !ev.greeting &&
              !ev.blocked &&
              Boolean(ev.transcript) &&
              RISK_RANK[ev.risk] < RISK_RANK.elevated &&
              // The consent is the server's to read: it has its own schema.
              !awaitingConsentRef.current;

            if (mayActHere) {
              if (wasAwaitingLanguage && !ev.intake?.language) {
                // The language question. Saying "Fula" must do exactly what
                // tapping Fula does — and the model hears that English word as
                // English, so this cannot be left to it. Anything that is not
                // plainly a language is left to the server, whose reply asks
                // again with the buttons still there.
                const m = matchChoice(ev.transcript, LANGUAGE_CHOICES, LANGUAGE_ALIASES);
                if (m.kind === "one") {
                  result.heard = { kind: "language", language: m.choice.id as Language };
                  setAside = true;
                }
              } else if (asked.length && !wasAwaitingLanguage) {
                // Any other question. Only when the server learned nothing for
                // it — otherwise acting here as well would answer it twice and
                // skip the next question.
                const learnedNothing = missingFields(before)[0] === missingFields(ev.intake ?? before)[0];
                if (learnedNothing) {
                  const m = matchChoice(ev.transcript, asked);
                  if (m.kind === "one") {
                    result.heard = { kind: "choice", choice: m.choice };
                    setAside = true;
                  }
                }
              }
            }

            const heard: Line[] = ev.transcript
              ? [
                  {
                    id: ++lineId,
                    role: "user",
                    text: ev.transcript,
                    english: lang && lang !== "english" ? ev.english : undefined,
                    language: lang,
                  },
                ]
              : [];
            const said: Line[] = ev.reply
              ? [
                  {
                    id: ++lineId,
                    role: "talk",
                    text: ev.reply,
                    english: lang && lang !== "english" ? ev.replyEnglish : undefined,
                    language: lang,
                  },
                ]
              : [];
            // Their words always show. Talk's set-aside reply does not: it
            // answered something she misunderstood.
            setLines((prev) => [...prev, ...heard, ...(setAside ? [] : said)]);
            setRisk((prev) => (RISK_RANK[ev.risk] > RISK_RANK[prev] ? ev.risk : prev));

            if (ev.intake) {
              intakeRef.current = ev.intake;
              setIntake(ev.intake);
              if (ev.intake.language) setLanguage(ev.intake.language);
              if (ev.transcript) opts.current.onIntake?.(ev.intake);
            } else if (lang) {
              setLanguage(lang);
            }
            if (ev.intakeComplete) doneRef.current = true;
            if (ev.consentGranted === "yes" && !consentedRef.current) {
              consentedRef.current = true;
              opts.current.onConsent?.({
                how: answered ? "tapped" : "spoken",
                version: ev.consentVersion ?? null,
                language: intakeRef.current.language,
              });
            }
            if (!setAside) {
              const next = ev.choices ?? [];
              setChoices(next);
              choicesRef.current = next;
              setAwaitingLanguage(Boolean(ev.awaitingLanguage));
              awaitingLanguageRef.current = Boolean(ev.awaitingLanguage);
              setAwaitingConsent(Boolean(ev.awaitingConsent));
              awaitingConsentRef.current = Boolean(ev.awaitingConsent);
            } else {
              // The buttons go while the answer is acted on; the next turn
              // brings the next question's.
              setChoices([]);
              choicesRef.current = [];
            }
            if (ev.speechRate && player) player.setRate(ev.speechRate);

            // Their pace: the words they just said against how long it took.
            if (ev.transcript && lastUtteranceSec.current > 0.8) {
              const words = ev.transcript.trim().split(/[ ]+/).length;
              const wpm = (words / lastUtteranceSec.current) * 60;
              if (wpm > 40 && wpm < 320) {
                paceRef.current = paceRef.current ? paceRef.current * 0.6 + wpm * 0.4 : wpm;
              }
            }

            if (ev.transcript) {
              historyRef.current.push({ role: "user", text: ev.transcript, english: ev.english, language: lang });
            }
            if (ev.reply && !setAside) {
              // The greeting is remembered too, so Talk knows what she asked.
              historyRef.current.push({ role: "talk", text: ev.reply, english: ev.replyEnglish, language: lang });
            }
            // A set-aside reply is never begun, so `replied` stays false and
            // its audio — already on its way — is dropped as it arrives.
            if (ev.reply && player && !setAside) {
              replied = true;
              player.begin(() => {
                if (phaseRef.current !== "speaking") return;
                resumeTimer.current = setTimeout(afterSpeaking, AFTER_SPEAKING_MS);
              });
            }
          } else if (ev.type === "audio" && player && replied) {
            if (!speaking) {
              speaking = true;
              go("speaking");
            }
            player.push(ev.pcm, ev.sampleRate);
          } else if (ev.type === "error") {
            setError({ kind: ev.stage === "voice" ? "voice" : "failed", message: ev.message });
          }
        };

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        read: for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (line) handle(JSON.parse(line) as TurnEvent);
            // Answered out loud: stop here. The rest of this stream is the
            // voice of a reply nobody will hear — waiting for it left a long
            // "Thinking…" in which a tap or a dropped line lost the answer.
            if (result.heard) break read;
          }
        }

        if (result.heard) {
          // Closing the request also tells the server to stop synthesising.
          controller.abort();
          if (abortRef.current === controller) abortRef.current = null;
          void maybeFold();
          return result.heard;
        }

        if (replied && player) {
          // Voice may have failed entirely; end() then finishes at once and
          // the words stay on screen.
          if (!speaking) go("speaking");
          player.end();
        } else {
          afterSpeaking();
        }
        void maybeFold();
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        setError({ kind: "failed", message: "Talk couldn't be reached. Check your connection and try again." });
        player?.stop();
        listen();
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [afterSpeaking, authHeader, go, listen, maybeFold],
  );

  const turnBody = useCallback(
    (message: { audio: string } | { text: string }) => ({
      ...message,
      history: historyRef.current,
      summary: summaryRef.current,
      mode: opts.current.mode,
      // In every mode, not only the intake. The server's safety rules for
      // somebody under 18 read it — and most returning people, a child in
      // danger among them, are in companion mode.
      intake: intakeRef.current,
      elapsedSec: startedAtRef.current ? Math.round((Date.now() - startedAtRef.current) / 1000) : 0,
      paceWpm: paceRef.current ?? undefined,
      awaitingConsent: awaitingConsentRef.current,
      displayName: opts.current.displayName,
    }),
    [],
  );

  /**
   * The language is settled — by a tap or by saying it, through this one
   * function, so the two can never behave differently. Talk then opens again
   * in that language.
   */
  const settleLanguage = useCallback(
    (language: Language) => {
      const next = { ...intakeRef.current, language };
      intakeRef.current = next;
      setIntake(next);
      setLanguage(language);
      setChoices([]);
      choicesRef.current = [];
      setAwaitingLanguage(false);
      awaitingLanguageRef.current = false;
      opts.current.onIntake?.(next);
      // A tap can land while the language question is still being spoken.
      // Two streams into one player garble both and can leave her stuck.
      abortRef.current?.abort();
      playerRef.current?.stop();
      return speakRequest(COMPANION.greet, {
        mode: "intake",
        intake: next,
        displayName: opts.current.displayName,
        consented: hasConsent(),
      });
    },
    [hasConsent, speakRequest],
  );

  /** Act on what a turn heard, once its stream has ended. */
  const afterTurn = useCallback(
    (heard: Heard | null | undefined) => {
      if (!heard || !activeRef.current) return;
      if (heard.kind === "language") {
        void settleLanguage(heard.language);
        return;
      }
      // An option was chosen by voice. The page says what that means; with no
      // page handler, it is sent as if tapped.
      if (opts.current.onChoiceHeard) opts.current.onChoiceHeard(heard.choice);
      else void speakRequest(COMPANION.turn, turnBody({ text: heard.choice.label }), { answered: true });
    },
    [settleLanguage, speakRequest, turnBody],
  );

  /**
   * Silence the microphone while something else speaks — reading the options
   * aloud, say. A microphone left open while Talk talks will sooner or later
   * transcribe Talk.
   */
  const setListening = useCallback((on: boolean) => {
    mutedRef.current = !on;
    // Back on only if it is the person's turn. Switching it on while Talk is
    // thinking or speaking would hear her as their answer.
    const theirTurn = phaseRef.current === "listening" || phaseRef.current === "hearing";
    captureRef.current?.setEnabled(on && theirTurn);
  }, []);

  const stop = useCallback(() => {
    activeRef.current = false;
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    abortRef.current?.abort();
    abortRef.current = null;
    cancelAnimationFrame(rafRef.current);
    captureRef.current?.dispose();
    captureRef.current = null;
    playerRef.current?.dispose();
    playerRef.current = null;
    setTalkFeed(null);
    micStop();
    go("idle");
  }, [go, micStop]);

  /**
   * Begin. `fromTap: false` is for starting without a fresh tap — straight
   * after paying, say — and it only goes ahead if the browser lets the page
   * make a sound; otherwise it backs out quietly, returns false, and the page
   * waits for a tap as usual. (Safari will not start audio that was not
   * begun inside a tap, and Talk speaking into a silent context would leave
   * her stuck mid-sentence with nothing to hear.)
   */
  const start = useCallback(async ({ fromTap = true }: { fromTap?: boolean } = {}): Promise<boolean> => {
    if (activeRef.current) return true;
    activeRef.current = true;
    doneRef.current = false;
    startedAtRef.current = Date.now();
    consentedRef.current = false;
    // Resume from whatever is known: the saved intake, or this session's.
    intakeRef.current = opts.current.intake;
    setError(null);
    go("starting");

    await micStart();
    const graph = micGraph();
    if (!graph || !activeRef.current) {
      // Denied, unsupported, or ended while the permission prompt was open.
      activeRef.current = false;
      go("idle");
      return false;
    }
    if (!fromTap && graph.ctx.state !== "running") {
      await Promise.race([graph.ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 400))]);
      // Read again: resume() may have changed it, which TypeScript cannot see.
      if ((graph.ctx.state as AudioContextState) !== "running") {
        activeRef.current = false;
        micStop();
        go("idle");
        return false;
      }
    }

    const player = new StreamPlayer(graph.ctx);
    playerRef.current = player;
    setTalkFeed(player.feed);

    // No microphone (refused, or none present): carry on by text rather than
    // locking the person out of onboarding.
    setTextOnly(!graph.source);
    if (graph.source) {
      try {
        captureRef.current = await UtteranceCapture.attach(graph.ctx, graph.source, {
          onSpeechStart: () => {
            if (phaseRef.current === "listening") go("hearing");
          },
          onUtterance: (audio, seconds) => {
            lastUtteranceSec.current = seconds;
            void speakRequest(COMPANION.turn, turnBody({ audio })).then(afterTurn);
          },
        });
      } catch (e) {
        console.error("[useConversation] capture", e);
        setTextOnly(true);
      }
    }

    // Talk's voice moves the blob too: analyse playback every frame.
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      if (phaseRef.current === "speaking") playerRef.current?.analyse();
    };
    rafRef.current = requestAnimationFrame(loop);

    // Onboarding opens with Talk's voice, not instructions on a screen. So
    // does any conversation with somebody who has not yet heard the consent:
    // nothing they say is kept before they agree to it.
    if (opts.current.mode === "intake" || !hasConsent()) {
      await speakRequest(COMPANION.greet, {
        mode: opts.current.mode,
        intake: intakeRef.current,
        displayName: opts.current.displayName,
        consented: hasConsent(),
      });
      return true;
    }
    listen();
    return true;
  }, [afterTurn, go, hasConsent, listen, micGraph, micStart, micStop, speakRequest, turnBody]);

  /** A typed message, for anyone who cannot or would rather not speak right now. */
  const sendText = useCallback(
    (text: string, { answered = false }: { answered?: boolean } = {}) => {
      const clean = text.trim();
      if (!clean || !activeRef.current) return;
      const p = phaseRef.current;
      if (p === "thinking" || p === "speaking") {
        abortRef.current?.abort();
        playerRef.current?.stop();
      }
      void speakRequest(COMPANION.turn, turnBody({ text: clean }), { answered }).then(afterTurn);
    },
    [afterTurn, speakRequest, turnBody],
  );

  /**
   * Talk introduces the providers she found, aloud. The intake is over at
   * this point, so `doneRef` is cleared — the page stays here while they
   * choose rather than being handed on again.
   */
  const present = useCallback(
    (providers: unknown[], intake: Intake) => {
      doneRef.current = false;
      void speakRequest(COMPANION.present, { providers, intake });
    },
    [speakRequest],
  );

  /**
   * A tapped answer. Everything is also answerable out loud — this is for a
   * noisy room, a quiet one, and for anyone who finds a button easier than a
   * sentence.
   *
   * The language is the exception: it is not sent to the model to interpret.
   * Tapping it settles the language outright and Talk opens again in it,
   * which is what stops a misheard first sentence deciding the conversation.
   */
  const choose = useCallback(
    (choice: Choice) => {
      if (!activeRef.current) return;
      setChoices([]);
      choicesRef.current = [];
      if (awaitingLanguageRef.current) {
        void settleLanguage(choice.id as Language);
        return;
      }
      // Everything else — the consent's Yes and No included — goes as the
      // button's own words, marked as already chosen. The server reads a
      // tapped consent directly, without a model.
      sendText(choice.label, { answered: true });
    },
    [sendText, settleLanguage],
  );

  /**
   * A tap on the blob. While Talk thinks or speaks, it interrupts her; while
   * the user is mid-sentence it means "I'm done — go ahead".
   */
  const interrupt = useCallback(() => {
    const p = phaseRef.current;
    if (p === "thinking") {
      abortRef.current?.abort();
      listen();
    } else if (p === "speaking") {
      playerRef.current?.stop();
      // Cutting off her closing line still finishes the intake.
      afterSpeaking();
    } else if (p === "hearing") {
      captureRef.current?.flush();
    }
  }, [afterSpeaking, listen]);

  // An auth or payment failure ends the session: nothing will succeed until
  // somebody signs in, or pays.
  useEffect(() => {
    if ((error?.kind === "auth" || error?.kind === "payment") && activeRef.current) stop();
  }, [error, stop]);

  // Leaving the page ends everything — microphone light included.
  useEffect(() => () => stop(), [stop]);

  const blobState: BlobState =
    phase === "idle"
      ? "idle"
      : phase === "starting" || phase === "thinking"
        ? "thinking"
        : phase === "speaking"
          ? "speaking"
          : "listening";

  const feed = phase === "speaking" && talkFeed ? talkFeed : mic.feed;

  return {
    phase,
    blobState,
    feed,
    lines,
    risk,
    language,
    intake,
    error,
    mic,
    active: phase !== "idle",
    textOnly,
    choices,
    awaitingLanguage,
    awaitingConsent,
    choose,
    present,
    start,
    stop,
    interrupt,
    sendText,
    setListening,
  };
}
