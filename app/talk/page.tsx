"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_SOFT, SPRING_SNAP } from "@/components/motion/primitives";
import TalkBlob from "@/components/voice/TalkBlob";
import { useAuth } from "@/components/AuthProvider";
import { signOut, updateUserProfile } from "@/lib/auth";
import { recordConsent } from "@/lib/wellbeing";
import { useConversation, type Line, type Phase } from "@/lib/ai/useConversation";
import { INTAKE_BUDGET_SEC, LANGUAGE_LABEL, type Language } from "@/lib/ai/protocol";
import ConversationClock from "@/components/therapy/ConversationClock";
import {
  REQUIRED_FIELDS,
  SERVICE_LABELS,
  isMinor,
  localeOf,
  missingFields,
  rankProviders,
  type Intake,
} from "@/lib/matching";
import { DEFAULT_CONSENTS, LOCALE_LABELS } from "@/lib/models";
import { formatDalasi } from "@/lib/money";
import { useMatches } from "@/lib/useMatches";
import { useOpenProvider } from "@/lib/useOpenProvider";
import { useReadAloud } from "@/lib/useReadAloud";
import { IconSpeaker } from "@/components/ui/icons";
import ProviderCard from "@/components/providers/ProviderCard";
import GuardianConsentModal from "@/components/therapy/GuardianConsentModal";
import PaymentSheet from "@/components/onboarding/PaymentSheet";
import SpokenCaption from "@/components/onboarding/SpokenCaption";
import AuthCard from "@/components/AuthCard";
import Modal from "@/components/ui/Modal";
import { useVoice, voice } from "@/lib/audio/lines";
import { useConsultation } from "@/lib/payments/consultation";
import { afterSignIn, isSettled, safeNext } from "@/lib/routing";
import { AI_TIERS } from "@/lib/models";

/**
 * Talk — the voice surface, and for a new person, the whole onboarding.
 *
 * Someone who has just created an account lands here and Talk simply starts
 * talking: who she is, then one question at a time, in whatever language they
 * answer in. No forms, no steps, no instructions on screen. When she has what
 * she needs she says so, and they are taken straight to the providers who
 * fit. Everyone else gets the open companion conversation.
 *
 * You speak; gemini-3.8-flash hears the audio, transcribes and translates it
 * and writes Talk's reply in your language; gemini-3.1-flash-tts speaks it.
 */

/**
 * Blob sizing, shared between CSS and the canvas.
 *
 * The body's diameter is 30% of the smaller viewport side, clamped — the same
 * formula TalkBlob uses for its radius (15%, 88..150px), so the clickable disc
 * lines up with what is drawn. The canvas is far larger than the body: it is
 * where thrown particles and the ember halo live, and a canvas the size of
 * the body clips every reaction worth seeing.
 */
const BLOB_VARS = {
  "--blob-d": "clamp(176px, 30vmin, 300px)",
  "--blob-canvas": "calc(var(--blob-d) * 4.4)",
} as CSSProperties;

const STATUS: Record<Phase, string> = {
  idle: "Tap to begin.",
  starting: "Opening your microphone…",
  listening: "Listening…",
  hearing: "Listening…",
  thinking: "Thinking…",
  speaking: "Tap to interrupt.",
};

/**
 * useSearchParams needs a Suspense boundary above it, or the build cannot
 * prerender the page. Nothing in it waits on data, so this resolves at once.
 */
/** What Talk says to walk somebody through paying for the D200 consultation. */
const PAY_LINES = ["price", "why", "pay-how"];

export default function TalkPage() {
  return (
    <Suspense fallback={<TalkShell />}>
      <Talk />
    </Suspense>
  );
}

/**
 * What a full page load shows before the script has run: the dark screen,
 * and the urgent-help line — never a blank page, on the screen most likely
 * to be open when someone is struggling.
 */
function TalkShell() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-end bg-[var(--dark)] px-4 pb-10 text-white">
      <p className="text-center text-[11px] uppercase leading-relaxed tracking-[0.18em] text-white/45 max-w-[460px]">
        Talk is an AI, not a therapist, and cannot respond to an emergency.{" "}
        <Link href="/crisis" className="underline underline-offset-4 text-white/70">
          Urgent help
        </Link>
      </p>
    </div>
  );
}

function Talk() {
  const router = useRouter();
  // Choosing a provider is gated for somebody under 18 (see useGuardianGate):
  // the guardian form first, then their conversation.
  const { open: openProvider, guardian } = useOpenProvider();
  const { user, profile, ready } = useAuth();

  // From the URL: ?intake redoes the intake for someone already set up;
  // ?debug shows capture diagnostics; ?signin came from a Sign in control
  // (somebody returning); ?next is where a person who is already set up goes
  // once they have signed in; ?paid is a checkout coming back.
  //
  // From Next, not window.location: after an in-app link the browser still
  // shows the PREVIOUS address while this first renders, so ?signin from the
  // header or ?intake from the dashboard was silently missed.
  const params = useSearchParams();
  // Never for a provider: being asked "what brings you here today?" on your
  // first day at work is a bug, and the answer would be filed as their notes.
  const intakeMode =
    profile?.role !== "provider" &&
    profile?.role !== "admin" &&
    (params.has("intake") || Boolean(profile && !profile.onboarded));
  const next = safeNext(params.get("next"));
  const showDebug = params.has("debug");
  const [showEnglish, setShowEnglish] = useState(true);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  /** Set once the conversation is finished; the shortlist derives from it. */
  const [finished, setFinished] = useState<Intake | null>(null);

  // Signed out is NOT sent away to a sign-in page any more. This screen is the
  // way in: Talk brings sign-in up here, as she says it — see "the doorway".

  const uid = user?.uid ?? null;
  const getToken = useCallback(() => (user ? user.getIdToken() : Promise.resolve(null)), [user]);

  // Progress is saved after every answer, so leaving halfway and coming back
  // picks up where Talk left off rather than starting again.
  //
  // The first answer that says they are under 18 also brings up the guardian
  // form — once, and without stopping the conversation: "Not now" closes it
  // and Talk carries on. It is choosing a provider that waits for it.
  const guardianAsked = useRef(false);
  const guardianOnFile = Boolean(profile?.consents?.guardianConsent);
  const { ask: askGuardian } = guardian;
  const onIntake = useCallback(
    (intake: Intake) => {
      if (!uid) return;
      const locale = localeOf(intake.language);
      void updateUserProfile(uid, { intake, ...(locale ? { locale } : {}) }).catch(() => {});
      if (isMinor(intake) && !guardianOnFile && !guardianAsked.current) {
        guardianAsked.current = true;
        askGuardian();
      }
    },
    [askGuardian, guardianOnFile, uid],
  );

  /**
   * They heard the consent and said yes — out loud, or by tapping Yes.
   *
   * Written to the append-only ledger, with what was spoken and how they
   * answered, and to the profile so it is not asked again. Pressing Start used
   * to count as consent; for somebody who cannot read the small print under
   * the button, it never was.
   *
   * Each write stands alone: one failing must not stop the others, and none
   * of them may stop the conversation.
   */
  const consents = profile?.consents;
  const onConsent = useCallback(
    async ({ how, version, language }: { how: "spoken" | "tapped"; version: string | null; language: Language | null }) => {
      if (!uid) return;
      const detail = { via: how, version, language: language ?? "english" };
      const now = Date.now();
      await Promise.allSettled([
        recordConsent(uid, "dataProcessing", true, "therapy/spoken", detail),
        recordConsent(uid, "aiDisclosure", true, "therapy/spoken", detail),
      ]);
      await updateUserProfile(uid, {
        consents: {
          ...DEFAULT_CONSENTS,
          ...consents,
          dataProcessing: true,
          aiDisclosure: true,
          acceptedTermsAt: consents?.acceptedTermsAt ?? now,
          spokenConsentAt: now,
        },
      }).catch(() => {});
    },
    [consents, uid],
  );

  const onIntakeDone = useCallback(
    async (intake: Intake) => {
      if (uid) {
        const locale = localeOf(intake.language);
        await updateUserProfile(uid, { intake, onboarded: true, ...(locale ? { locale } : {}) }).catch(() => {});
      }
      setFinished(intake);
    },
    [uid],
  );

  // Ranked live against what Talk has learned so far, so the shortlist is
  // ready the moment the conversation finishes.
  const { matches } = useMatches(null);
  const talk = useConversation({
    getToken,
    mode: intakeMode ? "intake" : "companion",
    initialIntake: profile?.intake ?? null,
    displayName: profile?.displayName ?? user?.displayName ?? null,
    onIntake,
    onIntakeDone,
    // Saying an option goes through the SAME handler as tapping it — so a
    // provider said aloud opens their conversation, an age range said aloud
    // answers the question, and the two can never behave differently.
    onChoiceHeard: handleChoice,
    // Talk says the consent, in their language, before the first question —
    // until they have agreed to it once.
    consented: Boolean(profile?.consents?.spokenConsentAt),
    onConsent,
  });
  const { mic } = talk;
  // Talk narrates the shortlist once; the speaker on each card is how
  // somebody hears it again. It follows the language being SPOKEN, not the
  // one saved on the profile, which is a turn behind the moment it is chosen.
  const {
    read: readAloud,
    stop: stopReading,
    speakingId: readingId,
  } = useReadAloud(talk.language ?? profile?.intake?.language ?? null);

  // The microphone is hushed while the options are read aloud — so they are
  // not heard back as an answer — and while the guardian form is open, so a
  // parent and child talking it through are not sent to Talk. The hook only
  // switches it back on when it is the person's turn.
  const { setListening } = talk;
  const hush = readingId === "choices" || guardian.modal.open;
  useEffect(() => {
    setListening(!hush);
  }, [hush, setListening]);

  // The form must never sit over the emergency numbers. The moment anything
  // suggests danger it closes, and the crisis panel below is what they see.
  const risky = talk.risk === "elevated" || talk.risk === "urgent";
  const { open: guardianOpen, onClose: closeGuardian } = guardian.modal;
  useEffect(() => {
    if (risky && guardianOpen) closeGuardian();
  }, [closeGuardian, guardianOpen, risky]);
  const minor = isMinor(talk.intake);

  // The three she will introduce: ranked against everything she just learned,
  // derived rather than stored so it cannot fall out of step with the intake.
  const shortlist = useMemo(
    () => (finished && matches ? rankProviders(matches.map((m) => m.profile), finished).slice(0, 3) : null),
    [finished, matches],
  );
  const presentedFor = useRef<Intake | null>(null);

  // She says the names out loud, once, rather than dropping a list on someone
  // who may not read it.
  useEffect(() => {
    if (!finished || !shortlist?.length || presentedFor.current === finished) return;
    presentedFor.current = finished;
    talk.present(
      shortlist.map((m) => ({
        uid: m.profile.uid,
        name: m.profile.displayName,
        services: m.profile.services.map((x) => SERVICE_LABELS[x]),
        languages: m.profile.languages.map((l) => LOCALE_LABELS[l]),
        location: m.profile.location ?? "",
        fee: formatDalasi(m.profile.sessionRateMinor),
        reasons: m.reasons,
      })),
      finished,
    );
  }, [finished, shortlist, talk]);

  // Nobody to introduce — the directory is empty. Hand over rather than
  // leaving them on a finished conversation.
  useEffect(() => {
    if (finished && matches && matches.length === 0) router.replace("/matches?welcome=1");
  }, [finished, matches, router]);

  // ---- paid for? -----------------------------------------------------------
  // A conversation with Talk is paid for first: the D200 initial consultation
  // is the intake; talking to Talk again afterwards is the longer one. The AI
  // functions refuse an unpaid one (a 402) whatever this page does — this is
  // so the person sees the payment sheet rather than an error.
  const tier = intakeMode ? "initial" : "extended";
  // ?paid: a checkout brought them back to this tab, which may never have
  // learned the payment's id — it is on its way all the same.
  const consultation = useConsultation(tier, { expecting: params.has("paid") });
  const { paid, prepare } = consultation;
  const price = formatDalasi(AI_TIERS[tier].amountMinor);
  const { start } = talk;

  // Providers and staff are never put through the door: on to where they
  // were going (?next), or their own home. The same rule as onSignedIn, so
  // whichever of the two runs last, they agree.
  useEffect(() => {
    if (profile?.role !== "provider" && profile?.role !== "admin") return;
    voice.forget();
    router.replace(afterSignIn(profile, next));
  }, [next, profile, router]);

  // ---- the doorway --------------------------------------------------------
  // Talk runs the way in, from this screen, in her recorded voice (English,
  // then Wolof), and each step appears AS SHE SAYS IT:
  //
  //   "Welcome to Talk Therapy."
  //   "To begin a session with us, please sign in."   → sign-in opens
  //   "You can use your email, or Google."
  //   (signed in)
  //   "To continue, the consultation is two hundred dalasi."  → payment opens
  //   (paid)
  //   "Thank you. Now, let us begin."                  → the conversation starts
  //
  // It usually begins on the landing page — that tap unlocks sound and starts
  // her speaking, then brings them here mid-sentence (lib/audio/lines keeps
  // her voice going across the move). Arriving here any other way, the first
  // tap on Start or the blob begins it. Somebody already set up who signs in
  // here is taken home: the door is for people arriving.
  const heard = useVoice();
  const doorway = heard.spoken.length > 0;
  const recorded = Boolean(heard.saying) && !talk.active;

  // Came to sign in, but already signed in — their session was still being
  // restored when they tapped, or an old sign-in link. Somebody set up is
  // sent on (?next, or home) rather than left on a screen asking them to
  // sign in. Decided once, on arrival: never after they sign in here.
  const arrival = useRef(false);
  useEffect(() => {
    if (!ready || arrival.current) return;
    if (user && !profile) return; // their profile is still loading
    arrival.current = true;
    if (!profile || !isSettled(profile)) return;
    if (!params.has("signin") && !params.has("next")) return;
    voice.forget();
    router.replace(afterSignIn(profile, next));
  }, [next, params, profile, ready, router, user]);

  // Sign-in: up once she has asked for it, until they close it. Sent here
  // to sign in (a Sign in control, or a page that needs an account) and she
  // is not speaking — a redirect cannot start a sound — it is up at once.
  const [signInClosed, setSignInClosed] = useState(false);
  const [askSignIn, setAskSignIn] = useState(() => params.has("signin") || params.has("next"));
  const signInOpen =
    ready &&
    !user &&
    !signInClosed &&
    (heard.spoken.includes("sign-in") || (askSignIn && !heard.saying));

  // Payment: up once she has said the price, or when Start is pressed unpaid,
  // or by itself while a payment is on its way. Closing it only hides it —
  // the payment it was waiting for is still being watched.
  const [payOpen, setPayOpen] = useState(false);
  const [payClosed, setPayClosed] = useState(false);
  const sheetOpen =
    Boolean(user) &&
    paid === false &&
    !payClosed &&
    (payOpen || heard.spoken.includes("price") || consultation.phase !== "idle");

  // Whether this screen is still the one on show. A line's onDone can fire
  // after somebody has left, and must not open a microphone on a page that
  // has gone.
  const here = useRef(false);
  useEffect(() => {
    here.current = true;
    return () => {
      here.current = false;
      // Only if the screen has really gone: React remounts once on the way in
      // (in development, and on some navigations), and stopping on that would
      // cut her off mid-welcome. A real exit stays unmounted — and forgets
      // what she said, so the next visit is a new visit.
      setTimeout(() => {
        if (!here.current) voice.forget();
      }, 0);
    };
  }, []);

  // Once a conversation has begun — on this screen, or in another tab of
  // Talk — the doorway is over, and nothing here may start one by itself.
  const concluded = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel("talk:conversation");
    ch.onmessage = () => {
      concluded.current = true;
    };
    channel.current = ch;
    return () => ch.close();
  }, []);
  useEffect(() => {
    if (!talk.active) return;
    concluded.current = true;
    channel.current?.postMessage("started");
  }, [talk.active]);

  /**
   * Into the conversation. The paid clock is started just before Talk's first
   * request — never before the microphone and her voice are actually ready —
   * and the token it uses is minted after, so it carries the claim. With
   * `fromTap` false it only goes ahead where the browser allows sound without
   * a fresh tap; otherwise the Start button is there.
   */
  const beginTalk = (fromTap: boolean) => {
    voice.stop();
    if (!here.current) return;
    if (!fromTap && (concluded.current || document.visibilityState !== "visible")) return;
    concluded.current = true;
    let prepared: boolean | null = null;
    void start({
      fromTap,
      beforeFirstRequest: async () => (prepared = await prepare()),
    }).then((ok) => {
      if (ok) return;
      if (prepared === false) {
        // Nothing paid to begin (or its time is up): the sheet, not an error.
        setPayClosed(false);
        setPayOpen(true);
      }
      // Backed out for want of sound: a tap will do it.
      if (!fromTap) concluded.current = false;
    });
  };

  // Signed in (on this screen, or before): what next? Once whatever she is
  // saying has finished:
  //
  //   - not paid for the consultation: she walks them to paying AT ONCE,
  //     however they arrived — the price (the sheet opens as she says it),
  //     why this first consultation matters, then exactly what to tap. The
  //     way to paying is the way in, just as signing in is.
  //   - paid, and they came in through a tap: welcome back, and begin.
  //
  // Arriving without a tap (a refresh, a redirect), the browser may refuse
  // her voice: the captions and the sheet still come, on time, and the first
  // tap anywhere replays the line she is on (see `blocked` below).
  const decided = useRef(false);
  useEffect(() => {
    if (decided.current || concluded.current || !ready || !user || !profile) return;
    if (heard.saying || paid === null || talk.active || profile.role !== "patient") return;
    if (!paid) {
      // Only for the D200: the lines name its price and a FIRST consultation.
      if (tier !== "initial") return;
      decided.current = true;
      voice.say(heard.spoken.includes("welcome") ? PAY_LINES : ["welcome", ...PAY_LINES]);
      return;
    }
    if (!doorway || isSettled(profile)) return;
    decided.current = true;
    voice.say(["welcome-back"], { onDone: () => beginTalk(false) });
  });

  // Her voice was refused (nobody had tapped yet): the first tap anywhere
  // unlocks it and she says it again — from the line on screen, or, if she
  // already finished in silence, the part that matters now (how to sign in,
  // or how to pay). No prompt: any touch does it (and VoiceUnlock, in the
  // root layout, unlocks her on the first touch anywhere on the site).
  useEffect(() => {
    if (!heard.blocked) return;
    const replay = () => {
      const sequence = !user
        ? ["welcome", "sign-in", "how"]
        : paid === false && tier === "initial"
          ? ["welcome", ...PAY_LINES]
          : ["welcome"];
      const current = heard.saying?.id ?? null;
      const from = current ? sequence.indexOf(current) : -1;
      const lines =
        from >= 0 ? sequence.slice(from) : !user ? ["sign-in", "how"] : sequence.length > 1 ? PAY_LINES : [];
      voice.unlock();
      if (lines.length) voice.say(lines);
    };
    document.addEventListener("pointerdown", replay, { once: true, capture: true });
    return () => document.removeEventListener("pointerdown", replay, { capture: true });
  }, [heard.blocked, heard.saying, user, paid, tier]);

  // Paid, in this visit. The checkout is in another tab; the moment the
  // consultation is written she thanks them and begins — once somebody is
  // looking at this tab, so she does not start talking to nobody, and never
  // for a payment that settled long after they left it.
  const thanked = useRef(false);
  const { waitingSince } = consultation;
  useEffect(() => {
    if (!paid || thanked.current || concluded.current || talk.active || consultation.phase !== "waiting") return;
    const go = () => {
      if (document.visibilityState !== "visible" || thanked.current || concluded.current) return;
      if (waitingSince !== null && Date.now() - waitingSince > 30 * 60_000) return;
      thanked.current = true;
      decided.current = true;
      setPayOpen(false);
      voice.say(["paid"], { onDone: () => beginTalk(false) });
    };
    go();
    document.addEventListener("visibilitychange", go);
    return () => document.removeEventListener("visibilitychange", go);
  });

  // Start, or a tap on the blob. Pressing Start is not consent: Talk asks for
  // that out loud once the conversation begins — see onConsent.
  const begin = () => {
    if (!user) {
      setSignInClosed(false);
      // Already speaking, or already asked: never start her over. Otherwise
      // she begins the way in — inside this tap, which lets her be heard.
      if (heard.saying || heard.spoken.includes("sign-in")) return;
      voice.unlock();
      voice.say(["welcome", "sign-in", "how"]);
      return;
    }
    if (!paid) {
      setPayClosed(false);
      setPayOpen(true);
      // Inside this tap, so she can be heard: she walks them through paying,
      // unless she is already talking or already has. Only for the D200 —
      // the lines name its price and speak of a FIRST consultation.
      if (tier === "initial" && !heard.saying && !heard.spoken.includes("pay-how")) {
        voice.unlock();
        voice.say(heard.spoken.includes("price") ? PAY_LINES.slice(1) : PAY_LINES);
      }
      return;
    }
    decided.current = true;
    beginTalk(true);
  };

  /**
   * Signed in on this screen. Somebody already set up goes where they were
   * heading (?next), or home; somebody new stays, and Talk carries on.
   * Signing in AGAIN (a sign-in that went stale mid-conversation) stays.
   */
  const reauth = useRef(false);
  const onSignedIn = (signedIn: Parameters<typeof isSettled>[0]) => {
    voice.stop();
    if (reauth.current) {
      reauth.current = false;
      return;
    }
    if (isSettled(signedIn)) {
      voice.forget();
      router.replace(afterSignIn(signedIn, next));
    }
  };

  // Refused for payment mid-conversation (a claim that did not stick, or the
  // time ran out): try to pick the paid conversation up again — one round
  // trip — and show the payment sheet only if there is nothing to pick up.
  const repairing = useRef(false);
  const [repaired, setRepaired] = useState(false);
  const paymentRefused = talk.error?.kind === "payment";
  useEffect(() => {
    if (!paymentRefused || repairing.current) return;
    repairing.current = true;
    void (async () => {
      const ok = await prepare();
      if (ok) setRepaired(true);
      else {
        setPayClosed(false);
        setPayOpen(true);
      }
      repairing.current = false;
    })();
  }, [paymentRefused, prepare]);

  const denied = mic.status === "denied" || mic.status === "unsupported" || mic.status === "error";
  // Without a microphone the keyboard is the only way to answer, so it is open.
  const showKeyboard = typing || talk.textOnly;
  const lastUser = findLast(talk.lines, "user");
  const lastTalk = findLast(talk.lines, "talk");
  const translated = Boolean(lastUser?.english || lastTalk?.english);
  const learned = REQUIRED_FIELDS.length - missingFields(talk.intake).length;
  // Not before the payment lookup has answered: Start means pay or talk, and
  // which one is not known yet. Signed out, Start begins the way in.
  const canStart = ready && (!user || paid !== null);

  // A tap on the blob never ends the session — that is the button's job. A
  // tap meant to interrupt Talk that lands a moment after she finished would
  // otherwise throw the whole conversation away.
  const onBlob = talk.active ? talk.interrupt : begin;
  const blobLabel = !talk.active
    ? "Begin"
    : talk.phase === "hearing"
      ? "I'm done speaking"
      : talk.phase === "thinking" || talk.phase === "speaking"
        ? "Interrupt Talk"
        : "Talk is listening";

  /**
   * A tapped answer. Once Talk has introduced the shortlist, the options are
   * the providers themselves, and tapping one opens the conversation with
   * them — the same place saying their name goes.
   */
  function handleChoice(choice: { id: string; label: string }) {
    // A tap while the options are being read out ends the reading — and with
    // it the hush — rather than leaving it to talk over Talk's answer.
    stopReading();
    const picked = shortlist?.find((m) => m.profile.uid === choice.id);
    if (picked) {
      void openProvider(picked.profile);
      return;
    }
    talk.choose(choice);
  }

  function submitDraft(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    stopReading();
    talk.sendText(draft);
    setDraft("");
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--dark)] text-white" style={BLOB_VARS}>
      {/* Ambient warmth behind the field. */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(circle at 50% 42%, rgba(255,90,31,0.30) 0%, rgba(255,90,31,0) 58%)," +
            "radial-gradient(circle at 80% 18%, rgba(255,90,31,0.14), transparent 52%)",
        }}
      />

      <header className="relative z-10 px-4 sm:px-6 md:px-10 pt-5 md:pt-8 flex items-center justify-between">
        <Link href="/" className="leading-[0.85] text-[15px] font-medium tracking-tight">
          <span className="block">TALK</span>
          <span className="block">THERAPY</span>
        </Link>
        {/* Mid-onboarding, "home" is the only way out: the dashboard would
            send them straight back here. */}
        <Link
          href={!user || (intakeMode && !profile?.onboarded) ? "/" : "/dashboard"}
          onClick={() => {
            voice.stop();
            talk.stop();
          }}
          className="h-10 px-4 rounded-full border border-white/20 text-[12px] uppercase tracking-[0.14em] font-medium flex items-center hover:bg-white/10 transition-colors"
        >
          Exit
        </Link>
      </header>

      <main className="relative z-[1] min-h-[calc(100vh-120px)] flex flex-col items-center justify-center px-4 sm:px-6 py-8">
        <motion.p
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={SPRING_SOFT}
          className="relative z-10 text-[12px] uppercase tracking-[0.22em] text-white/65"
        >
          Talk
          {talk.language && talk.language !== "other" ? (
            <span className="text-white/40"> · {LANGUAGE_LABEL[talk.language]}</span>
          ) : null}
        </motion.p>

        {/* Intake progress — four dots, no words. */}
        {intakeMode ? (
          <div className="relative z-10 mt-3 flex gap-1.5" aria-label={`${learned} of ${REQUIRED_FIELDS.length}`}>
            {REQUIRED_FIELDS.map((f, i) => (
              <motion.span
                key={f}
                className="h-1.5 w-1.5 rounded-full"
                animate={{ backgroundColor: i < learned ? "rgba(255,90,31,1)" : "rgba(255,255,255,0.2)" }}
                transition={SPRING_SOFT}
              />
            ))}
          </div>
        ) : null}

        {/* How long is left — the intake's eight minutes, or the paid window,
            whichever ends first. Only while the conversation is running. */}
        {talk.active ? (
          <div className="relative z-10 mt-3">
            <ConversationClock
              startedAt={talk.startedAt}
              budgetMs={intakeMode ? INTAKE_BUDGET_SEC * 1000 : null}
              endsAt={consultation.entitlement?.endsAt ?? null}
            />
          </div>
        ) : null}

        <motion.button
          type="button"
          onClick={canStart ? onBlob : undefined}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={SPRING_SNAP}
          aria-label={blobLabel}
          className="relative mt-8 shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--dark)]"
          style={{ width: "var(--blob-d)", height: "var(--blob-d)" }}
        >
          {/* The feed switches to Talk's own voice while she speaks, so the
              blob follows whoever is talking. The canvas overflows the button
              on purpose and ignores the pointer, so only the body is the tap
              target; the page's overflow-hidden trims it at the viewport. */}
          {/* Her recorded lines move the particles exactly as her live voice
              does — it is the same Talk, from the first word. */}
          <TalkBlob
            state={recorded ? "speaking" : talk.blobState}
            feed={recorded ? voice.feed() : talk.feed}
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ width: "var(--blob-canvas)", height: "var(--blob-canvas)" }}
          />
        </motion.button>

        {/* Deliberately NOT wrapped in AnimatePresence mode="wait".
            It was, and the exit animation could deadlock — leaving the status
            reading "Tap to begin" while the session was actually running. A
            status line on this surface has to be correct before it is pretty. */}
        <p
          className={`relative z-10 mt-8 text-[13px] md:text-[14px] text-center max-w-[440px] ${
            denied ? "text-[var(--accent)]" : "text-white/50"
          }`}
          aria-live="polite"
        >
          {denied
            ? "Microphone blocked — type your answers below, or allow the microphone and start again."
            : recorded
              ? "Talk is speaking."
              : STATUS[talk.phase]}
        </p>

        {/* What was said, both ways. The newest exchange only: this is a
            conversation, not a chat log, and the words are there to confirm
            Talk heard you right — and for when her voice cannot be heard. */}
        <div
          className="relative z-10 mt-5 w-full max-w-[560px] min-h-[96px] text-center"
          // Silent while a sheet carries the same caption: twice is noise.
          aria-live={signInOpen || sheetOpen ? "off" : "polite"}
        >
          {recorded ? (
            <SpokenCaption saying={heard.saying} tone="dark" className="mx-auto max-w-[460px]" />
          ) : (
            <AnimatePresence initial={false}>
              {lastUser ? <Caption key={lastUser.id} line={lastUser} showEnglish={showEnglish} /> : null}
              {lastTalk ? <Caption key={lastTalk.id} line={lastTalk} showEnglish={showEnglish} /> : null}
            </AnimatePresence>
          )}
          {translated ? (
            <button
              type="button"
              onClick={() => setShowEnglish((v) => !v)}
              className="mt-3 text-[10px] uppercase tracking-[0.18em] text-white/35 hover:text-white/60 transition-colors"
            >
              {showEnglish ? "Hide English" : "Show English"}
            </button>
          ) : null}
        </div>

        {/* Answers as buttons, in the person's own language. Everything here
            can also be said out loud — this is for a noisy room, a shared
            one, and for anyone who finds reading a sentence harder than
            recognising a word. The language question arrives this way too. */}
        <AnimatePresence>
          {talk.choices.length ? (
            <motion.div
              key={talk.choices.map((c) => c.id).join("|")}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={SPRING_SOFT}
              role="group"
              aria-live="polite"
              aria-label="Answers you can say or tap"
              className="relative z-10 mt-2 flex flex-wrap items-center justify-center gap-2 max-w-[560px]"
            >
              {talk.choices.map((choice) => (
                <motion.button
                  key={choice.id}
                  type="button"
                  onClick={() => handleChoice(choice)}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  transition={SPRING_SNAP}
                  className="min-h-12 rounded-full border border-white/25 bg-white/5 px-6 py-3 text-[15px] text-white hover:bg-white/15 transition-colors"
                >
                  {choice.label}
                </motion.button>
              ))}

              {/* The options, read aloud — for somebody who cannot read the
                  buttons and missed them in what Talk said. Only while she is
                  listening, so it never talks over her. */}
              {talk.phase === "listening" ? (
                <motion.button
                  type="button"
                  onClick={() => void readAloud("choices", talk.choices.map((c) => c.label).join(", "))}
                  whileTap={{ scale: 0.92 }}
                  transition={SPRING_SNAP}
                  aria-label="Hear the options"
                  aria-pressed={readingId === "choices"}
                  className={`h-12 w-12 rounded-full border flex items-center justify-center transition-colors ${
                    readingId === "choices"
                      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                      : "border-white/25 bg-white/5 text-white hover:bg-white/15"
                  }`}
                >
                  <IconSpeaker size={16} />
                </motion.button>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {talk.awaitingConsent ? (
          <p className="relative z-10 mt-3 text-[11px] text-white/40 text-center max-w-[360px] leading-relaxed">
            The written version:{" "}
            <Link href="/terms" className="underline underline-offset-2 text-white/60">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline underline-offset-2 text-white/60">
              Privacy Policy
            </Link>
            .
          </p>
        ) : null}

        {shortlist ? (
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={SPRING_SOFT}
            className="relative z-10 mt-6 w-full max-w-[1000px] grid grid-cols-1 md:grid-cols-3 gap-4"
          >
            {shortlist.map((m, i) => (
              <ProviderCard
                key={m.profile.uid}
                profile={m.profile}
                index={i}
                onOpen={(p) => void openProvider(p)}
                onRead={(cardId, text) => void readAloud(cardId, text)}
                speaking={readingId === m.profile.uid}
                reasons={m.reasons}
                best={i === 0}
                compact
              />
            ))}
          </motion.div>
        ) : null}

        {talk.error?.kind === "payment" ? (
          <div className="relative z-10 mt-4 max-w-[440px] text-center text-[13px] text-white/70">
            {repaired ? "All set — tap to carry on." : "Checking your consultation…"}
          </div>
        ) : talk.error ? (
          <div className="relative z-10 mt-4 max-w-[440px] text-center text-[13px] text-[var(--accent-soft)]">
            {talk.error.message}
            {talk.error.kind === "auth" ? (
              <>
                {" "}
                {/* A sign-in that has gone stale: sign out, and sign in
                    again right here, without leaving Talk. */}
                <button
                  type="button"
                  onClick={() => {
                    reauth.current = true;
                    void signOut().then(() => {
                      setSignInClosed(false);
                      setAskSignIn(true);
                    });
                  }}
                  className="underline underline-offset-4 text-white"
                >
                  Sign in again
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        {/* Once anything suggests danger, help stays on screen for the rest of
            the session. Talk says the numbers too — this is for anyone who
            cannot listen right now. */}
        {risky ? (
          <motion.div
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={SPRING_SOFT}
            role="alert"
            className="relative z-10 mt-6 w-full max-w-[440px] rounded-2xl border border-[var(--accent)]/60 bg-[var(--accent)]/10 px-5 py-4 text-center"
          >
            <p className="text-[13px] text-white/85">
              {minor
                ? "If you are in danger right now, call for help — and tell an adult you trust: a parent, a teacher, a health worker."
                : "If you are in danger right now, call for help."}
            </p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <a
                href="tel:117"
                className="h-10 px-4 rounded-full bg-[var(--accent)] text-[12px] uppercase tracking-[0.14em] font-medium flex items-center"
              >
                Police 117
              </a>
              <a
                href="tel:116"
                className="h-10 px-4 rounded-full bg-[var(--accent)] text-[12px] uppercase tracking-[0.14em] font-medium flex items-center"
              >
                Ambulance 116
              </a>
            </div>
            <Link
              href={minor ? "/crisis#under-18" : "/crisis"}
              className="mt-3 inline-block text-[11px] uppercase tracking-[0.18em] text-white/70 underline underline-offset-4"
            >
              {minor ? "Help for young people" : "More urgent help"}
            </Link>
          </motion.div>
        ) : null}

        {showDebug && talk.active && mic.status === "live" ? (
          <div className="relative z-10 mt-8 w-full max-w-[320px]">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-white/50">
              <span>Level · {talk.phase}</span>
              <span className="tabular-nums">
                {/* Raw RMS alongside the bar: a flat bar with a non-zero RMS
                    means the scaling is wrong, a flat bar with zero RMS means
                    no audio is reaching the analyser at all. */}
                rms {mic.rms.toFixed(3)} · {mic.pitchHz > 0 ? `${Math.round(mic.pitchHz)} Hz` : "—"}
              </span>
            </div>
            <div className="mt-2 h-1 rounded-full bg-white/15 overflow-hidden">
              <div
                className="h-full bg-[var(--accent)] transition-[width] duration-75"
                style={{ width: `${Math.round(mic.level * 100)}%` }}
              />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-white/40 tabular-nums">
              <dt>context</dt>
              <dd className={mic.debug.contextState === "running" ? "text-white/70" : "text-[var(--accent)]"}>
                {mic.debug.contextState} @ {mic.debug.sampleRate}Hz
              </dd>
              <dt>frames</dt>
              <dd className={mic.debug.frames > 0 ? "text-white/70" : "text-[var(--accent)]"}>{mic.debug.frames}</dd>
              <dt>track</dt>
              <dd
                className={
                  mic.debug.trackState === "live" && !mic.debug.trackMuted ? "text-white/70" : "text-[var(--accent)]"
                }
              >
                {mic.debug.trackState}
                {mic.debug.trackMuted ? " · MUTED" : ""}
                {mic.debug.trackEnabled ? "" : " · DISABLED"}
              </dd>
              <dt className="truncate">device</dt>
              <dd className="truncate text-white/70">{mic.debug.trackLabel}</dd>
            </dl>
          </div>
        ) : null}

        {/* Typing, for a noisy room, a shared space, or a blocked microphone. */}
        <AnimatePresence>
          {showKeyboard && talk.active ? (
            <motion.form
              key="type"
              onSubmit={submitDraft}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={SPRING_SOFT}
              className="relative z-10 mt-6 w-full max-w-[440px] flex items-center gap-2"
            >
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                aria-label="Type to Talk"
                className="flex-1 h-12 rounded-full bg-white/10 border border-white/15 px-5 text-[14px] text-white placeholder:text-white/35 outline-none focus:border-[var(--accent)] transition-colors"
                placeholder="Type…"
              />
              <button
                type="submit"
                aria-label="Send"
                className="h-12 w-12 shrink-0 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-soft)] flex items-center justify-center transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </motion.form>
          ) : null}
        </AnimatePresence>

        <div className="relative z-10 mt-8 flex items-center gap-3">
          <button
            type="button"
            disabled={!canStart}
            onClick={talk.active ? talk.stop : begin}
            className="h-12 px-7 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-40 text-white text-[12px] uppercase tracking-[0.14em] font-medium transition-colors"
          >
            {talk.active
              ? "End"
              : !user
                ? "Begin"
                : paid === false
                ? `Pay ${price} to begin`
                : paid === null
                  ? "One moment"
                  : intakeMode
                    ? "Start"
                    : "Begin"}
          </button>
          {talk.active && !talk.textOnly ? (
            <button
              type="button"
              onClick={() => setTyping((v) => !v)}
              aria-label={typing ? "Hide keyboard" : "Type instead"}
              aria-pressed={typing}
              className={`h-12 w-12 rounded-full border flex items-center justify-center transition-colors ${
                typing ? "bg-white text-[var(--dark)] border-white" : "border-white/20 hover:bg-white/10"
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
                <path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M8 14h8" strokeLinecap="round" />
              </svg>
            </button>
          ) : !intakeMode ? (
            <Link
              href="/matches"
              className="h-12 px-6 rounded-full border border-white/20 text-[12px] uppercase tracking-[0.14em] font-medium flex items-center hover:bg-white/10 transition-colors"
            >
              Talk to a human
            </Link>
          ) : null}
        </div>

        {intakeMode && !talk.active ? (
          <p className="relative z-10 mt-4 text-[11px] text-white/40 text-center max-w-[320px] leading-relaxed">
            Before she asks anything, Talk will tell you out loud what she keeps and ask whether that is
            alright. The written version:{" "}
            <Link href="/terms" className="underline underline-offset-2 text-white/60">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline underline-offset-2 text-white/60">
              Privacy Policy
            </Link>
            .
          </p>
        ) : null}

        {/* Never further than one line away, on the surface most likely to
            be open when someone is struggling. */}
        <p className="relative z-10 mt-10 text-[11px] uppercase tracking-[0.18em] text-white/45 text-center max-w-[460px] leading-relaxed">
          Talk is an AI, not a therapist, and cannot respond to an emergency.{" "}
          <Link href="/crisis" className="underline underline-offset-4 text-white/70">
            Urgent help
          </Link>
        </p>
      </main>

      <GuardianConsentModal {...guardian.modal} language={talk.language ?? guardian.modal.language} />

      {/* "Confirm payment for consultation". Opens on Start for somebody who
          has not paid, and by itself when a checkout brings them back here. */}
      {/* Sign-in, brought up by Talk as she says "please sign in". Embedded:
          nothing navigates, so she keeps speaking and the next step follows. */}
      <Modal open={signInOpen} onClose={() => setSignInClosed(true)} variant="responsive" label="Sign in to begin">
        <div className="space-y-5">
          <SpokenCaption saying={heard.saying} tone="light" />
          {/* Somebody who pressed Sign in is returning: start on signing
              in. Everybody else is new: start on creating an account. Both
              switch in place. */}
          <AuthCard mode={askSignIn ? "sign-in" : "sign-up"} onSignedIn={onSignedIn} />
        </div>
      </Modal>

      {/* "Confirm payment for consultation" — up as she says the price. */}
      <PaymentSheet
        open={sheetOpen}
        onClose={() => {
          // Hide it — never abandon a payment that may be on its way.
          setPayOpen(false);
          setPayClosed(true);
          voice.stop();
        }}
        tier={tier}
        consultation={consultation}
        saying={heard.saying}
      />
    </div>
  );
}

function findLast(lines: Line[], role: Line["role"]): Line | undefined {
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i].role === role) return lines[i];
  return undefined;
}

function Caption({ line, showEnglish }: { line: Line; showEnglish: boolean }) {
  const mine = line.role === "user";
  return (
    <motion.div
      layout
      initial={{ y: 8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={SPRING_SOFT}
      className={mine ? "mb-3" : ""}
    >
      <p className={mine ? "text-[13px] text-white/50" : "text-[16px] md:text-[17px] leading-snug text-white/90"}>
        {mine ? <span className="uppercase tracking-[0.16em] text-[10px] text-white/35 mr-2">You</span> : null}
        {line.text}
      </p>
      {showEnglish && line.english ? (
        <p className={`mt-1 italic ${mine ? "text-[12px] text-white/30" : "text-[13px] text-white/45"}`}>
          {line.english}
        </p>
      ) : null}
    </motion.div>
  );
}
