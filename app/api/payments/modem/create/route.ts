import { AI_TIERS, type AiTierId } from "@/lib/models";
import { allow, requireUser } from "@/lib/server/requireUser";
import { adminDb } from "@/lib/server/admin";
import { configuredProviderName, paymentProvider, type PaymentPurpose } from "@/lib/payments/provider";
import { createPendingPayment } from "@/lib/payments/store";
import { appBaseUrl, json } from "../../respond";

/**
 * Start a payment: returns a hosted checkout link to send the browser to.
 *
 * Signed in only, and the AMOUNT IS NEVER TAKEN FROM THE REQUEST. The client
 * says what it wants to buy; the price comes from `AI_TIERS` on the server. A
 * client that could name its own price would be a client that pays D1 for a
 * D200 consultation.
 *
 * The payment is recorded as pending before the link is handed back, because
 * the expected amount written there is what the webhook later checks the
 * provider's figure against.
 */

export const dynamic = "force-dynamic";

/** The only things buyable today. Session fees arrive with bookings. */
const PURCHASABLE: Record<string, { purpose: PaymentPurpose; tier: AiTierId }> = {
  ai_initial: { purpose: "ai_initial", tier: "initial" },
  ai_extended: { purpose: "ai_extended", tier: "extended" },
};

export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return json(401, { error: "Sign in before paying." });

  // Starting a checkout is cheap for us but creates a payment intent at the
  // provider every time, so a handful per five minutes is generous for a real
  // person changing their mind and tight enough to stop a loop.
  if (!allow(user.uid, "payments-create", 8, 5 * 60_000)) {
    return json(429, { error: "Too many payment attempts. Give it a minute and try again." });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request body." });
  }

  const requested = typeof body.purpose === "string" ? body.purpose : "";
  const item = PURCHASABLE[requested];
  if (!item) {
    return json(400, { error: "Unknown purpose." });
  }

  const tier = AI_TIERS[item.tier];

  // Email and name come from the user's own document, not the request — they
  // appear on the hosted checkout page and in the provider's records, and a
  // client-supplied email is a client-supplied receipt for somebody else.
  let customerEmail: string | null = null;
  let customerName: string | null = null;
  try {
    const snap = await adminDb().collection("users").doc(user.uid).get();
    const data = snap.data() ?? {};
    customerEmail = typeof data.email === "string" ? data.email : null;
    customerName = typeof data.displayName === "string" ? data.displayName : null;
  } catch (error) {
    console.error("payments/create: could not read the user document", error);
    return json(503, { error: "Payments are not configured. Try again shortly." });
  }

  const base = appBaseUrl(req);
  const provider = await paymentProvider();

  try {
    const checkout = await provider.createCheckout({
      uid: user.uid,
      purpose: item.purpose,
      amountMinor: tier.amountMinor,
      title: tier.label,
      description: tier.blurb,
      customerEmail,
      customerName,
      returnUrl: `${base}/therapy?paid=1`,
      cancelUrl: `${base}/plans?cancelled=1`,
      // Per-intent callback. Deliveries to it are signed with the MERCHANT
      // SECRET KEY rather than the webhook signing secret — see
      // `webhookSignatureCandidates` in app/lib/payments/modempay.ts.
      callbackUrl: `${base}/api/payments/modem/webhook`,
    });

    await createPendingPayment({
      paymentIntentId: checkout.paymentIntentId,
      provider: configuredProviderName(),
      uid: user.uid,
      purpose: item.purpose,
      amountMinor: tier.amountMinor,
      customerEmail,
      paymentMethods: checkout.paymentMethods,
    });

    return json(200, {
      paymentIntentId: checkout.paymentIntentId,
      paymentLink: checkout.paymentLink,
      paymentMethods: checkout.paymentMethods,
      amountMinor: tier.amountMinor,
      currency: "GMD",
    });
  } catch (error) {
    // The provider's message can carry account details, so it is logged and
    // not returned.
    console.error("payments/create failed", error);
    return json(502, { error: "Could not start the payment. Please try again." });
  }
}
