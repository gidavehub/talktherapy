import {
  SIGNATURE_HEADER,
  decideFulfilment,
  normaliseWebhookEvent,
  verifyWebhookSignature,
  webhookEventKey,
} from "@/lib/payments/modempay-protocol";
import { modemPayProvider, reportedAmountMinor, webhookSignatureCandidates } from "@/lib/payments/modempay";
import { resolvePayer } from "@/lib/payments/resolve";
import { creditSession, sessionToCredit } from "@/lib/payments/fulfil";
import { recordAndApply } from "@/lib/payments/store";
import type { VerifiedPayment } from "@/lib/payments/provider";
import { json } from "../../respond";

/**
 * Modem Pay's webhook. The only thing in the app that may mark a payment paid.
 *
 * NO AUTHENTICATION, deliberately: Modem Pay cannot hold a Firebase ID token.
 * The signature IS the authentication, and nothing in this handler trusts a
 * single field of the body until `verifyWebhookSignature` has passed.
 *
 * THE RAW BYTES MATTER. The HMAC is over exactly what was sent, so the body is
 * read with `req.text()` and parsed by hand afterwards. Calling `req.json()`
 * first consumes the stream and leaves nothing to verify — and any re-encoding
 * of the parsed object is a different byte sequence with a different digest.
 *
 * Status codes are chosen around Modem Pay retrying roughly three times
 * without a 200:
 *   405 — anything but POST.
 *   400 — ONLY a signature that does not verify. Retrying will not help.
 *   500 — our own failure (database unreachable). We WANT the retry.
 *   200 — everything else, including events we do not act on: unknown types,
 *         duplicates, and payments we cannot match. They are recorded or
 *         deliberately ignored, and a retry would reach the same conclusion.
 */

export const dynamic = "force-dynamic";

/**
 * Next answers an unexported verb with 405 by itself, but a webhook URL gets
 * pasted into browsers and curl by hand often enough that saying so plainly —
 * with an `Allow` header — is worth four lines.
 */
function methodNotAllowed() {
  return new Response(JSON.stringify({ error: "Use POST." }), {
    status: 405,
    headers: { Allow: "POST", "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;

export async function POST(req: Request) {
  const raw = await req.text();

  const verdict = verifyWebhookSignature(
    raw,
    req.headers.get(SIGNATURE_HEADER),
    webhookSignatureCandidates(),
  );

  if (!verdict.ok) {
    // The only 400. Either it is not from Modem Pay, or a secret is wrong — and
    // in both cases a retry changes nothing.
    console.warn("payments/webhook: signature did not verify");
    return json(400, { error: "Invalid signature." });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Signed by Modem Pay but not JSON we understand. Nothing to act on, and
    // retrying would deliver the same bytes.
    console.warn("payments/webhook: verified delivery was not JSON");
    return json(200, { received: true, acted: false, reason: "Body was not JSON" });
  }

  const event = normaliseWebhookEvent(parsed);

  if (!event.paymentIntentId) {
    console.warn(`payments/webhook: "${event.eventName}" carried no payment intent id`);
    return json(200, { received: true, acted: false, reason: "No payment intent id" });
  }

  // The provider's own record of the transaction: the authority on the amount
  // and on the metadata. Always fetched when the event claims success, because
  // the amount check below is only worth anything against a figure the
  // delivered payload could not have been wrong about. A failure here is
  // tolerated — the payload's own amount is then used, and a payment with no
  // corroborated amount simply cannot be auto-activated.
  let authoritative: VerifiedPayment | null = null;
  if (event.outcome === "succeeded") {
    try {
      authoritative = await modemPayProvider().verify(event.paymentIntentId);
    } catch (error) {
      console.error(`payments/webhook: transaction lookup failed for ${event.paymentIntentId}`, error);
    }
  }

  const payer = await resolvePayer({
    metadataUid: event.uid,
    authoritative,
    payloadEmail: event.customerEmail,
    payloadPurpose: event.purpose,
  }).catch((error) => {
    console.error("payments/webhook: could not resolve the payer", error);
    return null;
  });

  const amountMinor = authoritative?.amountMinor ?? reportedAmountMinor(event.amountMajor);

  // Checked BEFORE the transaction, because a credit runs after the
  // transaction has written and Firestore refuses a read at that point. The
  // provider's own copy of the metadata beats the delivery's.
  const session = await sessionToCredit({
    bookingId: authoritative?.bookingId ?? event.bookingId,
    payerUid: payer?.uid ?? null,
    amountMinor,
  }).catch((error) => {
    console.error("payments/webhook: could not check the session", error);
    return null;
  });

  try {
    const { outcome, decision } = await recordAndApply({
      eventKey: webhookEventKey(raw, event.eventId),
      paymentIntentId: event.paymentIntentId,
      eventName: event.eventName || event.statusText || "unknown",
      signatureRouting: verdict.routing,
      decide: (current) =>
        decideFulfilment({
          event,
          current,
          resolvedUid: payer?.uid ?? null,
          reportedAmountMinor: amountMinor,
          // The price we asked for, for the case where our own record of this
          // payment is missing. The provider's copy of the metadata beats the
          // delivery's.
          expectedAmountMinor:
            authoritative?.expectedAmountMinor ?? event.expectedAmountMinor,
          resolvedPurpose: payer?.purpose ?? null,
          resolvedEmail: payer?.email ?? null,
        }),
      // Marking the session paid shares the transaction with the event
      // record, so neither can commit without the other. For an AI tier there
      // is nothing to activate yet: `fulfilled: true` on the payment is the
      // entitlement, and the conversation will check for it.
      credit: session ? creditSession(session.bookingId, event.paymentIntentId) : undefined,
    });

    console.log(
      `payments/webhook: ${event.paymentIntentId} ${outcome} (${decision.reason}) ` +
        `via ${verdict.routing}/${verdict.form}, payer ${payer?.source ?? "unresolved"}`,
    );

    return json(200, { received: true, acted: outcome === "applied", reason: decision.reason });
  } catch (error) {
    // Our own fault — most likely Firestore. A 500 is correct: it is the only
    // code that makes Modem Pay deliver this event again, and because the
    // event record and the fulfilment share one transaction, nothing partial
    // was left behind for the retry to trip over.
    console.error(`payments/webhook: failed to apply ${event.paymentIntentId}`, error);
    return json(500, { error: "Could not record the payment. Please retry." });
  }
}
