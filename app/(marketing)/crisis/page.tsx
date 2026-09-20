import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Urgent help — Talk",
  description:
    "Emergency and crisis contacts in The Gambia. If you or someone else is in immediate danger, call 117 for police or 116 for an ambulance.",
};

/**
 * Crisis page.
 *
 * Deliberately a server component with no `motion`, no client hooks and no
 * data fetching. Someone reaching this page may be in genuine distress on a
 * slow connection, and every dependency is another way the numbers fail to
 * appear. Nothing here animates in, nothing waits on hydration, and nothing is
 * gated behind auth.
 *
 * It is also intentionally plain. This is the one page in the product that
 * should not look like marketing.
 */

// Verified national emergency numbers for The Gambia.
const EMERGENCY = [
  { label: "Police", number: "117", note: "Immediate danger, violence, or threat to life" },
  { label: "Ambulance", number: "116", note: "Medical emergency or serious injury" },
  { label: "Fire and Rescue", number: "118", note: "Fire, rescue, or accident" },
];

const SERVICES = [
  {
    name: "Tanka Tanka Psychiatric Hospital",
    detail:
      "The national in-patient psychiatric facility, in the West Coast Region. Referrals are usually made through a health centre or Edward Francis Small Teaching Hospital.",
  },
  {
    name: "Edward Francis Small Teaching Hospital, Banjul",
    detail:
      "The main referral hospital. Its emergency department can assess a mental health crisis and refer onward.",
  },
  {
    name: "Your nearest health centre",
    detail:
      "Major and minor health centres across all regions can make an initial assessment and refer you to mental health services.",
  },
];

export default function CrisisPage() {
  return (
    <div className="bg-[var(--background)]">
      <div className="px-4 sm:px-6 md:px-10 pt-[120px] md:pt-[160px] pb-20 max-w-[900px] mx-auto">
        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
          Urgent help
        </p>
        <h1 className="mt-4 text-[34px] sm:text-[44px] md:text-[56px] leading-[1.02] tracking-[-0.025em] font-medium">
          If you are in danger
          <br />
          right now, call.
        </h1>
        <p className="mt-5 text-[15px] md:text-[17px] leading-relaxed text-[var(--muted)] max-w-[620px]">
          Talk is not an emergency service and cannot respond to a crisis. If
          you or someone near you is at immediate risk, contact one of these
          services directly.
        </p>

        {/* The single most important element on the site. Large tap targets,
            real tel: links, no decoration competing with them. */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          {EMERGENCY.map((item) => (
            <a
              key={item.number}
              href={`tel:${item.number}`}
              className="rounded-[28px] bg-[var(--accent)] text-white px-6 py-7 block hover:bg-[var(--accent-soft)] transition-colors"
            >
              <span className="block text-[11px] uppercase tracking-[0.18em] text-white/80">
                {item.label}
              </span>
              <span className="mt-3 block text-[44px] leading-none font-medium tracking-tight">
                {item.number}
              </span>
              <span className="mt-3 block text-[12px] leading-relaxed text-white/85">
                {item.note}
              </span>
            </a>
          ))}
        </div>

        <p className="mt-4 text-[12px] text-[var(--muted)]">
          112 also reaches the police. These numbers are free to call from any
          network in The Gambia.
        </p>

        {/* ------------------------------------------------------------------ */}

        <h2 className="mt-16 md:mt-20 text-[24px] md:text-[32px] leading-tight tracking-tight font-medium">
          Mental health services
        </h2>
        <p className="mt-3 text-[14px] leading-relaxed text-[var(--muted)] max-w-[620px]">
          The Gambia does not currently operate a dedicated 24-hour mental
          health crisis line. These are the services that can assess and refer
          you.
        </p>

        <ul className="mt-8 space-y-4">
          {SERVICES.map((service) => (
            <li
              key={service.name}
              className="rounded-2xl bg-white shadow-[0_18px_40px_-22px_rgba(0,0,0,0.25)] px-6 py-5"
            >
              <p className="text-[15px] md:text-[16px] font-medium leading-snug">
                {service.name}
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted)]">
                {service.detail}
              </p>
            </li>
          ))}
        </ul>

        {/* ------------------------------------------------------------------ */}

        <h2 className="mt-16 md:mt-20 text-[24px] md:text-[32px] leading-tight tracking-tight font-medium">
          If you are not in immediate danger
        </h2>
        <div className="mt-6 space-y-4 text-[14px] md:text-[15px] leading-relaxed text-[var(--muted)] max-w-[680px]">
          <p>
            Feeling overwhelmed, hopeless or unable to cope is a reason to reach
            out, not something to wait out. You do not need to be in crisis to
            deserve support.
          </p>
          <p>
            You can book a session with a qualified counsellor through Talk, or
            speak to someone you trust — a family member, a friend, a teacher, a
            colleague, or a religious leader. Telling one person is often the
            hardest and most useful step.
          </p>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <Link
            href="/therapists"
            className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--dark)] text-white px-7 text-[12px] uppercase tracking-[0.14em] font-medium hover:bg-[var(--dark-soft)] transition-colors"
          >
            Find a counsellor
          </Link>
          <Link
            href="/resources"
            className="inline-flex h-12 items-center justify-center rounded-full border border-[var(--foreground)] px-7 text-[12px] uppercase tracking-[0.14em] font-medium hover:bg-[var(--dark)] hover:text-white hover:border-[var(--dark)] transition-colors"
          >
            Wellbeing resources
          </Link>
        </div>

        <div className="mt-14 rounded-2xl border border-[var(--border)] px-6 py-5">
          <p className="text-[13px] leading-relaxed text-[var(--muted)]">
            <strong className="font-medium text-[var(--foreground)]">
              About this page.
            </strong>{" "}
            Emergency numbers are the national services for The Gambia. Talk
            does not monitor this page, and submitting anything through the
            platform will not summon help. If something here is out of date,
            please{" "}
            <Link href="/support" className="underline underline-offset-4">
              tell us
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
