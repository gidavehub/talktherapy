/**
 * Set up a complete two-person demo, so the signed-in half of Talk can be
 * walked in a couple of minutes.
 *
 *   node scripts/seed-demo.mjs --patient you@example.com --provider pro@example.com
 *   node scripts/seed-demo.mjs --patient you@example.com --provider pro@example.com --remove
 *
 * Everything behind the sign-in — chat, booking, the call, the provider's
 * side — can only be checked by a person who is actually signed in. This
 * removes the tedious half of that: it verifies the provider, writes their
 * listing, opens a conversation with messages already in it, puts hours on
 * their calendar, and books one of them to start in a few minutes, so the
 * Join button is live the moment you look.
 *
 * IT CREATES NO ACCOUNTS. Both addresses must already have signed up — which
 * is itself worth doing by hand once, because the provider path
 * (/sign-up?role=provider) is part of what wants testing. The script only
 * touches accounts you name.
 *
 * `--remove` undoes all of it: the listing, the chat and its messages, the
 * slots, the bookings. It does not delete the accounts.
 */

import { createInterface } from "node:readline/promises";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const KEY = process.env.TALK_ADMIN_CREDENTIALS || "./secrets/talk-admin-sa.json";
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || "talk-therapy-509209";

const app = initializeApp({ credential: cert(KEY), projectId: PROJECT }, "seed-demo");
const db = getFirestore(app);
const auth = getAuth(app);

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const patientEmail = flag("patient");
const providerEmail = flag("provider");
const remove = args.includes("--remove");

if (!patientEmail || !providerEmail) {
  console.error(
    [
      "Usage:",
      "  node scripts/seed-demo.mjs --patient <email> --provider <email> [--remove]",
      "",
      "Both accounts must already exist. Sign the provider up at",
      "/sign-up?role=provider first — that path is part of what you are testing.",
    ].join("\n"),
  );
  process.exitCode = 2;
}

/** uids, sorted and joined — the same id the app derives. See directChatId. */
const chatIdFor = (a, b) => [a, b].sort().join("__");

async function uidFor(email) {
  try {
    return (await auth.getUserByEmail(email)).uid;
  } catch {
    return null;
  }
}

/** The next whole hour at least `minMinutes` away, so times look deliberate. */
function nextHour(minMinutes) {
  const d = new Date(Date.now() + minMinutes * 60_000);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d.getTime();
}

async function main() {
  if (!patientEmail || !providerEmail) return;

  const [patient, provider] = await Promise.all([
    uidFor(patientEmail),
    uidFor(providerEmail),
  ]);

  if (!patient || !provider) {
    console.error(
      `No account for ${!patient ? patientEmail : providerEmail}. Sign it up first.`,
    );
    process.exitCode = 1;
    return;
  }
  if (patient === provider) {
    console.error("Those are the same account. The demo needs two.");
    process.exitCode = 1;
    return;
  }

  const chatId = chatIdFor(patient, provider);
  const slots = db.collection("availability").doc(provider).collection("slots");

  if (remove) {
    const [slotDocs, bookingDocs, messageDocs] = await Promise.all([
      slots.get(),
      db.collection("bookings").where("participants", "array-contains", patient).get(),
      db.collection("chats").doc(chatId).collection("messages").get(),
    ]);

    const batch = db.batch();
    for (const d of slotDocs.docs) batch.delete(d.ref);
    for (const d of messageDocs.docs) batch.delete(d.ref);
    for (const d of bookingDocs.docs) {
      if ((d.data().participants ?? []).includes(provider)) batch.delete(d.ref);
    }
    batch.delete(db.collection("chats").doc(chatId));
    batch.delete(db.collection("providerProfiles").doc(provider));
    await batch.commit();

    console.log("Removed: the listing, the conversation, the hours and the bookings.");
    console.log("The two accounts are untouched.");
    return;
  }

  console.log(`patient   ${patientEmail}  (${patient})`);
  console.log(`provider  ${providerEmail}  (${provider})`);
  console.log("\nThis will verify the provider, write their listing, open a");
  console.log("conversation between the two, and book a session a few minutes out.");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question("\nGo ahead? [y/N] ")).trim().toLowerCase();
  rl.close();
  if (answer !== "y" && answer !== "yes") {
    console.log("Nothing changed.");
    return;
  }

  const now = Date.now();

  // ---- the provider, listed and verified ----------------------------------
  await db.collection("users").doc(provider).set(
    { role: "provider", verified: true, updatedAt: now },
    { merge: true },
  );

  await db.collection("providerProfiles").doc(provider).set({
    uid: provider,
    displayName: "Awa Ceesay (demo)",
    headline: "Mental health counselling — a calm space to talk things through",
    bio: "A demo listing for walking through Talk. Not a real person.",
    services: ["mental-health-counselling", "psychosocial-support"],
    languages: ["wo", "en"],
    specializations: ["grief", "family", "depression"],
    qualifications: ["BSc Psychology (demo)", "Certificate in counselling (demo)"],
    yearsExperience: 9,
    sessionRateMinor: 80000,
    status: "verified",
    photoPath: null,
    ratingAvg: 4.8,
    ratingCount: 0,
    timezone: "Africa/Banjul",
    gender: "woman",
    formats: ["video"],
    location: "banjul",
    // Labelled in the UI as a sample, because it is one.
    sample: true,
    createdAt: now,
    updatedAt: now,
  });

  // ---- a conversation with something already in it ------------------------
  const participants = [patient, provider].sort();
  await db.collection("chats").doc(chatId).set({
    participants,
    names: { [patient]: "You", [provider]: "Awa Ceesay (demo)" },
    lastMessage: "Thank you for reaching out. How does Tuesday sound?",
    lastMessageAt: now,
    unread: { [patient]: 1, [provider]: 0 },
    typing: {},
    createdAt: now - 60_000,
  });

  const messages = db.collection("chats").doc(chatId).collection("messages");
  const script = [
    [patient, "Hello. Talk suggested I speak to you.", now - 50_000],
    [provider, "Hello, you are very welcome. What has been going on?", now - 30_000],
    [provider, "Thank you for reaching out. How does Tuesday sound?", now],
  ];
  const batch = db.batch();
  for (const [senderId, text, createdAt] of script) {
    batch.set(messages.doc(), {
      senderId,
      participants,
      kind: "text",
      text,
      mediaPath: null,
      durationSec: null,
      transcript: null,
      createdAt,
      readBy: [senderId],
    });
  }
  await batch.commit();

  // ---- hours, and one of them booked --------------------------------------
  const soon = Date.now() + 4 * 60_000;
  const offered = [soon, nextHour(60), nextHour(180), nextHour(24 * 60)];

  const slotBatch = db.batch();
  for (const startsAt of offered) {
    slotBatch.set(slots.doc(String(startsAt)), {
      providerId: provider,
      startsAt,
      endsAt: startsAt + 45 * 60_000,
      status: "open",
      bookingId: null,
    });
  }
  await slotBatch.commit();

  // The one starting in four minutes is booked, so Join is live immediately —
  // the call window opens ten minutes before a session starts.
  const booking = db.collection("bookings").doc();
  await db.runTransaction(async (tx) => {
    tx.set(booking, {
      patientId: patient,
      providerId: provider,
      participants: [patient, provider],
      slotId: String(soon),
      startsAt: soon,
      endsAt: soon + 45 * 60_000,
      status: "pending",
      paymentStatus: "unpaid",
      amountMinor: 80000,
      currency: "GMD",
      transactionId: null,
      patientNote: "Seeded by scripts/seed-demo.mjs.",
      createdAt: now,
      updatedAt: now,
    });
    tx.update(slots.doc(String(soon)), { status: "booked", bookingId: booking.id });
  });

  console.log("\nDone. Signed in as the patient:");
  console.log("  /dashboard   the conversation and the session are both on it");
  console.log("  /chats       one unread message waiting");
  console.log("  /sessions    one session, with Join live now");
  console.log(`  /call/${booking.id}`);
  console.log("\nSigned in as the provider (a second browser, or a private window):");
  console.log("  /chats             the same conversation, from their side");
  console.log("  /pro/availability  three more hours offered, one booked");
  console.log("  /sessions          the same session — open the call from both to test it");
  console.log("\nUndo with the same command plus --remove.");
}

await main();
