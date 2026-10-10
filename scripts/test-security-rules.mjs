/**
 * Security-rule tests: conversations, payments, and the user document.
 *
 *   node scripts/test-security-rules.mjs
 *
 * Runs against Firebase's own rules evaluator (firebaserules.googleapis.com
 * :test), which takes the rules source and a synthetic request and tells you
 * what the deployed engine would decide. No emulator, no accounts, no real
 * data — and it is the same evaluator that serves production, so a pass here
 * is not an approximation of the rule, it is the rule.
 *
 * These are the invariants the product depends on: nobody reads a
 * conversation they are not in, nobody writes a message into one, and no
 * client can mark its own payment as settled. Two holes in the chat rules
 * were found by writing these rather than by reading the rules again — see
 * the create rules in firestore.rules for both.
 */

import { readFile } from "node:fs/promises";
import { GoogleAuth } from "google-auth-library";

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || "talk-therapy-509209";
const KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./secrets/talk-admin-sa.json";

const DOCS = `/databases/(default)/documents`;
const PATIENT = "patient-uid";
const PROVIDER = "provider-uid";
const STRANGER = "stranger-uid";
const ADMIN = "admin-uid";
const CHAT = `${PATIENT}__${PROVIDER}`;

/** A chat document as `openChat` writes it. */
const chat = {
  participants: [PATIENT, PROVIDER],
  names: { [PATIENT]: "Fatou", [PROVIDER]: "Awa Ceesay" },
  lastMessage: "",
  lastMessageAt: "2026-10-03T12:00:00Z",
  unread: { [PATIENT]: 0, [PROVIDER]: 0 },
  typing: {},
  createdAt: "2026-10-03T12:00:00Z",
};

/** A message as `commitMessage` writes it. */
const message = {
  senderId: PATIENT,
  participants: [PATIENT, PROVIDER],
  kind: "text",
  text: "Good morning",
  mediaPath: null,
  durationSec: null,
  transcript: null,
  createdAt: "2026-10-03T12:01:00Z",
  readBy: [PATIENT],
};

/** A provider's public listing, as the profile form saves it. */
const listing = {
  uid: PROVIDER,
  displayName: "Awa Ceesay",
  headline: "Mental health counselling",
  bio: "",
  services: ["mental-health-counselling"],
  languages: ["wo", "en"],
  specializations: ["grief"],
  qualifications: [],
  yearsExperience: 9,
  sessionRateMinor: 80000,
  status: "pending",
  gender: "woman",
  location: "banjul",
  formats: ["video"],
  sample: false,
  ratingAvg: 0,
  ratingCount: 0,
};

/** An hour a provider is offering. */
const slot = {
  providerId: PROVIDER,
  startsAt: 1_790_000_000_000,
  endsAt: 1_790_002_700_000,
  status: "open",
  bookingId: null,
};

/** A session, as the server writes it. */
const booking = {
  patientId: PATIENT,
  providerId: PROVIDER,
  participants: [PATIENT, PROVIDER],
  slotId: "s1",
  startsAt: slot.startsAt,
  endsAt: slot.endsAt,
  status: "pending",
  paymentStatus: "unpaid",
  amountMinor: 80000,
  currency: "GMD",
};

/** A payment as the server records it before the shopper is redirected. */
const payment = {
  paymentIntentId: "pi_1",
  provider: "modempay",
  uid: PATIENT,
  purpose: "ai_initial",
  amountMinor: 200_00,
  currency: "GMD",
  status: "pending",
  fulfilled: false,
  needsReview: false,
};

/** The evaluator's clock for every request below. */
const NOW = "2026-10-03T12:05:00Z";
const BACKDATED = "2026-09-26T12:05:00Z";

/** A payout, and where a provider is paid, as the server writes them. */
const payout = {
  id: "po_1", providerId: PROVIDER, amountMinor: 68000, bookingIds: ["bk_1"], network: "wave",
  accountNumber: "7000000", accountHint: "••• 0000", beneficiaryName: "Awa Jallow",
  status: "pending", transferReference: null, failureReason: null, needsReview: false,
  createdAt: 1_790_000_000_000, updatedAt: 1_790_000_000_000,
};
const payoutAccount = {
  uid: PROVIDER, network: "wave", accountNumber: "7000000", beneficiaryName: "Awa Jallow", updatedAt: 1_790_000_000_000,
};

/** A provider-led group of three, and its call room. */
const THIRD = "third-uid";
const GROUP = "group_call_1";
const groupRoom = { chatId: GROUP, participants: [PATIENT, PROVIDER, THIRD], status: "active" };
const PAIR = [PATIENT, PROVIDER].sort().join("__");

/** A paid consultation, as the server writes it. */
const entitlement = {
  uid: PATIENT,
  aiTier: "initial",
  durationLimitSec: 480,
  status: "granted",
  paymentIntentId: "pi_1",
  amountMinor: 20000,
  grantedAt: 1_790_000_000_000,
  expiresAt: 1_790_086_400_000,
  updatedAt: 1_790_000_000_000,
};

/** One entry in the consent ledger, stamped by the server as it lands. */
const consent = {
  key: "dataProcessing",
  granted: true,
  surface: "therapy:spoken",
  recordedAt: NOW,
};

const CASES = [
  // --- reading a conversation -------------------------------------------
  ["a participant reads their chat", "ALLOW", PATIENT, "get", `${DOCS}/chats/${CHAT}`, chat],
  ["the provider reads the same chat", "ALLOW", PROVIDER, "get", `${DOCS}/chats/${CHAT}`, chat],
  ["a stranger cannot read it", "DENY", STRANGER, "get", `${DOCS}/chats/${CHAT}`, chat],
  ["nobody signed in cannot read it", "DENY", null, "get", `${DOCS}/chats/${CHAT}`, chat],
  ["a participant reads a message", "ALLOW", PROVIDER, "get", `${DOCS}/chats/${CHAT}/messages/m1`, message],
  ["a stranger cannot read a message", "DENY", STRANGER, "get", `${DOCS}/chats/${CHAT}/messages/m1`, message],

  // --- opening one -------------------------------------------------------
  ["opening a chat you are in", "ALLOW", PATIENT, "create", `${DOCS}/chats/${CHAT}`, null, chat],
  ["opening a chat between two other people", "DENY", STRANGER, "create", `${DOCS}/chats/${CHAT}`, null, chat],
  ["a one-person chat", "DENY", PATIENT, "create", `${DOCS}/chats/solo`, null, { ...chat, participants: [PATIENT] }],
  // Squatting: claiming the id that two other people's chat will need, so
  // that they can never open it. The id has to match the pair.
  ["squatting on the id of a chat between two other people", "DENY", STRANGER, "create",
    `${DOCS}/chats/${CHAT}`, null, { ...chat, participants: [STRANGER, PROVIDER] }],
  ["a chat at an id that is not its participants", "DENY", PATIENT, "create",
    `${DOCS}/chats/something-else`, null, chat],

  // Group sessions are provider-led: only a provider may start one, and must
  // record themselves as the one who did. A client cannot gather other
  // clients into a room.
  ["a provider starts a group session", "ALLOW", PROVIDER, "create", `${DOCS}/chats/group_1`, null,
    { ...chat, participants: [PATIENT, PROVIDER, STRANGER], title: "Thursday group", createdBy: PROVIDER }],
  ["a patient starts a group", "DENY", PATIENT, "create", `${DOCS}/chats/group_2`, null,
    { ...chat, participants: [PATIENT, PROVIDER, STRANGER], title: "Our group", createdBy: PATIENT }],
  ["a provider starts a group in somebody else's name", "DENY", PROVIDER, "create", `${DOCS}/chats/group_3`, null,
    { ...chat, participants: [PATIENT, PROVIDER, STRANGER], createdBy: PATIENT }],
  ["a provider starts a group they are not in", "DENY", PROVIDER, "create", `${DOCS}/chats/group_4`, null,
    { ...chat, participants: [PATIENT, STRANGER, "another-uid"], createdBy: PROVIDER }],

  // --- sending -----------------------------------------------------------
  ["sending a message as yourself", "ALLOW", PATIENT, "create", `${DOCS}/chats/${CHAT}/messages/m2`, null, message],
  ["sending a message as somebody else", "DENY", PROVIDER, "create", `${DOCS}/chats/${CHAT}/messages/m2`, null, message],
  ["a stranger cannot send into the chat", "DENY", STRANGER, "create", `${DOCS}/chats/${CHAT}/messages/m2`, null,
    { ...message, senderId: STRANGER, participants: [STRANGER, PROVIDER] }],

  // --- the invariant that matters most -----------------------------------
  ["adding somebody to a live chat", "DENY", PATIENT, "update", `${DOCS}/chats/${CHAT}`, chat,
    { ...chat, participants: [PATIENT, PROVIDER, STRANGER] }],
  ["removing somebody from a chat", "DENY", PATIENT, "update", `${DOCS}/chats/${CHAT}`, chat,
    { ...chat, participants: [PATIENT] }],
  ["updating the preview and unread counts", "ALLOW", PATIENT, "update", `${DOCS}/chats/${CHAT}`, chat,
    { ...chat, lastMessage: "Good morning", unread: { [PATIENT]: 0, [PROVIDER]: 1 } }],
  ["a stranger cannot touch the chat", "DENY", STRANGER, "update", `${DOCS}/chats/${CHAT}`, chat,
    { ...chat, lastMessage: "hello" }],

  // --- read receipts -----------------------------------------------------
  ["marking a message read as yourself", "ALLOW", PROVIDER, "update", `${DOCS}/chats/${CHAT}/messages/m1`, message,
    { ...message, readBy: [PATIENT, PROVIDER] }],
  ["marking it read on somebody else's behalf", "DENY", PROVIDER, "update", `${DOCS}/chats/${CHAT}/messages/m1`, message,
    { ...message, readBy: [PATIENT, STRANGER] }],
  ["editing the words of a sent message", "DENY", PATIENT, "update", `${DOCS}/chats/${CHAT}/messages/m1`, message,
    { ...message, text: "something else" }],
  ["dropping a receipt that was already there", "DENY", PROVIDER, "update", `${DOCS}/chats/${CHAT}/messages/m1`, message,
    { ...message, readBy: [PROVIDER] }],

  // --- deletion ----------------------------------------------------------
  ["deleting the conversation", "DENY", PATIENT, "delete", `${DOCS}/chats/${CHAT}`, chat],
  ["deleting a message", "DENY", PATIENT, "delete", `${DOCS}/chats/${CHAT}/messages/m1`, message],

  // --- the one that was already broken once ------------------------------
  ["a stranger reading somebody's user document", "DENY", STRANGER, "get", `${DOCS}/users/${PATIENT}`,
    { uid: PATIENT, role: "patient", displayName: "Fatou" }],

  // --- payments ----------------------------------------------------------
  // Only the signed webhook may move payment state, and it runs with the
  // Admin SDK, which bypasses these rules. From a client, everything is shut.
  ["reading your own payment", "ALLOW", PATIENT, "get", `${DOCS}/payments/pi_1`, payment],
  ["reading somebody else's payment", "DENY", STRANGER, "get", `${DOCS}/payments/pi_1`, payment],
  ["listing payments", "DENY", PATIENT, "list", `${DOCS}/payments/pi_1`, payment],
  ["marking your own payment fulfilled", "DENY", PATIENT, "update", `${DOCS}/payments/pi_1`, payment,
    { ...payment, fulfilled: true }],
  ["creating a payment from the client", "DENY", PATIENT, "create", `${DOCS}/payments/pi_2`, null, payment],
  // Pre-recording a real event's key would make the genuine webhook skip it as
  // a duplicate: money taken, nothing delivered.
  ["pre-recording a webhook event key", "DENY", PATIENT, "create", `${DOCS}/paymentEvents/evt_1`, null,
    { eventKey: "evt_1", paymentIntentId: "pi_1" }],
  ["reading the event ledger", "DENY", PATIENT, "get", `${DOCS}/paymentEvents/evt_1`, { eventKey: "evt_1" }],

  // --- a provider's own listing ------------------------------------------
  // The whole point of "verified" is that somebody else checked, so the one
  // thing a provider must not be able to write is that word.
  ["listing yourself for review", "ALLOW", PROVIDER, "create", `${DOCS}/providerProfiles/${PROVIDER}`,
    null, listing],
  ["listing yourself as already verified", "DENY", PROVIDER, "create", `${DOCS}/providerProfiles/${PROVIDER}`,
    null, { ...listing, status: "verified" }],
  ["editing your own listing", "ALLOW", PROVIDER, "update", `${DOCS}/providerProfiles/${PROVIDER}`,
    listing, { ...listing, headline: "Grief and loss" }],
  ["verifying yourself by editing", "DENY", PROVIDER, "update", `${DOCS}/providerProfiles/${PROVIDER}`,
    listing, { ...listing, status: "verified" }],
  ["listing somebody else", "DENY", STRANGER, "create", `${DOCS}/providerProfiles/${PROVIDER}`,
    null, listing],
  ["editing somebody else's listing", "DENY", STRANGER, "update", `${DOCS}/providerProfiles/${PROVIDER}`,
    listing, { ...listing, headline: "Not theirs to write" }],
  ["a patient listing themselves as a provider", "DENY", PATIENT, "create", `${DOCS}/providerProfiles/${PATIENT}`,
    null, { ...listing, uid: PATIENT }],
  // The public directory: a verified profile is readable by anyone, including
  // somebody who has not signed in. One that is still being checked is not.
  ["anyone reads a verified listing", "ALLOW", null, "get", `${DOCS}/providerProfiles/${PROVIDER}`,
    { ...listing, status: "verified" }],
  ["a stranger reads a listing still being checked", "DENY", STRANGER, "get",
    `${DOCS}/providerProfiles/${PROVIDER}`, listing],
  ["a provider reads their own listing before it is checked", "ALLOW", PROVIDER, "get",
    `${DOCS}/providerProfiles/${PROVIDER}`, listing],

  // --- sessions ----------------------------------------------------------
  // A booking and the slot it takes have to change together, and a patient
  // cannot write a provider's slots — so bookings are made by the server and
  // the client path is shut. These prove it is actually shut.
  ["reading your own session", "ALLOW", PATIENT, "get", `${DOCS}/bookings/bk_1`, booking],
  ["the provider reads the same session", "ALLOW", PROVIDER, "get", `${DOCS}/bookings/bk_1`, booking],
  ["a stranger reads it", "DENY", STRANGER, "get", `${DOCS}/bookings/bk_1`, booking],
  ["booking straight from the browser", "DENY", PATIENT, "create", `${DOCS}/bookings/bk_2`, null, booking],
  ["marking your own session paid", "DENY", PATIENT, "update", `${DOCS}/bookings/bk_1`, booking,
    { ...booking, paymentStatus: "paid" }],
  ["cancelling from the browser", "DENY", PATIENT, "update", `${DOCS}/bookings/bk_1`, booking,
    { ...booking, status: "cancelled" }],

  // The Meet fallback: the provider may attach a link — that one field, only
  // a meet.google.com address — and nobody else may.
  ["the provider attaches a Meet link", "ALLOW", PROVIDER, "update", `${DOCS}/bookings/bk_1`, booking,
    { ...booking, meetUrl: "https://meet.google.com/abc-defg-hij", updatedAt: 2 }],
  ["the provider clears it", "ALLOW", PROVIDER, "update", `${DOCS}/bookings/bk_1`,
    { ...booking, meetUrl: "https://meet.google.com/abc-defg-hij" }, { ...booking, meetUrl: null }],
  ["the patient attaches a link", "DENY", PATIENT, "update", `${DOCS}/bookings/bk_1`, booking,
    { ...booking, meetUrl: "https://meet.google.com/abc-defg-hij" }],
  ["a link that is not Google Meet", "DENY", PROVIDER, "update", `${DOCS}/bookings/bk_1`, booking,
    { ...booking, meetUrl: "https://evil.example/meet.google.com/x" }],
  ["a lookalike domain", "DENY", PROVIDER, "update", `${DOCS}/bookings/bk_1`, booking,
    { ...booking, meetUrl: "https://meet.google.com.evil.example/x" }],
  ["marking it paid alongside the link", "DENY", PROVIDER, "update", `${DOCS}/bookings/bk_1`, booking,
    { ...booking, meetUrl: "https://meet.google.com/abc-defg-hij", paymentStatus: "paid" }],

  // A provider owns their calendar; nobody else may touch it. A patient
  // taking a slot goes through the server, which is why this stays shut even
  // though booking needs the slot to change.
  ["a provider offers an hour", "ALLOW", PROVIDER, "create",
    `${DOCS}/availability/${PROVIDER}/slots/s1`, null, slot],
  ["a provider withdraws an hour", "ALLOW", PROVIDER, "delete",
    `${DOCS}/availability/${PROVIDER}/slots/s1`, slot],
  ["a patient marks a slot taken", "DENY", PATIENT, "update",
    `${DOCS}/availability/${PROVIDER}/slots/s1`, slot, { ...slot, status: "booked" }],
  ["a patient blocks out somebody's calendar", "DENY", PATIENT, "create",
    `${DOCS}/availability/${PROVIDER}/slots/s2`, null, slot],
  ["a patient can see the free hours", "ALLOW", PATIENT, "get",
    `${DOCS}/availability/${PROVIDER}/slots/s1`, slot],

  // --- the call room -----------------------------------------------------
  // The room id IS the booking id, so the participant list is checked against
  // the booking rather than taken from whoever got there first. Without that,
  // a stranger could create the room for somebody else's session listing only
  // themselves — they would hear nothing, but the two people with the
  // appointment would both be locked out of their own call.
  ["opening the room for your own session", "ALLOW", PATIENT, "create",
    `${DOCS}/calls/bk_1`, null, { participants: [PATIENT, PROVIDER] }],
  ["the provider opens the same room", "ALLOW", PROVIDER, "create",
    `${DOCS}/calls/bk_1`, null, { participants: [PATIENT, PROVIDER] }],
  ["squatting on somebody else's call room", "DENY", STRANGER, "create",
    `${DOCS}/calls/bk_1`, null, { participants: [STRANGER] }],
  ["adding yourself to somebody else's call room", "DENY", STRANGER, "create",
    `${DOCS}/calls/bk_1`, null, { participants: [PATIENT, PROVIDER, STRANGER] }],
  ["reading a call room you are in", "ALLOW", PROVIDER, "get",
    `${DOCS}/calls/bk_1`, { participants: [PATIENT, PROVIDER] }],
  ["reading a call room you are not in", "DENY", STRANGER, "get",
    `${DOCS}/calls/bk_1`, { participants: [PATIENT, PROVIDER] }],
  ["rewriting who is in a live call", "DENY", PATIENT, "update",
    `${DOCS}/calls/bk_1`, { participants: [PATIENT, PROVIDER] },
    { participants: [PATIENT, PROVIDER, STRANGER] }],

  // --- the consent ledger ------------------------------------------------
  // A consent record is evidence. Its shape is fixed and its time is the
  // server's, so nobody can write a consent "given" before the session it is
  // used to justify — and nobody can write one for somebody else.
  ["recording your own consent", "ALLOW", PATIENT, "create",
    `${DOCS}/users/${PATIENT}/consentEvents/c1`, null, consent],
  ["recording a guardian's consent with its evidence", "ALLOW", PATIENT, "create",
    `${DOCS}/users/${PATIENT}/consentEvents/c2`, null,
    { ...consent, key: "guardianConsent", detail: { relationship: "mother", signedName: "Awa Jallow" } }],
  ["backdating a consent", "DENY", PATIENT, "create",
    `${DOCS}/users/${PATIENT}/consentEvents/c3`, null, { ...consent, recordedAt: BACKDATED }],
  ["slipping an extra field into the ledger", "DENY", PATIENT, "create",
    `${DOCS}/users/${PATIENT}/consentEvents/c4`, null, { ...consent, verifiedBy: "admin" }],
  ["a consent that is not a yes or a no", "DENY", PATIENT, "create",
    `${DOCS}/users/${PATIENT}/consentEvents/c5`, null, { ...consent, granted: "yes" }],
  ["recording consent for somebody else", "DENY", STRANGER, "create",
    `${DOCS}/users/${PATIENT}/consentEvents/c6`, null, consent],
  ["rewriting a consent already given", "DENY", PATIENT, "update",
    `${DOCS}/users/${PATIENT}/consentEvents/c1`, consent, { ...consent, granted: false }],
  ["erasing a consent already given", "DENY", PATIENT, "delete",
    `${DOCS}/users/${PATIENT}/consentEvents/c1`, consent],

  // --- the paid consultation -------------------------------------------
  // Written only by the server, in the transaction that marks the payment
  // fulfilled. A client that could write here could grant itself the D200
  // consultation without paying.
  ["reading your own consultation", "ALLOW", PATIENT, "get",
    `${DOCS}/entitlements/${PATIENT}`, entitlement],
  ["reading somebody else's", "DENY", STRANGER, "get",
    `${DOCS}/entitlements/${PATIENT}`, entitlement],
  ["listing who has paid", "DENY", PATIENT, "list",
    `${DOCS}/entitlements/${PATIENT}`, entitlement],
  ["granting yourself a consultation", "DENY", PATIENT, "create",
    `${DOCS}/entitlements/${PATIENT}`, null, entitlement],
  ["extending your own consultation", "DENY", PATIENT, "update",
    `${DOCS}/entitlements/${PATIENT}`, entitlement, { ...entitlement, expiresAt: 4_102_444_800_000 }],
  ["upgrading your own consultation", "DENY", PATIENT, "update",
    `${DOCS}/entitlements/${PATIENT}`, entitlement, { ...entitlement, aiTier: "extended" }],

  // --- paying providers ---------------------------------------------------
  // Written only by the server. A provider who could write a payout could
  // mark one complete that never left, or free their sessions to be paid
  // again; one who could write their account could not be audited.
  ["a provider reads their own payout", "ALLOW", PROVIDER, "get", `${DOCS}/payouts/po_1`, payout],
  ["a stranger reads a provider's payout", "DENY", STRANGER, "get", `${DOCS}/payouts/po_1`, payout],
  ["a provider marks a payout complete", "DENY", PROVIDER, "update", `${DOCS}/payouts/po_1`, payout,
    { ...payout, status: "completed" }],
  ["a provider invents a payout", "DENY", PROVIDER, "create", `${DOCS}/payouts/po_2`, null, payout],
  ["a provider reads where they are paid", "ALLOW", PROVIDER, "get", `${DOCS}/payoutAccounts/${PROVIDER}`, payoutAccount],
  ["a stranger reads where a provider is paid", "DENY", STRANGER, "get", `${DOCS}/payoutAccounts/${PROVIDER}`, payoutAccount],
  ["a provider changes their account from the browser", "DENY", PROVIDER, "update", `${DOCS}/payoutAccounts/${PROVIDER}`,
    payoutAccount, { ...payoutAccount, accountNumber: "9999999" }],
  ["somebody redirects a provider's money", "DENY", STRANGER, "update", `${DOCS}/payoutAccounts/${PROVIDER}`,
    payoutAccount, { ...payoutAccount, accountNumber: "9999999" }],
  ["a session marked paid out from the browser", "DENY", PROVIDER, "update", `${DOCS}/bookings/bk_1`, booking,
    { ...booking, payoutId: "po_9" }],

  // --- a group session's call ---------------------------------------------
  ["a member opens the group's call", "ALLOW", PATIENT, "create", `${DOCS}/groupCalls/${GROUP}`, null, groupRoom],
  ["a stranger opens it", "DENY", STRANGER, "create", `${DOCS}/groupCalls/${GROUP}`, null,
    { ...groupRoom, participants: [STRANGER] }],
  ["a member opens it with a different list", "DENY", PATIENT, "create", `${DOCS}/groupCalls/${GROUP}`, null,
    { ...groupRoom, participants: [PATIENT, PROVIDER, STRANGER] }],
  ["a member says they are here", "ALLOW", PATIENT, "create", `${DOCS}/groupCalls/${GROUP}/present/${PATIENT}`, null,
    { uid: PATIENT, session: "s1", heartbeatAt: 1 }],
  ["saying somebody else is here", "DENY", PATIENT, "create", `${DOCS}/groupCalls/${GROUP}/present/${PROVIDER}`, null,
    { uid: PROVIDER, session: "s1", heartbeatAt: 1 }],
  ["a stranger says they are here", "DENY", STRANGER, "create", `${DOCS}/groupCalls/${GROUP}/present/${STRANGER}`, null,
    { uid: STRANGER, session: "s1", heartbeatAt: 1 }],
  ["one of a pair opens their link", "ALLOW", PATIENT, "create", `${DOCS}/groupCalls/${GROUP}/links/${PAIR}`, null,
    { members: [PATIENT, PROVIDER] }],
  ["a third member reads a pair's link", "DENY", THIRD, "get", `${DOCS}/groupCalls/${GROUP}/links/${PAIR}`,
    { members: [PATIENT, PROVIDER] }],
  ["a candidate sent in somebody else's name", "DENY", PATIENT, "create",
    `${DOCS}/groupCalls/${GROUP}/links/${PAIR}/candidates/c1`, null, { from: PROVIDER, session: "s1" }],

  // --- the staff review queues -------------------------------------------
  ["staff list payments held for review", "ALLOW", ADMIN, "list", `${DOCS}/payments/pi_1`, payment],
  ["staff list flagged payouts", "ALLOW", ADMIN, "list", `${DOCS}/payouts/po_1`, payout],
  ["staff list disputed sessions", "ALLOW", ADMIN, "list", `${DOCS}/bookings/bk_1`, { ...booking, disputed: true }],
  ["a patient lists the payments queue", "DENY", PATIENT, "list", `${DOCS}/payments/pi_1`, payment],
  ["a provider lists another provider's payouts", "DENY", STRANGER, "list", `${DOCS}/payouts/po_1`, payout],
  ["staff cannot rewrite a payment from the browser", "DENY", ADMIN, "update", `${DOCS}/payments/pi_1`, payment,
    { ...payment, fulfilled: true }],
];

/**
 * Sending a message makes the rules get() the parent chat, so the evaluator
 * needs to be told what that read returns. Every message-create case is
 * mocked with the real chat above — which is the whole point: a sender who
 * made up their own participant list is then measured against the true one.
 */
const parentChatMock = {
  function: "get",
  args: [{ exactValue: `${DOCS}/chats/${CHAT}` }],
  result: { value: { data: chat } },
};

/**
 * `hasRole()` and `isAdmin()` read the caller's user document, so any rule
 * that uses them needs that read answered. Mocked by path, so one set covers
 * whoever is acting.
 */
const userDocMocks = [
  [PROVIDER, "provider"],
  [PATIENT, "patient"],
  [STRANGER, "patient"],
  [ADMIN, "admin"],
].map(([uid, role]) => ({
  function: "get",
  args: [{ exactValue: `${DOCS}/users/${uid}` }],
  result: { value: { data: { uid, role } } },
}));

const testCase = ([, expectation, uid, method, path, existing, incoming]) => ({
  expectation,
  request: {
    auth: uid ? { uid, token: { sub: uid, firebase: { sign_in_provider: "password" } } } : null,
    path,
    method,
    time: NOW,
    ...(incoming ? { resource: { data: incoming } } : {}),
  },
  ...(existing ? { resource: { data: existing } } : {}),
  ...(method === "create" && path.includes("/messages/")
    ? { functionMocks: [parentChatMock] }
    : {}),
  ...(path.includes("/providerProfiles/") ? { functionMocks: userDocMocks } : {}),
  // The group call room checks members against the chat, then its own room.
  ...(path.includes("/groupCalls/")
    ? {
        functionMocks: [
          { function: "get", args: [{ exactValue: `${DOCS}/chats/${GROUP}` }], result: { value: { data: { participants: groupRoom.participants } } } },
          { function: "get", args: [{ exactValue: `${DOCS}/groupCalls/${GROUP}` }], result: { value: { data: groupRoom } } },
        ],
      }
    : {}),
  // The staff review queues ask whether the caller is an admin.
  ...(method === "list" && /\/(payments|payouts|bookings)\//.test(path) ? { functionMocks: userDocMocks } : {}),
  // Starting a group asks whether the caller is a provider.
  ...(method === "create" && /\/chats\/[^/]+$/.test(path) ? { functionMocks: userDocMocks } : {}),
  // Creating a call room reads the booking it belongs to, which is the whole
  // point of that rule — so the evaluator has to be told what it says.
  ...(method === "create" && path.includes("/calls/")
    ? {
        functionMocks: [
          {
            function: "get",
            args: [{ exactValue: `${DOCS}/bookings/bk_1` }],
            result: { value: { data: booking } },
          },
        ],
      }
    : {}),
});

/**
 * Everything below is inside a function purely so it can return.
 *
 * `process.exit()` here trips a libuv assertion on Windows — it tears the
 * loop down while the auth client's sockets are still closing, and the real
 * exit code is lost behind the crash. Returning lets Node drain and exit on
 * its own.
 */
async function main() {
const source = await readFile("firestore.rules", "utf8");

/**
 * The deploy service account can release rules but not evaluate them, so this
 * also takes a token from the environment:
 *
 *   RULES_TEST_ACCESS_TOKEN=$(gcloud auth print-access-token --account=<owner>) \
 *     node scripts/test-security-rules.mjs
 *
 * An owner's own gcloud credential already has the permission, which beats
 * widening the service account's. The call only ever evaluates rules source
 * against synthetic requests — it reads no data.
 */
const token =
  process.env.RULES_TEST_ACCESS_TOKEN ||
  (await (
    await new GoogleAuth({
      keyFile: KEY,
      scopes: "https://www.googleapis.com/auth/cloud-platform",
    }).getClient()
  ).getAccessToken()).token;

const res = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}:test`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    // A user credential (the gcloud path above) carries no project of its own,
    // and this API bills against one. Harmless with a service-account token,
    // which already belongs to the project.
    "x-goog-user-project": PROJECT,
  },
  body: JSON.stringify({
    source: { files: [{ name: "firestore.rules", content: source }] },
    testSuite: { testCases: CASES.map(testCase) },
  }),
});

if (!res.ok) {
  const body = await res.text();
  if (res.status === 403 && body.includes("firebaserules.rulesets.test")) {
    // The deploy service account can release rules but not evaluate them —
    // separate permissions, and only the second one is missing. One grant,
    // and this suite runs:
    //
    //   gcloud projects add-iam-policy-binding talk-therapy-509209
    //     --member=serviceAccount:talk-admin@talk-therapy-509209.iam.gserviceaccount.com
    //     --role=roles/firebaserules.admin
    //
    // It only ever evaluates rules source against synthetic requests; it
    // grants no access to any data.
    console.error(
      [
        "The service account cannot call the rules evaluator: it is missing",
        "firebaserules.rulesets.test. See the note above this message in",
        "scripts/test-security-rules.mjs for the one command that fixes it.",
      ].join("\n"),
    );
    process.exitCode = 2;
    return;
  }
  console.error(`rules test API ${res.status}: ${body}`);
  process.exitCode = 1;
  return;
}

const { testResults = [], issues = [] } = await res.json();

for (const issue of issues) {
  console.log(`${issue.severity}: ${issue.description} (line ${issue.sourcePosition?.line})`);
}

let failures = 0;
CASES.forEach(([what, expectation], index) => {
  const result = testResults[index];
  const ok = result?.state === "SUCCESS";
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${expectation.padEnd(5)} ${what}`);
  if (!ok && result?.debugMessages?.length) {
    for (const line of result.debugMessages) console.log(`        ${line}`);
  }
});

console.log(failures ? `\n${failures} of ${CASES.length} FAILED` : `\nAll ${CASES.length} rule checks passed`);
process.exitCode = failures ? 1 : 0;
}

await main();
