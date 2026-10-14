/**
 * The browser's side of staff operations: one wrapper per adminOps callable,
 * and the once-a-session check that a staff member's sign-in carries the
 * `admin` claim.
 *
 * The shapes, and every rule about what staff may see, live in ./adminOps,
 * shared with the functions. This file only makes the calls. Each wrapper
 * resolves to a result rather than throwing, so a page can show its error
 * state from the same value it renders.
 */

import type { User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { firebaseFunctions } from "./firebase";
import type {
  AdminAuditRow,
  AdminPaymentRow,
  AdminPayoutRow,
  AdminUserDetail,
  AdminUserRow,
  ListAuditInput,
  ListBookingsInput,
  ListBookingsResult,
  ListPaymentsInput,
  ListPayoutsInput,
  ListSupportInput,
  ListSupportResult,
  ListUsersInput,
  Page,
  PaymentTotalsInput,
  PaymentTotalsResult,
  SetDisabledInput,
  SetDisabledResult,
  SetRoleInput,
  SetRoleResult,
  SyncAdminClaimResult,
  UpdateSupportInput,
  UpdateSupportResult,
} from "./adminOps";

export type OpsResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** A callable that does not answer in this long has failed, as far as a page is concerned. */
const TIMEOUT_MS = 30_000;

/**
 * The function's own sentence when it sent one. A bare code ("internal",
 * "deadline-exceeded") is what Firebase says when the function never ran or
 * never answered, and means nothing to a person.
 */
function messageOf(error: unknown, fallback: string): string {
  const message =
    error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message.replace(/^Firebase:\s*/, "").trim()
      : "";
  return message && !/^[a-z-]+$/i.test(message) ? message : fallback;
}

async function call<I, O>(name: string, input: I, fallback: string, timeout = TIMEOUT_MS): Promise<OpsResult<O>> {
  try {
    const result = await httpsCallable<I, O>(firebaseFunctions(), name, { timeout })(input);
    return { ok: true, data: result.data };
  } catch (error) {
    return { ok: false, error: messageOf(error, fallback) };
  }
}

const COULD_NOT_LOAD = "That did not load. Check your connection and try again.";
const DID_NOT_SAVE = "That did not go through. Nothing was changed — try again.";

// -------------------------------------------------------------------- people

export function adminListUsers(input: ListUsersInput = {}) {
  return call<ListUsersInput, Page<AdminUserRow>>("adminListUsers", input, COULD_NOT_LOAD);
}

export function adminGetUser(uid: string) {
  return call<{ uid: string }, AdminUserDetail>("adminGetUser", { uid }, COULD_NOT_LOAD);
}

export function adminSetRole(input: SetRoleInput) {
  return call<SetRoleInput, SetRoleResult>("adminSetRole", input, DID_NOT_SAVE);
}

export function adminSetDisabled(input: SetDisabledInput) {
  return call<SetDisabledInput, SetDisabledResult>("adminSetDisabled", input, DID_NOT_SAVE);
}

// ------------------------------------------------------------- staff claim

/** One check per signed-in staff member per page load, however many staff pages they open. */
const claimChecks = new Map<string, Promise<void>>();

/**
 * Make sure this staff member's sign-in carries the `admin` claim, which
 * Storage rules read for provider documents and site media.
 *
 * Their current token is looked at first — that costs nothing — and only
 * when it lacks the claim is syncAdminClaim asked to set it, and a fresh
 * token taken. Never rejects: a failure leaves the pages working on
 * Firestore, which checks the role itself, and is tried again next load.
 */
export function ensureAdminClaim(user: User): Promise<void> {
  const running = claimChecks.get(user.uid);
  if (running) return running;
  const check = (async () => {
    const token = await user.getIdTokenResult();
    if (token.claims.admin === true) return;
    const result = await call<undefined, SyncAdminClaimResult>("syncAdminClaim", undefined, "", 15_000);
    if (!result.ok) throw new Error(result.error || "syncAdminClaim did not answer");
    if (result.data.refresh) await user.getIdToken(true);
  })().catch((error: unknown) => {
    console.warn("Staff access could not be added to this sign-in yet:", error);
  });
  claimChecks.set(user.uid, check);
  return check;
}

// ------------------------------------------------------------------ sessions

export function adminListBookings(input: ListBookingsInput = {}) {
  return call<ListBookingsInput, ListBookingsResult>("adminListBookings", input, COULD_NOT_LOAD);
}

// ------------------------------------------------------------------ payments

export function adminListPayments(input: ListPaymentsInput = {}) {
  return call<ListPaymentsInput, Page<AdminPaymentRow>>("adminListPayments", input, COULD_NOT_LOAD);
}

export function adminListPayouts(input: ListPayoutsInput = {}) {
  return call<ListPayoutsInput, Page<AdminPayoutRow>>("adminListPayouts", input, COULD_NOT_LOAD);
}

export function adminPaymentTotals(input: PaymentTotalsInput = {}) {
  return call<PaymentTotalsInput, PaymentTotalsResult>("adminPaymentTotals", input, COULD_NOT_LOAD);
}

export type ReviewInput = {
  kind: "payment" | "payout" | "session";
  id: string;
  decision: "grant" | "refunded" | "acknowledged" | "pay-provider" | "refund-patient";
  note: string;
};

/** A decision on something held for review — the existing resolveReview function. */
export function resolveReview(input: ReviewInput) {
  return call<ReviewInput, { resolved: true }>("resolveReview", input, DID_NOT_SAVE);
}

// ------------------------------------------------------------------- support

export function adminListSupport(input: ListSupportInput = {}) {
  return call<ListSupportInput, ListSupportResult>("adminListSupport", input, COULD_NOT_LOAD);
}

export function adminUpdateSupport(input: UpdateSupportInput) {
  return call<UpdateSupportInput, UpdateSupportResult>("adminUpdateSupport", input, DID_NOT_SAVE);
}

// ----------------------------------------------------------------- audit log

export function adminListAudit(input: ListAuditInput = {}) {
  return call<ListAuditInput, Page<AdminAuditRow>>("adminListAudit", input, COULD_NOT_LOAD);
}
