/**
 * A payment provider that always succeeds, immediately.
 *
 * This is what `PAYMENTS_PROVIDER=simulated` selects, and it is the default —
 * so a developer or a test can walk the whole paid-consultation flow without a
 * merchant account, a key, or a network connection.
 *
 * It never contacts anything. `createCheckout` hands back a link straight to
 * the app's own return URL, and `verify` reports the payment as settled. The
 * calling code is identical to the live path, which is the point: the only
 * thing that differs between a test run and a real one is which adapter was
 * constructed.
 */

import "server-only";
import { randomUUID } from "node:crypto";
import type { Checkout, CheckoutRequest, PaymentProvider, VerifiedPayment } from "./provider";

/**
 * What each simulated checkout was for, so `verify` can answer honestly about
 * amount and purpose rather than echoing whatever it is asked.
 *
 * In memory and per process, which is all a simulation needs — a restart
 * simply forgets, and nothing real was ever at stake.
 */
const issued = new Map<string, { uid: string; purpose: string; amountMinor: number; email: string | null }>();

export function simulatedProvider(): PaymentProvider {
  return {
    name: "simulated",

    async createCheckout(input: CheckoutRequest): Promise<Checkout> {
      // Prefixed so a simulated id is never mistaken for a Modem Pay one in a
      // log, a database, or a support conversation.
      const paymentIntentId = `sim_${randomUUID()}`;
      issued.set(paymentIntentId, {
        uid: input.uid,
        purpose: input.purpose,
        amountMinor: input.amountMinor,
        email: input.customerEmail,
      });

      // Straight back to the app, already carrying the intent id, so the
      // return page can verify it exactly as it would after a real payment.
      const link = new URL(input.returnUrl);
      link.searchParams.set("payment_intent_id", paymentIntentId);
      link.searchParams.set("simulated", "1");

      return {
        paymentIntentId,
        paymentLink: link.toString(),
        // Mirrors the live adapter's shape rather than the live card-minimum
        // rule: a simulated payment is not testing which rails are offered.
        paymentMethods: ["wallet"],
      };
    },

    async verify(paymentIntentId: string): Promise<VerifiedPayment> {
      const record = issued.get(paymentIntentId);
      return {
        paymentIntentId,
        // Settles instantly — there is no pending state to simulate.
        state: "succeeded",
        amountMinor: record?.amountMinor ?? null,
        // A simulated payment is always for exactly what was asked, so the
        // expected and reported amounts are the same figure.
        expectedAmountMinor: record?.amountMinor ?? null,
        uid: record?.uid ?? null,
        purpose: record?.purpose ?? null,
        customerEmail: record?.email ?? null,
      };
    },
  };
}
