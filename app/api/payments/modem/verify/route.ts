import { decideFulfilment } from "@/lib/payments/modempay-protocol";
import { paymentProvider } from "@/lib/payments/provider";
import { readPayment, recordAndApply } from "@/lib/payments/store";
import { resolvePayer } from "@/lib/payments/resolve";
import { allow, requireUser } from "@/lib/server/requireUser";
import { json } from "../../respond";

/**
 * What happened to my payment?
 *
 * Polled by the page the shopper lands on after paying. It does two jobs:
 *
 *  1. Reports the status, read from our own record — the client is never told
 *     anything the server has not already decided.
 *  2. Reconciles. If the provider says the payment succeeded but no webhook has
 *     arrived, the consultation is activated from here instead. Webhooks get
 *     lost; a person who has paid D200 and is staring at a spinner is not an
 *     acceptable outcome.
 *
 * Reconciling from two places is only safe because both go through the same
 * single transaction in `recordAndApply`, and because `decideFulfilment`
 * refuses to credit a payment that is already `fulfilled`. Whichever path
 * arrives first wins; the other finds the work done.
 */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user) return json(401, { error: "Sign in first." });

  // A return page polls this every second or two while the wallet confirms.
  if (!allow(user.uid, "payments-verify", 60, 5 * 60_000)) {
    return json(429, { error: "Too many checks. Give it a moment." });
  }

  const paymentIntentId = new URL(req.url).searchParams.get("payment_intent_id")?.trim() ?? "";
  if (!paymentIntentId) return json(400, { error: "Missing payment_intent_id." });

  let record;
  try {
    record = await readPayment(paymentIntentId);
  } catch (error) {
    console.error("payments/verify: could not read the payment", error);
    return json(503, { error: "Could not check that payment. Try again shortly." });
  }

  // Same answer for "does not exist" and "belongs to someone else", so this
  // endpoint cannot be used to discover other people's payment ids.
  if (!record || record.uid !== user.uid) {
    return json(404, { error: "No such payment." });
  }

  if (record.fulfilled) {
    return json(200, { status: record.status, fulfilled: true, needsReview: record.needsReview });
  }

  // Ask the provider directly. This is the authority on the amount, and the
  // only way to learn about a payment whose webhook never arrived.
  let authoritative;
  try {
    authoritative = await (await paymentProvider()).verify(paymentIntentId);
  } catch (error) {
    console.error(`payments/verify: provider lookup failed for ${paymentIntentId}`, error);
    // Our record is still the truth we have; report it rather than erroring.
    return json(200, {
      status: record.status,
      fulfilled: record.fulfilled,
      needsReview: record.needsReview,
      reconciled: false,
    });
  }

  if (authoritative.state !== "succeeded") {
    return json(200, {
      status: authoritative.state === "failed" ? "failed" : record.status,
      fulfilled: false,
      needsReview: record.needsReview,
      reconciled: true,
    });
  }

  const payer = await resolvePayer({
    metadataUid: authoritative.uid,
    authoritative,
    payloadEmail: authoritative.customerEmail,
    payloadPurpose: authoritative.purpose,
  }).catch(() => null);

  try {
    const { decision } = await recordAndApply({
      // One reconciliation per payment through this path, ever. A different key
      // from the webhook's on purpose: the two are independent observations of
      // the same payment, and `fulfilled` — not the key — is what keeps the
      // credit to exactly once.
      eventKey: `verify_${paymentIntentId}`,
      paymentIntentId,
      eventName: "verify.reconciled",
      signatureRouting: null,
      decide: (current) =>
        decideFulfilment({
          // Shaped as the webhook's normalised event so one decision function
          // serves both paths and they cannot drift apart.
          event: {
            eventId: null,
            eventName: "verify.reconciled",
            statusText: "succeeded",
            outcome: "succeeded",
            paymentIntentId,
            amountMajor: null,
            expectedAmountMinor: authoritative.expectedAmountMinor,
            uid: authoritative.uid,
            purpose: authoritative.purpose,
            customerEmail: authoritative.customerEmail,
          },
          current,
          resolvedUid: payer?.uid ?? null,
          reportedAmountMinor: authoritative.amountMinor,
          expectedAmountMinor: authoritative.expectedAmountMinor,
          resolvedPurpose: payer?.purpose ?? null,
          resolvedEmail: payer?.email ?? null,
        }),
    });

    return json(200, {
      status: decision.patch?.status ?? record.status,
      fulfilled: decision.patch?.fulfilled ?? record.fulfilled,
      needsReview: decision.patch?.needsReview ?? record.needsReview,
      reconciled: true,
      reason: decision.reason,
    });
  } catch (error) {
    console.error(`payments/verify: could not reconcile ${paymentIntentId}`, error);
    return json(503, { error: "Could not confirm that payment yet. Try again shortly." });
  }
}
