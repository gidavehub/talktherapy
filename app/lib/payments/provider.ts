/**
 * The payment interface the rest of Talk is allowed to know about.
 *
 * Two reasons this is an interface rather than a direct call to Modem Pay:
 *
 *  1. Tests and local development must not need a merchant account. The
 *     `simulated` provider settles instantly, so the whole paid-consultation
 *     flow can be walked end to end with no keys and no network.
 *  2. Modem Pay is a young provider and Gambian rails change. When a second
 *     one is needed, it implements this and nothing above it moves.
 *
 * Chosen by `PAYMENTS_PROVIDER` (see .env.example). The variable is read at
 * request time, never at module load: Next 16 will otherwise inline
 * `process.env` reads into the build, and the deployed app would be stuck with
 * whatever the build machine happened to have set.
 *
 * Money convention: `amountMinor` is an integer in bututs, like every other
 * amount in the app. Major units exist only inside the Modem Pay adapter.
 */

import "server-only";

export type PaymentPurpose = "ai_initial" | "ai_extended" | "session_fee";

export type ProviderName = "modempay" | "simulated";

export type CheckoutRequest = {
  /** Who is paying. Carried in provider metadata so the webhook can match it. */
  uid: string;
  purpose: PaymentPurpose;
  /** Integer bututs. */
  amountMinor: number;
  title: string;
  description: string;
  customerEmail: string | null;
  customerName: string | null;
  /** Set for a session fee: the booking being paid for. */
  bookingId?: string | null;
  /** Where the shopper lands after paying, and after cancelling. */
  returnUrl: string;
  cancelUrl: string;
  /** Where the provider posts the signed event. Must be publicly reachable. */
  callbackUrl: string;
};

export type Checkout = {
  paymentIntentId: string;
  /** Hosted page to send the browser to. */
  paymentLink: string;
  /** Which rails the hosted page will offer, for logging and for the UI copy. */
  paymentMethods: string[];
};

export type PaymentState = "pending" | "succeeded" | "failed" | "unknown";

/**
 * A payment as the provider describes it — the authority on amount and
 * metadata, which is why the webhook prefers this over anything in the
 * delivered payload when the two disagree.
 */
export type VerifiedPayment = {
  paymentIntentId: string;
  state: PaymentState;
  /** Integer bututs, converted from the provider's major units. */
  amountMinor: number | null;
  /**
   * What the payment was created for, read back from the metadata the
   * provider stored — bututs, because that is the unit we put there.
   *
   * The provider's own copy of our metadata is worth more than the webhook's:
   * a delivery can be partial, this is what the gateway actually holds.
   */
  expectedAmountMinor: number | null;
  uid: string | null;
  purpose: string | null;
  /** The session this paid for, when it was a session fee. */
  bookingId: string | null;
  customerEmail: string | null;
};

export interface PaymentProvider {
  readonly name: ProviderName;
  createCheckout(request: CheckoutRequest): Promise<Checkout>;
  /** Ask the provider what really happened to a payment. */
  verify(paymentIntentId: string): Promise<VerifiedPayment>;
}

/**
 * Which provider is live.
 *
 * Defaults to `simulated` rather than `modempay`: a misconfigured deployment
 * should fail to take money, not take it through a half-configured gateway.
 */
export function configuredProviderName(): ProviderName {
  return process.env.PAYMENTS_PROVIDER === "modempay" ? "modempay" : "simulated";
}

export async function paymentProvider(): Promise<PaymentProvider> {
  // Imported lazily so the simulated path never pulls in the live adapter (and
  // so a missing secret key cannot break a build that does not use it).
  if (configuredProviderName() === "modempay") {
    const { modemPayProvider } = await import("./modempay");
    return modemPayProvider();
  }
  const { simulatedProvider } = await import("./simulated");
  return simulatedProvider();
}
