/**
 * Unit test for the Modem Pay webhook verifier and fulfilment logic.
 *
 *   node scripts/test-modempay-webhook.mjs
 *
 * NETWORK-FREE AND CREDENTIAL-FREE. It signs bodies with made-up secrets and
 * checks that the real verifier in app/lib/payments/modempay-protocol.ts
 * accepts, rejects and de-duplicates them correctly. No part of it contacts
 * api.modempay.com, and the keys below are obviously fake.
 *
 * This is the main proof that the integration is correct, because the webhook
 * is the one place where being wrong costs real money and the one place that
 * can be tested without a merchant account.
 *
 * It imports the production module directly (Node strips the types), so there
 * is no second copy of the HMAC logic that could be right while the shipped
 * one is wrong.
 */

import { createHmac } from "node:crypto";
import {
  CARD_MINIMUM_MINOR,
  amountsAgree,
  buildCheckoutBody,
  decideFulfilment,
  normaliseWebhookEvent,
  paymentMethodsFor,
  readCheckoutResponse,
  signatureStats,
  timingSafeStringEqual,
  verifyWebhookSignature,
  webhookEventKey,
} from "../app/lib/payments/modempay-protocol.ts";

// Fake secrets. Note the deliberate whitespace: a key pasted out of a web
// dashboard arrives like this far more often than anyone admits, and the
// verifier must trim it or HMAC silently never matches.
const MERCHANT_SECRET = "sk_test_merchant_not_a_real_key";
const WEBHOOK_SECRET = "whsec_test_dashboard_not_a_real_key";
const MERCHANT_SECRET_PASTED = `  ${MERCHANT_SECRET}\n`;
const WEBHOOK_SECRET_PASTED = `${WEBHOOK_SECRET}  `;

const candidates = [
  { routing: "merchant-secret-key", secret: MERCHANT_SECRET_PASTED },
  { routing: "webhook-signing-secret", secret: WEBHOOK_SECRET_PASTED },
];

/** What the provider does: hex HMAC-SHA512 over the exact bytes it sends. */
const sign = (secret, body) => createHmac("sha512", secret).update(body, "utf8").digest("hex");

let failures = 0;
function check(ok, what) {
  console.log(`  ${ok ? "✓" : "✗"} ${what}`);
  if (!ok) failures += 1;
}

const SUCCESS_BODY = JSON.stringify({
  event: "charge.succeeded",
  event_id: "evt_01HQ8ZK",
  data: {
    payment_intent_id: "pi_test_abc123",
    status: "completed",
    // MAJOR units, as Modem Pay reports them: D200, not 20000 bututs.
    amount: 200,
    customer_email: "fatou@example.gm",
    metadata: { uid: "user_fatou", purpose: "ai_initial", amount_minor: "20000" },
  },
});

// --------------------------------------------------------------- signature

console.log("Both signing routings are accepted");
{
  // Modem Pay signs with the MERCHANT key for a per-intent callback_url...
  const merchant = verifyWebhookSignature(SUCCESS_BODY, sign(MERCHANT_SECRET, SUCCESS_BODY), candidates);
  check(merchant.ok, "a delivery signed with the merchant secret key verifies");
  check(merchant.routing === "merchant-secret-key", `routing reported as ${merchant.routing}`);

  // ...and with the WEBHOOK signing secret for a dashboard webhook. Verifying
  // against only one of the two rejects half of all genuine events.
  const dashboard = verifyWebhookSignature(SUCCESS_BODY, sign(WEBHOOK_SECRET, SUCCESS_BODY), candidates);
  check(dashboard.ok, "a delivery signed with the webhook signing secret verifies");
  check(dashboard.routing === "webhook-signing-secret", `routing reported as ${dashboard.routing}`);

  check(merchant.form === "raw" && dashboard.form === "raw", "both matched the raw bytes");
}

console.log("\nSecrets are trimmed before use");
{
  // The candidates above hold the pasted-with-whitespace forms, so the two
  // checks passing at all proves the trim happens. This pins it explicitly.
  const untrimmed = verifyWebhookSignature(
    SUCCESS_BODY,
    sign(MERCHANT_SECRET, SUCCESS_BODY),
    [{ routing: "merchant-secret-key", secret: `\n\t${MERCHANT_SECRET}   \n` }],
  );
  check(untrimmed.ok, "a secret with stray newlines and spaces still verifies");

  const blank = verifyWebhookSignature(SUCCESS_BODY, sign(MERCHANT_SECRET, SUCCESS_BODY), [
    { routing: "merchant-secret-key", secret: "   " },
    { routing: "webhook-signing-secret", secret: undefined },
  ]);
  check(!blank.ok, "an unset secret is skipped, not treated as the empty key");
}

console.log("\nA re-serialised body still verifies");
{
  // A proxy that parses and re-emits JSON changes the bytes without changing
  // the meaning. The verifier tries the canonical form too.
  const spaced = JSON.stringify(JSON.parse(SUCCESS_BODY), null, 2);
  const verdict = verifyWebhookSignature(spaced, sign(MERCHANT_SECRET, JSON.stringify(JSON.parse(spaced))), candidates);
  check(verdict.ok && verdict.form === "restringified", `matched the canonical form (${verdict.form})`);
}

console.log("\nForgeries are rejected");
{
  const good = sign(MERCHANT_SECRET, SUCCESS_BODY);

  // One hex nibble changed: the signature no longer corresponds to the body.
  const flipped = `${good.slice(0, -1)}${good.endsWith("a") ? "b" : "a"}`;
  check(!verifyWebhookSignature(SUCCESS_BODY, flipped, candidates).ok, "a tampered signature is rejected");

  // The body changed after signing — an attacker raising the amount they paid.
  const tampered = SUCCESS_BODY.replace('"amount":200', '"amount":2');
  check(tampered !== SUCCESS_BODY, "(the tampered body really differs)");
  check(!verifyWebhookSignature(tampered, good, candidates).ok, "a tampered body is rejected");

  // A valid signature made with a key we do not know.
  check(
    !verifyWebhookSignature(SUCCESS_BODY, sign("sk_test_someone_elses_key", SUCCESS_BODY), candidates).ok,
    "a signature from an unknown key is rejected",
  );

  check(!verifyWebhookSignature(SUCCESS_BODY, null, candidates).ok, "a missing signature header is rejected");
  check(!verifyWebhookSignature(SUCCESS_BODY, "", candidates).ok, "an empty signature header is rejected");
  check(!verifyWebhookSignature(SUCCESS_BODY, "not-hex-at-all", candidates).ok, "a nonsense header is rejected");
}

console.log("\nComparison is constant-time");
{
  // `timingSafeEqual` throws on unequal-length buffers, so the tempting guard
  // is `a.length === b.length && timingSafeEqual(...)` — which short-circuits
  // on exactly the input an attacker controls. These checks pin down that the
  // verifier does the same work whatever it is handed.
  const good = sign(MERCHANT_SECRET, SUCCESS_BODY);

  check(timingSafeStringEqual(good, good), "identical strings compare equal");
  check(!timingSafeStringEqual(good, good.slice(0, 10)), "a much shorter string compares unequal without throwing");
  check(!timingSafeStringEqual(good, `${good}deadbeef`), "a longer string compares unequal without throwing");
  check(!timingSafeStringEqual("", good), "an empty string compares unequal without throwing");

  // Equal work regardless of length: a 1-character forgery must cost the same
  // number of digests and compares as a full-length one.
  const workFor = (header) => {
    const before = { ...signatureStats };
    verifyWebhookSignature(SUCCESS_BODY, header, candidates);
    return {
      digests: signatureStats.digests - before.digests,
      compares: signatureStats.compares - before.compares,
    };
  };

  const short = workFor("ab");
  const full = workFor(`${good.slice(0, -1)}f`);
  const valid = workFor(good);
  check(
    short.digests === full.digests && full.digests === valid.digests,
    `same number of HMACs for a 2-char, a full-length and a valid signature (${valid.digests} each)`,
  );
  check(
    short.compares === full.compares && full.compares === valid.compares,
    `same number of compares in all three cases (${valid.compares} each)`,
  );
  check(valid.digests >= candidates.length, "every candidate secret was tried even once a match was found");

  // A signature differing in the FIRST character must cost the same as one
  // differing only in the LAST — no byte-by-byte early exit.
  const early = workFor(`${good.endsWith("a") ? "b" : "a"}${good.slice(1)}`);
  const late = workFor(`${good.slice(0, -1)}${good.endsWith("a") ? "b" : "a"}`);
  check(
    early.digests === late.digests && early.compares === late.compares,
    "an early-differing and a late-differing signature cost the same",
  );
}

// ------------------------------------------------------------ event shapes

console.log("\nEvent envelopes are read in every shape seen in the wild");
{
  // `event` + `payload`...
  const a = normaliseWebhookEvent({
    event: "payment_intent.succeeded",
    payload: { payment_intent_id: "pi_1", status: "successful", amount: 500, metadata: { uid: "u1", purpose: "ai_extended" } },
  });
  check(a.outcome === "succeeded" && a.uid === "u1" && a.paymentIntentId === "pi_1", "event + payload");

  // ...and `type` + `data`.
  const b = normaliseWebhookEvent({
    type: "checkout.completed",
    data: { payment_intent_id: "pi_2", status: "paid", amount: 200, metadata: { uid: "u2", purpose: "ai_initial" } },
  });
  check(b.outcome === "succeeded" && b.uid === "u2" && b.amountMajor === 200, "type + data");

  for (const status of ["completed", "successful", "success", "succeeded", "paid"]) {
    const e = normaliseWebhookEvent({ type: "something.unrecognised", data: { payment_intent_id: "pi", status } });
    check(e.outcome === "succeeded", `status "${status}" counts as paid`);
  }

  for (const name of ["charge.failed", "charge.cancelled", "charge.expired", "payment_intent.failed"]) {
    const e = normaliseWebhookEvent({ event: name, data: { payment_intent_id: "pi" } });
    check(e.outcome === "failed", `event "${name}" counts as a failure`);
  }

  const unknown = normaliseWebhookEvent({ event: "customer.updated", data: { payment_intent_id: "pi" } });
  check(unknown.outcome === "unknown", "an event we do not handle is neither paid nor failed");

  // Failure must win a contradiction, or a crafted envelope naming a success
  // event with a failed status would hand out a consultation for nothing.
  const contradictory = normaliseWebhookEvent({
    event: "charge.succeeded",
    data: { payment_intent_id: "pi", status: "failed" },
  });
  check(contradictory.outcome === "failed", "a success event with a failed status is treated as failed");
}

console.log("\nIdempotency keys");
{
  const withId = normaliseWebhookEvent(JSON.parse(SUCCESS_BODY));
  check(withId.eventId === "evt_01HQ8ZK", "an explicit event_id is used");
  check(webhookEventKey(SUCCESS_BODY, withId.eventId) === "evt_evt_01HQ8ZK", "keyed by the provider's event id");

  // Without one, the key is a hash of the exact bytes: stable for a true
  // retry, different for any other delivery.
  const bare = JSON.stringify({ event: "charge.succeeded", data: { payment_intent_id: "pi_x", status: "paid" } });
  const bareEvent = normaliseWebhookEvent(JSON.parse(bare));
  const key = webhookEventKey(bare, bareEvent.eventId);
  check(bareEvent.eventId === null, "no event id is invented");
  check(key.startsWith("raw_") && key.length > 10, `falls back to a hash of the body (${key.slice(0, 14)}...)`);
  check(webhookEventKey(bare, null) === key, "the same bytes always give the same key");
  check(webhookEventKey(`${bare} `, null) !== key, "different bytes give a different key");

  // A top-level `id` that is really the INTENT id must not become the event
  // key: a later `succeeded` for the same intent would collide with an earlier
  // `pending` and be discarded as a replay — a payment never credited.
  const risky = normaliseWebhookEvent({ id: "pi_same", type: "charge.succeeded", data: { payment_intent_id: "pi_same", status: "paid" } });
  check(risky.eventId === null, "an `id` equal to the payment intent id is refused as an event id");
}

// -------------------------------------------------------- the replay guard

console.log("\nA replayed event is acted on exactly once");
{
  /**
   * Stand-in for functions/src/payments.ts's Firestore transaction, with the
   * property that matters: the event record and the fulfilment land together
   * or not at all. Recording first and crediting after is the bug this guards
   * against — it cost real money in another of the owner's projects, because
   * the credit failed and the retry then skipped the event as handled.
   */
  const ledger = new Map();
  const payments = new Map();
  let credits = 0;

  const deliver = (raw, { failTheCredit = false } = {}) => {
    const event = normaliseWebhookEvent(JSON.parse(raw));
    const key = webhookEventKey(raw, event.eventId);
    if (ledger.has(key)) return { outcome: "duplicate", decision: { reason: "Event already handled" } };

    const current = payments.get(event.paymentIntentId) ?? null;
    const decision = decideFulfilment({
      event,
      current,
      resolvedUid: event.uid,
      // The amount the provider reported, converted to bututs at the boundary.
      reportedAmountMinor: event.amountMajor === null ? null : Math.round(event.amountMajor * 100),
    });

    // One atomic unit: either everything below happens or nothing does.
    const staged = { ledger: key, payment: decision.patch, credit: decision.credit };
    if (staged.credit && failTheCredit) return { outcome: "aborted", decision };

    ledger.set(staged.ledger, true);
    if (staged.payment) payments.set(event.paymentIntentId, { ...current, ...staged.payment });
    if (staged.credit) credits += 1;
    return { outcome: decision.patch ? "applied" : "nothing-to-do", decision };
  };

  // The payment as `create` recorded it before the shopper was redirected.
  payments.set("pi_test_abc123", {
    paymentIntentId: "pi_test_abc123",
    uid: "user_fatou",
    purpose: "ai_initial",
    amountMinor: 200_00,
    status: "pending",
    fulfilled: false,
    needsReview: false,
  });

  const first = deliver(SUCCESS_BODY);
  check(first.outcome === "applied" && first.decision.credit, "the first delivery is applied and credits");
  check(credits === 1, "credited once");

  const second = deliver(SUCCESS_BODY);
  check(second.outcome === "duplicate", "an identical retry is recognised as a duplicate");
  const third = deliver(SUCCESS_BODY);
  check(third.outcome === "duplicate", "and so is a third");
  check(credits === 1, "still credited exactly once after three deliveries");

  // A different event id for the same, already-fulfilled payment: the ledger
  // does not catch it, but `fulfilled` does.
  const relabelled = SUCCESS_BODY.replace("evt_01HQ8ZK", "evt_DIFFERENT");
  const fourth = deliver(relabelled);
  check(fourth.outcome === "nothing-to-do", "a new event id for a fulfilled payment writes nothing");
  check(credits === 1, "and does not credit again");
  check(fourth.decision.reason === "Already fulfilled", `reason: ${fourth.decision.reason}`);

  // The failure mode that cost real money: if the credit fails, the event must
  // NOT be left recorded, or the retry skips it forever.
  const freshLedger = new Map(ledger);
  ledger.clear();
  payments.set("pi_test_abc123", { ...payments.get("pi_test_abc123"), fulfilled: false, status: "pending" });
  credits = 0;
  const aborted = deliver(SUCCESS_BODY, { failTheCredit: true });
  check(aborted.outcome === "aborted" && credits === 0, "a failed credit does not credit");
  check(ledger.size === 0, "and leaves NO event record behind");
  const retried = deliver(SUCCESS_BODY);
  check(retried.outcome === "applied" && credits === 1, "so the provider's retry credits properly");
  check(freshLedger.size > 0, "(the earlier ledger really had been populated)");

  // A late failure after a real success must not revoke what was delivered.
  const late = deliver(JSON.stringify({ event: "charge.expired", event_id: "evt_LATE", data: { payment_intent_id: "pi_test_abc123" } }));
  check(late.outcome === "nothing-to-do", "a late expiry after success writes nothing");
  check(payments.get("pi_test_abc123").fulfilled === true, "the consultation stays paid for");
}

// ----------------------------------------------------- amounts and methods

console.log("\nAmounts are checked, not trusted");
{
  check(amountsAgree(200_00, 200_00), "an exact match agrees");
  check(amountsAgree(200_00, 200_01) && amountsAgree(200_00, 199_99), "within one butut agrees (D0.01 tolerance)");
  check(!amountsAgree(200_00, 200_02), "two bututs out does not agree");
  check(!amountsAgree(200_00, 2_00), "paying D2 for a D200 consultation does not agree");

  const current = {
    paymentIntentId: "pi_u", uid: "user_fatou", purpose: "ai_initial",
    amountMinor: 200_00, status: "pending", fulfilled: false, needsReview: false,
  };

  // Underpaid: held for a human, never auto-activated.
  const short = decideFulfilment({
    event: normaliseWebhookEvent({ event: "charge.succeeded", data: { payment_intent_id: "pi_u", status: "paid", amount: 2, metadata: { uid: "user_fatou" } } }),
    current,
    resolvedUid: "user_fatou",
    reportedAmountMinor: 2_00,
  });
  check(!short.credit && short.patch.needsReview, "an amount mismatch is held for review, not activated");
  check(short.patch.status === "succeeded", "but it is still recorded as paid — the money did arrive");

  // Nobody matched: also held, never credited to a guess.
  const anonymous = decideFulfilment({
    event: normaliseWebhookEvent({ event: "charge.succeeded", data: { payment_intent_id: "pi_u", status: "paid", amount: 200 } }),
    current,
    resolvedUid: null,
    reportedAmountMinor: 200_00,
  });
  check(!anonymous.credit && anonymous.patch.needsReview, "an unmatched payer is held for review");

  const unknownEvent = decideFulfilment({
    event: normaliseWebhookEvent({ event: "customer.updated", data: { payment_intent_id: "pi_u" } }),
    current, resolvedUid: "user_fatou", reportedAmountMinor: null,
  });
  check(unknownEvent.patch === null && !unknownEvent.credit, "an unhandled event writes nothing");
}

console.log("\nNothing is credited on an amount nobody can corroborate");
{
  // A payment we have no record of. It can happen: `create` mints the intent
  // at Modem Pay and then fails to write the record. The expected amount then
  // has to come from the metadata that travelled with the payment, which is
  // the only reason it is attached at checkout.
  const paid = (extra = {}) =>
    normaliseWebhookEvent({
      event: "charge.succeeded",
      data: {
        payment_intent_id: "pi_orphan",
        status: "paid",
        amount: 200,
        metadata: { uid: "user_fatou", purpose: "ai_initial", amount_minor: "20000", ...extra },
      },
    });

  check(paid().expectedAmountMinor === 200_00, "the expected amount is read back out of the metadata");

  const recovered = decideFulfilment({
    event: paid(),
    current: null,
    resolvedUid: "user_fatou",
    reportedAmountMinor: 200_00,
    expectedAmountMinor: paid().expectedAmountMinor,
  });
  check(recovered.credit, "a payment with no record of its own is still checked, and credits when it matches");

  // The hole this block exists for: with no record AND no usable metadata
  // there is nothing to check the payment against, and it used to credit
  // anyway on the strength of "the provider said succeeded".
  const unverifiable = decideFulfilment({
    event: normaliseWebhookEvent({
      event: "charge.succeeded",
      data: { payment_intent_id: "pi_orphan", status: "paid", amount: 200, metadata: { uid: "user_fatou" } },
    }),
    current: null,
    resolvedUid: "user_fatou",
    reportedAmountMinor: 200_00,
  });
  check(!unverifiable.credit && unverifiable.patch.needsReview, "an unknown price is held for review, not activated");
  check(unverifiable.patch.status === "succeeded", "still recorded as paid — the money did arrive");

  // The provider told us nothing about the amount, so there is nothing to
  // compare. Also held.
  const silent = decideFulfilment({
    event: paid(),
    current: { paymentIntentId: "pi_u", uid: "user_fatou", purpose: "ai_initial", amountMinor: 200_00, status: "pending", fulfilled: false, needsReview: false },
    resolvedUid: "user_fatou",
    reportedAmountMinor: null,
  });
  check(!silent.credit && silent.patch.needsReview, "no reported amount is held for review");

  // Metadata that is not a whole, positive number of bututs is not a price we
  // ever set — it is corruption or tampering, and must not be treated as the
  // expectation.
  for (const [value, what] of [
    ["200.5", "fractional"],
    ["-20000", "negative"],
    ["0", "zero"],
    ["lots", "not a number"],
  ]) {
    check(paid({ amount_minor: value }).expectedAmountMinor === null, `a ${what} metadata amount is ignored`);
  }

  // Underpaid, recovered from metadata rather than from our record: same
  // refusal as when the record is present.
  const underpaidOrphan = decideFulfilment({
    event: paid(),
    current: null,
    resolvedUid: "user_fatou",
    reportedAmountMinor: 2_00,
    expectedAmountMinor: paid().expectedAmountMinor,
  });
  check(!underpaidOrphan.credit && underpaidOrphan.patch.needsReview, "D2 against a D200 expectation is held, record or no record");

  // Our own record outranks the metadata, which arrives over the wire.
  const recordWins = decideFulfilment({
    event: paid({ amount_minor: "100" }),
    current: { paymentIntentId: "pi_u", uid: "user_fatou", purpose: "ai_initial", amountMinor: 200_00, status: "pending", fulfilled: false, needsReview: false },
    resolvedUid: "user_fatou",
    reportedAmountMinor: 200_00,
    expectedAmountMinor: 100,
  });
  check(recordWins.credit, "our own recorded price is preferred over the metadata's");
}

console.log("\nA payment with nothing to deliver is held, never marked fulfilled");
{
  // The bug this exists for: a D200 consultation payment has no booking, the
  // only credit there was then was a booking's, and the payment was stamped
  // fulfilled with nothing granted — after which "Already fulfilled" refused
  // every attempt to put it right.
  const current = {
    paymentIntentId: "pi_ai", uid: "user_fatou", purpose: "ai_initial",
    amountMinor: 200_00, status: "pending", fulfilled: false, needsReview: false,
  };
  const event = normaliseWebhookEvent({
    event: "charge.succeeded",
    data: { payment_intent_id: "pi_ai", status: "paid", amount: 200, metadata: { uid: "user_fatou", purpose: "ai_initial", amount_minor: "20000" } },
  });

  const nothing = decideFulfilment({ event, current, resolvedUid: "user_fatou", reportedAmountMinor: 200_00, grantable: false });
  check(!nothing.credit, "nothing to grant → no credit");
  check(nothing.patch.fulfilled === false && nothing.patch.needsReview === true, "held for review, NOT marked fulfilled");
  check(nothing.patch.status === "succeeded", "still recorded as paid — the money did arrive");
  check(/nothing to deliver/.test(nothing.patch.reviewReason), `and says why: ${nothing.patch.reviewReason}`);

  // Held, not fulfilled, so a later delivery CAN still put it right.
  const later = decideFulfilment({
    event,
    current: { ...current, status: "succeeded", needsReview: true },
    resolvedUid: "user_fatou",
    reportedAmountMinor: 200_00,
    grantable: true,
  });
  check(later.credit && later.patch.fulfilled === true, "a held payment can still be granted later");

  const granted = decideFulfilment({ event, current, resolvedUid: "user_fatou", reportedAmountMinor: 200_00, grantable: true });
  check(granted.credit && granted.patch.fulfilled === true, "something to grant → credited and fulfilled");

  const unsaid = decideFulfilment({ event, current, resolvedUid: "user_fatou", reportedAmountMinor: 200_00 });
  check(unsaid.credit, "a caller that does not say is treated as before");

  // Grantable never overrides the other guards.
  const short = decideFulfilment({ event, current, resolvedUid: "user_fatou", reportedAmountMinor: 2_00, grantable: true });
  check(!short.credit && short.patch.needsReview, "an underpayment is still held, grantable or not");
  const done = decideFulfilment({ event, current: { ...current, fulfilled: true }, resolvedUid: "user_fatou", reportedAmountMinor: 200_00, grantable: false });
  check(done.patch === null && !done.credit, "an already-fulfilled payment is left alone, not re-held");
}

console.log("\nPayment methods follow the card minimum");
{
  check(paymentMethodsFor(200_00).join() === "wallet,card", "D200 offers wallet then card");
  check(paymentMethodsFor(CARD_MINIMUM_MINOR).join() === "wallet,card", "exactly at the minimum still offers card");
  check(paymentMethodsFor(CARD_MINIMUM_MINOR - 1).join() === "wallet", "a butut below it is wallet-only");
  check(paymentMethodsFor(50_00).join() === "wallet", "D50 is wallet-only (card would be uncompletable)");
  check(!paymentMethodsFor(200_00).includes("mobile_money"), "never sends the rejected `mobile_money` token");
}

// ----------------------------------------------------- the request envelope

console.log("\nThe create-payment body is wrapped");
{
  const body = buildCheckoutBody({
    // MAJOR units: D200, converted from 20000 bututs by the adapter.
    amountMajor: 200,
    title: "Initial consultation",
    description: "A first conversation, up to 8 minutes.",
    customerEmail: "fatou@example.gm",
    customerName: "Fatou",
    paymentMethods: paymentMethodsFor(200_00),
    metadata: { uid: "user_fatou", purpose: "ai_initial", amount_minor: "20000" },
    returnUrl: "https://talk.example/therapy?paid=1",
    cancelUrl: "https://talk.example/plans?cancelled=1",
    callbackUrl: "https://us-east4-talk-therapy-509209.cloudfunctions.net/modemWebhook",
  });

  check(Object.keys(body).join() === "data", "the body has exactly one top-level key, `data`");
  check(body.data.from_sdk === false, "from_sdk: false sits inside `data`");
  check(body.data.amount === 200, "amount is in Dalasi, not bututs");
  check(body.data.currency === "GMD", "currency is GMD");
  check(body.data.metadata.uid === "user_fatou" && body.data.metadata.purpose === "ai_initial", "metadata carries uid and purpose");
  check(body.data.payment_methods[0] === "wallet", "wallet is listed first");
  check(typeof body.data.callback_url === "string", "callback_url is set");
}

console.log("\nThe create-payment reply is read from the right fields");
{
  const result = readCheckoutResponse({
    status: true,
    message: "Payment intent created",
    data: {
      // `id` is NOT the intent id. Reading it gives an id nothing will match.
      id: "obj_wrong_one",
      payment_intent_id: "pi_test_abc123",
      payment_link: "https://checkout.modempay.com/pi_test_abc123",
      intent_secret: "ignored — this integration is hosted-redirect only",
    },
  });
  check(result.paymentIntentId === "pi_test_abc123", "reads data.payment_intent_id, not data.id");
  check(result.paymentLink === "https://checkout.modempay.com/pi_test_abc123", "reads data.payment_link");

  let threw = false;
  try {
    readCheckoutResponse({ status: true, message: "created" });
  } catch {
    threw = true;
  }
  check(threw, "a reply with neither a reference nor a link fails loudly rather than returning a broken one");

  // The same tolerance connekteasy arrived at in production against this
  // gateway. Preference order matters more than the fallbacks: reading `id`
  // first would hand back an object id that the webhook never matches.
  const flat = readCheckoutResponse({
    payment_intent_id: "pi_flat",
    payment_link: "https://checkout.modempay.com/pi_flat",
  });
  check(flat.paymentIntentId === "pi_flat", "reads a reply with the fields at the top level");

  const byId = readCheckoutResponse({ data: { id: "pi_by_id", link: "https://checkout/x" } });
  check(byId.paymentIntentId === "pi_by_id", "falls back to data.id when there is no payment_intent_id");
  check(byId.paymentLink === "https://checkout/x", "and to data.link for the link");

  const byReference = readCheckoutResponse({
    data: { reference: "pi_ref", payment_link: "https://checkout/y" },
  });
  check(byReference.paymentIntentId === "pi_ref", "falls back to data.reference last of all");
}

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exitCode = failures ? 1 : 0;
