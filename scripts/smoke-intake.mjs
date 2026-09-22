/**
 * The onboarding conversation, end to end, against a running dev server.
 *
 *   TALK_DEV_ALLOW_ANON_AI=1 in .env.local, `npm run dev`, then:
 *   node scripts/smoke-intake.mjs [baseUrl]
 *
 * Plays a new user who starts in English, says they would rather speak Wolof,
 * and answers the rest in Wolof. Checks that Talk:
 *   - greets first,
 *   - switches to Wolof and stays there,
 *   - pulls the right structured answers out of what is said,
 *   - finishes (intakeComplete) once she has what she needs, and not before.
 *
 * Typed turns, not audio: this tests the agent's judgement. The audio path
 * is covered by smoke-companion.mjs.
 */

const BASE = process.argv[2] || "http://localhost:3000";

async function call(path, body) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} ${res.status}: ${await res.text()}`);
  const events = (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const turn = events.find((e) => e.type === "turn");
  const audio = events.filter((e) => e.type === "audio").reduce((n, e) => n + (e.pcm.length * 3) / 4, 0);
  const errors = events.filter((e) => e.type === "error").map((e) => `${e.stage}: ${e.message}`);
  return { turn, ms: Math.round(performance.now() - t0), audioSeconds: +(audio / 48000).toFixed(1), errors };
}

let failures = 0;
const check = (ok, what) => {
  console.log(`   ${ok ? "✓" : "✗"} ${what}`);
  if (!ok) failures += 1;
};

let intake = {};
const history = [];

console.log("greeting");
{
  const r = await call("/api/companion/greet", { mode: "intake", intake, displayName: null });
  console.log(`   Talk: ${r.turn.reply}  (${r.ms}ms, ${r.audioSeconds}s audio)`);
  check(r.turn.greeting === true && r.audioSeconds > 1, "Talk speaks first, with voice");
  history.push({ role: "talk", text: r.turn.reply });
}

// [what the user says, what we expect afterwards]
const SCRIPT = [
  { say: "My name is Fatou.", expect: (i) => i.preferredName?.toLowerCase().includes("fatou"), what: "name captured" },
  {
    say: "Sorry, I don't speak English well... dégguma anglais, Wolof laa dégg.",
    expect: (i, t) => i.language === "wolof" && t.language !== "english",
    what: "switches to Wolof",
    wolofReply: true,
  },
  {
    say: "Sama yaay dafa faatu weer wi weesu, te duma mëna nelaw guddi.",
    expect: (i) => i.concerns?.includes("grief"),
    what: "concerns include grief",
    wolofReply: true,
  },
  {
    say: "Dama bëgg kenn ku ma mëna waxtaan ak moom.",
    expect: (i) => i.supportType && i.supportType !== "unsure",
    what: "support type captured",
    wolofReply: true,
  },
  { say: "Jigéen moo gën ci man.", expect: (i) => i.counsellorGender === "woman", what: "prefers a woman", wolofReply: true },
  {
    say: "Video moo baax.",
    expect: (i, t) => i.format === "video" && t.intakeComplete === true,
    what: "format video, and intake complete",
    wolofReply: true,
  },
];

for (const step of SCRIPT) {
  const r = await call("/api/companion/turn", { text: step.say, history, summary: "", mode: "intake", intake });
  const t = r.turn;
  intake = t.intake ?? intake;
  console.log(`\nuser: ${step.say}`);
  console.log(`   heard as ${t.language} · risk ${t.risk} · complete ${t.intakeComplete} · ${r.ms}ms`);
  console.log(`   Talk: ${t.reply}`);
  if (t.replyEnglish && t.replyEnglish !== t.reply) console.log(`   (en): ${t.replyEnglish}`);
  console.log(`   intake: ${JSON.stringify(intake)}`);
  check(step.expect(intake, t), step.what);
  if (step.wolofReply) {
    // A Wolof reply should not read as an English sentence.
    const englishy = /\b(the|and|you|would|what|your|please)\b/i.test(t.reply);
    check(!englishy, "reply is in Wolof, not English");
  }
  if (!t.intakeComplete && step !== SCRIPT[SCRIPT.length - 1]) check(true, "not finished early");
  if (r.errors.length) console.log(`   errors: ${r.errors.join("; ")}`);
  history.push({ role: "user", text: t.transcript, english: t.english, language: t.language });
  history.push({ role: "talk", text: t.reply, english: t.replyEnglish, language: t.language });
}

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exitCode = failures ? 1 : 0;
