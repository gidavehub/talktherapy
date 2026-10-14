"use client";

import StatCard from "@/components/ui/StatCard";
import { formatDalasi } from "@/lib/money";
import type { AdminStats } from "@/lib/adminStats";
import StatsDashboard from "./StatsDashboard";
import LiveStrip from "./LiveStrip";
import QueueList from "./QueueList";
import { CategoryCard, ChartPlaceholder, DashboardSection, Duration, MetricCard, SeriesCard } from "./cards";
import {
  bucketLabel,
  capitalise,
  countWords,
  inPeriodText,
  largest,
  leadText,
  pick,
  plural,
  shareBase,
  sinceNote,
  wholeShare,
} from "./format";

/**
 * /admin — the service on one screen: who is here now, the headline figures
 * for the chosen dates against the same stretch before, what is waiting for
 * a person, conversations and sign-ups over time, and who holds what.
 */
export default function OverviewDashboard() {
  return (
    <StatsDashboard
      eyebrow="Overview"
      lines={["How TALK is doing,", "at a glance."]}
      lede="Who is here now, what happened in the dates you choose, and what is waiting for a person. Counts only: any group under five shows as <5."
      barTitle="Overview"
      lead={(stats) => <LiveStrip seed={stats?.live ?? null} />}
      skeleton={<OverviewSkeleton />}
    >
      {(stats) => <Overview stats={stats} />}
    </StatsDashboard>
  );
}

const HEADLINES = [
  "New people",
  "TALK conversations",
  "Time with TALK",
  "Paid conversations",
  "Sessions booked",
  "Received",
];

// One column on a narrow phone and three at most: a sum of money or a
// length of time in the card's serif needs the room of a third of the page.
const HEADLINE_GRID = "grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3";

function Overview({ stats }: { stats: AdminStats }) {
  const { headline: h, range, engagement: e, people: p, holdings: held, recordingSince } = stats;
  const period = inPeriodText(range);
  const busiestTalk = largest(e.conversationsByBucket);
  const busiestSignups = largest(p.signupsByBucket);
  const bookingsShare = shareBase(held.bookingsTotal, "sessions booked");

  return (
    <>
      <section aria-label="The headline figures" className={HEADLINE_GRID}>
        <MetricCard label="New people" metric={h.newPeople} range={range} caption="Accounts made." />
        <MetricCard label="TALK conversations" metric={h.talkConversations} range={range} caption="Started." />
        <MetricCard
          label="Time with TALK"
          metric={h.medianTalkSec}
          range={range}
          format={(seconds) => <Duration seconds={seconds} />}
          caption="The median: half are shorter."
        />
        <MetricCard label="Paid conversations" metric={h.paidConversations} range={range} caption="First and longer talks." />
        <MetricCard label="Sessions booked" metric={h.bookings} range={range} caption="With providers." />
        <MetricCard label="Received" metric={h.revenueMinor} range={range} format={formatDalasi} caption="After refunds." />
      </section>

      <QueueList queues={stats.queues} />

      <DashboardSection id="over-time" eyebrow="Over time" title="Conversations and sign-ups">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SeriesCard
            title="Conversations with TALK"
            points={e.conversationsByBucket}
            bucket={range.bucket}
            valueHeading="Conversations"
            takeaway={
              e.conversations.suppressed
                ? "Fewer than 5 in these dates."
                : `${plural(e.conversations.value ?? 0, "conversation")} ${period}.${
                    busiestTalk ? ` Busiest: ${bucketLabel(busiestTalk.t, range.bucket)}, with ${countWords(busiestTalk)}.` : ""
                  }`
            }
            empty={
              recordingSince.talkSessions === null
                ? "Not recorded yet. Conversations are counted from the release that started recording them."
                : "No conversations with TALK in these dates."
            }
            note={sinceNote(recordingSince.talkSessions, range, "Conversations")}
          />
          <SeriesCard
            title="New accounts"
            points={p.signupsByBucket}
            bucket={range.bucket}
            valueHeading="Accounts"
            takeaway={
              p.newSignups.suppressed
                ? "Fewer than 5 in these dates."
                : `${plural(p.newSignups.value ?? 0, "new account")} ${period}.${
                    busiestSignups ? ` Busiest: ${bucketLabel(busiestSignups.t, range.bucket)}, with ${countWords(busiestSignups)}.` : ""
                  }`
            }
            empty="Nobody made an account in these dates."
            note="Staff, test and sample accounts are left out."
          />
        </div>
      </DashboardSection>

      <DashboardSection
        id="holdings"
        eyebrow="Who has what"
        title="What people hold now"
        lede="Paid conversations with TALK and provider listings as they stand today; sessions booked in the dates you chose, by where each one stands now."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <CategoryCard
            title="Paid conversations with TALK"
            list={held.talkPasses}
            labelHeading="Where it stands"
            valueHeading="Conversations"
            shareOf={wholeShare(held.talkPasses)}
            takeaway={`${capitalise(countWords(pick(held.talkPasses, "ready")))} paid and waiting to start; ${countWords(
              pick(held.talkPasses, "inUse"),
            )} in use right now.`}
            note={`Bought in these dates: ${countWords(held.paidFirstConversations)} first conversations and ${countWords(
              held.paidLongerTalks,
            )} longer talks. Ready or in use now: ${countWords(pick(held.talkActiveByTier, "initial"))} first, ${countWords(
              pick(held.talkActiveByTier, "extended"),
            )} longer.`}
            empty="Nobody holds a paid conversation with TALK yet."
          />
          <CategoryCard
            title="Sessions booked in these dates"
            list={held.bookingsByStatus}
            labelHeading="Where it stands"
            valueHeading="Sessions"
            shareOf={bookingsShare}
            takeaway={`${capitalise(countWords(held.bookingsTotal))} booked; ${countWords(
              pick(held.bookingsByStatus, "attended"),
            )} took place.`}
            empty="No sessions were booked in these dates."
          />
          <CategoryCard
            title="Everyone with an account"
            list={p.byRole}
            labelHeading="Who"
            valueHeading="Accounts"
            shareOf={shareBase(p.total, "accounts")}
            takeaway={leadText(p.byRole, p.total, (label, part) => `${capitalise(part)} are ${label.toLowerCase()}.`)}
            note="Counted now, whatever the dates. Staff, test and sample accounts are left out."
            empty="No accounts yet."
          />
          <CategoryCard
            title="Provider listings"
            list={held.providersByStatus}
            labelHeading="Listing"
            valueHeading="Providers"
            shareOf={wholeShare(held.providersByStatus)}
            takeaway={`${capitalise(countWords(pick(held.providersByStatus, "verified")))} verified; ${countWords(
              pick(held.providersByStatus, "pending"),
            )} waiting for review.`}
            note="Counted now. Sample listings are left out."
            empty="No provider listings yet."
          />
        </div>
      </DashboardSection>
    </>
  );
}

/** The page's own shape, every figure loading. */
function OverviewSkeleton() {
  return (
    <div className="space-y-10 md:space-y-12">
      <div className={HEADLINE_GRID}>
        {HEADLINES.map((label) => (
          <StatCard key={label} label={label} value="" loading />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartPlaceholder title="Conversations with TALK" />
        <ChartPlaceholder title="New accounts" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartPlaceholder title="Paid conversations with TALK" height={140} />
        <ChartPlaceholder title="Sessions booked in these dates" height={200} />
      </div>
    </div>
  );
}
