/**
 * Does the live Modem Pay account accept the request this app actually sends?
 *
 *   node scripts/check-modempay-live.mjs
 *
 * Builds the body with the SAME function the app uses — buildCheckoutBody —
 * and posts it to the live API with the live secret key, then reads the reply
 * with the same readCheckoutResponse. Nothing is hand-rolled here, so a pass
 * means the app's own code path works against the real merchant account.
 *
 * IT CREATES ONE PAYMENT INTENT AND NEVER PAYS IT. An unpaid intent is a row
 * in the dashboard and nothing else: no money moves, there is nothing to
 * refund, and it can be ignored or abandoned. The title says so, in case
 * anyone sees it later.
 *
 * It does NOT test the webhook. That needs a publicly reachable URL, which
 * means the app has to be deployed first — see APP_BASE_URL in .env.example.
 */

import { readFileSync } from "node:fs";
import {
  MODEM_PAY_BASE_URL,
  buildCheckoutBody,
  paymentMethodsFor,
  readCheckoutResponse,
} from "../app/lib/payments/modempay-protocol.ts";

function fromEnvFile(name) {
  const fromEnv = (process.env[name] ?? "").trim();
  if (fromEnv) return fromEnv;
  try {
    const line = readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(`${name}=`));
    return (line ?? "").slice(name.length + 1).trim();
  } catch {
    return "";
  }
}

const key = fromEnvFile("MODEM_PAY_SECRET_KEY");
if (!key) {
  console.error("MODEM_PAY_SECRET_KEY is not set in the environment or .env.local.");
  process.exitCode = 2;
}

/** D200 — the real initial-consultation price, so both rails are offered. */
const AMOUNT_MINOR = 200_00;

let failures = 0;
const check = (ok, what) => {
  console.log(`  ${ok ? "✓" : "✗"} ${what}`);
  if (!ok) failures += 1;
};

async function main() {
  if (!key) return;

  const live = key.startsWith("sk_live_");
  console.log(`Key: ${key.slice(0, 8)}… (${live ? "LIVE" : "test"})`);
  if (live) console.log("This will create one UNPAID intent on the live account.\n");

  const methods = paymentMethodsFor(AMOUNT_MINOR);
  const body = buildCheckoutBody({
    amountMajor: AMOUNT_MINOR / 100,
    title: "Talk — integration check (do not pay)",
    description: "Created by scripts/check-modempay-live.mjs to verify the API. Not a real sale.",
    customerEmail: null,
    customerName: null,
    paymentMethods: methods,
    metadata: { uid: "integration-check", purpose: "ai_initial", amount_minor: String(AMOUNT_MINOR) },
    returnUrl: "https://example.invalid/return",
    cancelUrl: "https://example.invalid/cancel",
    // Deliberately unreachable: this intent must never deliver a webhook.
    callbackUrl: "https://example.invalid/webhook",
  });

  check(Object.keys(body).join() === "data", "the body is wrapped in `data`");
  check(body.data.from_sdk === false, "with from_sdk: false inside it");
  check(body.data.amount === 200, "amount in Dalasi, not bututs");
  check(methods.join() === "wallet,card", `payment methods: ${methods.join(", ")}`);

  const res = await fetch(`${MODEM_PAY_BASE_URL}/v1/payments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Left null; the raw text is reported below.
  }

  console.log(`\nPOST /v1/payments -> HTTP ${res.status}`);
  check(res.ok, res.ok ? "the live account accepted it" : `refused: ${text.slice(0, 300)}`);
  if (!res.ok) {
    console.log(failures ? `\n${failures} CHECK(S) FAILED` : "");
    process.exitCode = 1;
    return;
  }

  // The keys, never the values: a payment response carries customer details.
  console.log(`Reply keys: ${Object.keys(json?.data ?? json ?? {}).join(", ")}`);

  try {
    const result = readCheckoutResponse(json);
    check(Boolean(result.paymentIntentId), `read the reference back (${result.paymentIntentId})`);
    check(
      result.paymentLink.startsWith("http"),
      `and a checkout link (${new URL(result.paymentLink).origin}/…)`,
    );
    console.log("\nThat intent is unpaid and can be ignored. No money moved.");
  } catch (error) {
    check(false, `could not read the reply: ${error instanceof Error ? error.message : error}`);
  }

  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

await main();
