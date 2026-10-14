"use client";

import StatCard from "@/components/ui/StatCard";
import { ChartCard, Heatmap, LineChart, heatmapTable, lineChartLegend, lineChartTable, seriesColor } from "@/components/ui/charts";
import type { LineSeries } from "@/components/ui/charts";
import { PLATFORM_FEE_RATE, formatDalasi } from "@/lib/money";
import { SLOT_MINUTES } from "@/lib/providerApplication";
import type { AdminStats, Category, FunnelStep, ResolvedRange } from "@/lib/adminStats";
import StatsDashboard from "./StatsDashboard";
import FunnelChart, { stepShare } from "./FunnelChart";
import { CategoryCard, ChartPlaceholder, DashboardSection, Duration, MetricCard, SeriesCard } from "./cards";
import {
  bucketLabel,
  capitalise,
  cellText,
  countWords,
  durationText,
  inPeriodText,
  isQuiet,
  largest,
  leadText,
  percentText,
  pick,
  plural,
  shareBase,
  shareText,
  shownValue,
  sinceNote,
  uncapitalise,
  wholeShare,
} from "./format";

/**
 * /admin/insights — how TALK is used over time: people in the app day by
 * day, the way from a first visit to a first session, how long and when
 * people talk with TALK and in which language, how long sessions with
 * providers last, the public site, and money.
 */
export default function InsightsDashboard() {
  return (
    <StatsDashboard
      eyebrow="Insights"
      lines={["How people use TALK,", "over time."]}
      lede="Usage, the way from a first visit to a first session, time with TALK and with providers, the public site and money, for the dates you choose. Counts only: any group under five shows as <5."
      barTitle="Insights"
      skeleton={<InsightsSkeleton />}
    >
      {(stats) => <Insights stats={stats} />}
    </StatsDashboard>
  );
}

const FOUR_GRID = "grid grid-cols-2 gap-3 lg:grid-cols-4";
// Sums of money need a third of the page each; on a narrow phone, the whole width.
const MONEY_GRID = "grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3";
const TWO_UP = "grid grid-cols-1 gap-4 lg:grid-cols-2";

function Insights({ stats }: { stats: AdminStats }) {
  const { range, people: p, engagement: e, recordingSince } = stats;
  const period = inPeriodText(range);
  const conversations = shareBase(e.conversations, "conversations");
  const talkNote = sinceNote(recordingSince.talkSessions, range, "Conversations");
  const talkEmpty =
    recordingSince.talkSessions === null
      ? "Not recorded yet. Conversations are counted from the release that started recording them."
      : "No conversations with TALK in these dates.";
  const onboarded = p.onboarded;

  return (
    <>
      <DashboardSection
        id="usage"
        eyebrow="Using TALK"
        title="People in the app"
        lede="Counted from the app noting, once a minute, that a signed-in person is still there. Only the counts reach this page, never who."
      >
        <div className={FOUR_GRID}>
          <StatCard label="Active today" value={cellText(p.active.day)} caption="Seen in the last 24 hours." />
          <StatCard label="Active this week" value={cellText(p.active.week)} caption="Seen in the last 7 days." />
          <StatCard label="Active this month" value={cellText(p.active.month)} caption="Seen in the last 30 days." />
          <StatCard
            label="Got started"
            value={shareText(onboarded)}
            caption={
              onboarded.denominator === 0
                ? "No new accounts in these dates."
                : onboarded.suppressed || onboarded.numerator === null || onboarded.denominator === null
                  ? "Too few new accounts in these dates to say."
                  : `${onboarded.numerator.toLocaleString("en-GB")} of ${onboarded.denominator.toLocaleString("en-GB")} new accounts finished getting to know TALK.${
                      p.onboardedAllTime.rate === null ? "" : ` ${shareText(p.onboardedAllTime)} of everyone so far.`
                    }`
            }
          />
        </div>
        <ActiveUsers stats={stats} />
        <CategoryCard
          title="Provider applications"
          list={p.providersByApplicationStatus}
          labelHeading="Where it stands"
          valueHeading="Applications"
          shareOf={wholeShare(p.providersByApplicationStatus)}
          takeaway={`${capitalise(countWords(pick(p.providersByApplicationStatus, "approved")))} approved; ${countWords(
            pick(p.providersByApplicationStatus, "submitted"),
          )} sent and waiting, ${countWords(pick(p.providersByApplicationStatus, "in_review"))} in review.`}
          note="Counted now, whatever the dates."
          empty="No provider has started an application yet."
        />
      </DashboardSection>

      <DashboardSection
        id="funnel"
        eyebrow="The way in"
        title="From a first visit to a first session"
        lede="People who made an account in these dates, followed to wherever they have got to since."
      >
        <FunnelCard steps={stats.funnel} range={range} trafficSince={recordingSince.traffic} />
      </DashboardSection>

      <DashboardSection id="talk-time" eyebrow="Time with TALK" title="How people talk with TALK">
        <div className={FOUR_GRID}>
          <StatCard
            label="Typical length"
            value={e.medianSec === null ? "—" : <Duration seconds={e.medianSec} />}
            caption={e.medianSec === null ? "Too few ended conversations to say." : "The median: half are shorter."}
          />
          <StatCard
            label="The longest tenth"
            value={e.p90Sec === null ? "—" : <Duration seconds={e.p90Sec} />}
            caption={e.p90Sec === null ? "Too few ended conversations to say." : "1 in 10 conversations run longer."}
          />
          <StatCard
            label="Reached the end"
            value={shareText(e.completion)}
            caption={
              e.completion.denominator === 0
                ? "No conversations in these dates."
                : e.completion.suppressed || e.completion.numerator === null
                  ? "Too few conversations to say."
                : `${e.completion.numerator.toLocaleString("en-GB")} of ${(e.completion.denominator ?? 0).toLocaleString("en-GB")} conversations.`
            }
          />
          <StatCard label="With a length" value={cellText(e.measured)} caption="Conversations whose end was reported." />
        </div>

        <div className={TWO_UP}>
          <HourCard stats={stats} empty={talkEmpty} note={talkNote} />
          <CategoryCard
            title="How long conversations last"
            list={e.durationHistogram}
            labelHeading="Length"
            valueHeading="Conversations"
            shareOf={shareBase(e.measured, "measured")}
            takeaway={
              e.medianSec !== null && e.p90Sec !== null
                ? `Half end within ${durationText(e.medianSec)}; 1 in 10 run past ${durationText(e.p90Sec)}.`
                : undefined
            }
            note="A length is never counted past the paid time plus half again."
            empty={talkEmpty}
          />
          <CategoryCard
            title="Spoken or typed"
            list={e.byMode}
            labelHeading="How"
            valueHeading="Conversations"
            shareOf={shareBase(e.measured, "ended conversations")}
            takeaway={leadText(e.byMode, e.measured, (label, part) => `Most common: ${label.toLowerCase()}, ${part}.`)}
            note="Of the conversations whose end was reported. “Both” means spoken and typed answers in one conversation; answers tapped on screen count as typed. “No answers” ended before the person said anything."
            empty={talkEmpty}
          />
          <CategoryCard
            title="Language of the conversation"
            list={e.byLanguage}
            labelHeading="Language"
            valueHeading="Conversations"
            shareOf={conversations}
            takeaway={leadText(e.byLanguage, e.conversations, (label, part) => `Most common: ${label}, ${part}.`)}
            empty={talkEmpty}
          />
          <CategoryCard
            title="Kind of conversation"
            list={e.byKind}
            labelHeading="Kind"
            valueHeading="Conversations"
            shareOf={conversations}
            takeaway={leadText(e.byKind, e.conversations, (label, part) => `${capitalise(part)} were “${label.toLowerCase()}”.`)}
            note="“Getting to know you” ends with providers who fit; “talking again” is coming back to TALK after that."
            empty={talkEmpty}
          />
          <SeriesCard
            title="Messages with providers"
            points={e.chatMessagesByBucket}
            bucket={range.bucket}
            valueHeading="Messages"
            takeaway={
              e.chatMessages.suppressed
                ? "Fewer than 5 in these dates."
                : `${plural(e.chatMessages.value ?? 0, "message")} between people and providers ${period}.`
            }
            note="Counted, never read."
            empty="No messages between people and providers in these dates."
            className="lg:col-span-2"
          />
        </div>
      </DashboardSection>

      <ProviderCalls stats={stats} />

      <DashboardSection
        id="site"
        eyebrow="The public site"
        title="Visits to talktherapy.gm"
        lede="Anonymous: each open tab has a random id that is forgotten when it closes. No address, device or account is kept, and bots are left out."
      >
        <div className={TWO_UP}>
          <SeriesCard
            title="Page views"
            points={e.traffic.viewsByBucket}
            bucket={range.bucket}
            valueHeading="Views"
            takeaway={
              e.traffic.views.suppressed || e.traffic.visits.suppressed
                ? "Fewer than 5 visits in these dates."
                : `${plural(e.traffic.views.value ?? 0, "page view")} in ${plural(e.traffic.visits.value ?? 0, "visit")}.`
            }
            note={sinceNote(recordingSince.traffic, range, "Visits")}
            empty={
              recordingSince.traffic === null
                ? "Not recorded yet. Visits are counted from the release that started recording them."
                : "No visits to the site in these dates."
            }
          />
          <CategoryCard
            title="Pages people open"
            list={e.traffic.byPage}
            labelHeading="Page"
            valueHeading="Views"
            shareOf={shareBase(e.traffic.views, "page views")}
            takeaway={leadText(e.traffic.byPage, e.traffic.views, (label, part) => `${label} is opened most: ${part}.`)}
            note="A provider's or a resource's own page is counted as one kind of page, never by which one."
            empty="No page views in these dates."
          />
        </div>
      </DashboardSection>

      <MoneySection stats={stats} />
    </>
  );
}

// ------------------------------------------------------------------- usage

/**
 * Daily, weekly and monthly actives, side by side: three counts of the same
 * people at three grains, which no one chart can hold on one scale.
 */
function ActiveUsers({ stats }: { stats: AdminStats }) {
  const { range, people: p, recordingSince } = stats;
  const since = sinceNote(recordingSince.presence, range, "People in the app");
  const empty =
    recordingSince.presence === null
      ? "Not recorded yet. People in the app are counted from the release that started recording them."
      : "Nobody signed in to the app in these dates.";
  const peakDay = largest(p.dau);
  const peakWeek = largest(p.wau);
  const peakMonth = largest(p.mau);

  return (
    <div className={TWO_UP}>
      <SeriesCard
        title="People in the app each day"
        points={p.dau}
        bucket="day"
        valueHeading="People"
        takeaway={peakDay ? `Most in one day: ${countWords(peakDay)}, on ${bucketLabel(peakDay.t, "day")}.` : undefined}
        note={[range.days > 92 ? "Covers the last 92 days of these dates." : null, since].filter(Boolean).join(" ") || undefined}
        empty={empty}
        className="lg:col-span-2"
      />
      <SeriesCard
        title="Each week"
        points={p.wau}
        bucket="week"
        valueHeading="People"
        takeaway={
          peakWeek ? `Most in one week: ${countWords(peakWeek)}, the ${uncapitalise(bucketLabel(peakWeek.t, "week"))}.` : undefined
        }
        note={`Monday to Sunday.${since ? ` ${since}` : ""}`}
        empty={empty}
      />
      <SeriesCard
        title="Each month"
        points={p.mau}
        bucket="month"
        valueHeading="People"
        takeaway={peakMonth ? `Most in one month: ${countWords(peakMonth)}, in ${bucketLabel(peakMonth.t, "month")}.` : undefined}
        note={since}
        empty={empty}
      />
    </div>
  );
}

// ---------------------------------------------------------- provider calls

/**
 * How long sessions with providers last, beside the time with TALK above:
 * timed from the call room, from the first person joining to the last
 * hanging up. Lengths only once there are five calls to take them from.
 */
function ProviderCalls({ stats }: { stats: AdminStats }) {
  const { range, recordingSince } = stats;
  const c = stats.engagement.providerCalls;
  const since = sinceNote(recordingSince.providerCalls, range, "Calls");
  const tooFew = "Too few calls with an end to say.";

  return (
    <DashboardSection
      id="call-time"
      eyebrow="Time with providers"
      title="How long sessions last"
      lede="From the session's call: the first person joining to the last hanging up, so a wait for the other person counts too. Nothing said in a call is ever recorded."
    >
      <div className={FOUR_GRID}>
        <StatCard label="Session calls" value={cellText(c.calls)} caption="Opened in these dates." />
        <StatCard
          label="Typical length"
          value={c.medianSec === null ? "—" : <Duration seconds={c.medianSec} />}
          caption={c.medianSec === null ? tooFew : "The median: half are shorter."}
        />
        <StatCard
          label="The longest tenth"
          value={c.p90Sec === null ? "—" : <Duration seconds={c.p90Sec} />}
          caption={c.p90Sec === null ? tooFew : "1 in 10 calls run longer."}
        />
        <StatCard label="With a length" value={cellText(c.measured)} caption="Calls whose end was recorded." />
      </div>
      <CategoryCard
        title="How long session calls last"
        list={c.durationHistogram}
        labelHeading="Length"
        valueHeading="Calls"
        shareOf={shareBase(c.measured, "calls with a length")}
        takeaway={
          c.medianSec !== null && c.p90Sec !== null
            ? `${capitalise(countWords(c.measured))} calls: half end within ${durationText(c.medianSec)}; 1 in 10 run past ${durationText(c.p90Sec)}.`
            : undefined
        }
        note={[
          `Sessions are booked for ${SLOT_MINUTES} minutes. A call is never counted as longer than its join window, ten minutes before the session to an hour after.`,
          since,
        ]
          .filter(Boolean)
          .join(" ")}
        empty={
          recordingSince.providerCalls === null
            ? "Not recorded yet. Calls are timed from the release that started recording them."
            : "No session calls with an end in these dates."
        }
      />
    </DashboardSection>
  );
}

// ------------------------------------------------------------------ funnel

function FunnelCard({
  steps,
  range,
  trafficSince,
}: {
  steps: FunnelStep[];
  range: ResolvedRange;
  trafficSince: number | null;
}) {
  const signedUp = steps.find((s) => s.key === "signedUp");
  const paid = steps.find((s) => s.key === "paidFirst");
  const attended = steps.find((s) => s.key === "attended");
  const accounts = signedUp ? shownValue(signedUp) : null;
  const paidPart =
    paid && accounts
      ? paid.suppressed
        ? `fewer than 5 of the ${plural(accounts, "new account")}`
        : `${stepShare(paid, signedUp)} of new accounts`
      : null;
  const takeaway =
    paidPart && attended
      ? `${capitalise(paidPart)} paid for a first conversation; ${countWords(attended)} have had a session.`
      : signedUp?.suppressed
        ? "Fewer than 5 new accounts in these dates."
        : undefined;

  return (
    <ChartCard
      title="Step by step"
      subtitle={isQuiet(steps) ? undefined : takeaway}
      table={{
        columns: ["Step", "Count", "Of the step before", "Of new accounts"],
        rows: steps.map((s, i) => [
          s.label,
          cellText(s),
          i > 1 ? stepShare(s, steps[i - 1]) : i === 1 ? stepShare(s, steps[0]) : "—",
          i > 1 ? stepShare(s, signedUp) : "—",
        ]),
      }}
      empty={isQuiet(steps) ? "Nobody visited or made an account in these dates." : undefined}
      note={[
        "The first step counts visits; the rest count people.",
        sinceNote(trafficSince, range, "Visits"),
      ]
        .filter(Boolean)
        .join(" ")}
      minHeight={320}
    >
      <FunnelChart steps={steps} />
    </ChartCard>
  );
}

// ----------------------------------------------------------- hour of week

const WEEKDAYS = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];

function HourCard({ stats, empty, note }: { stats: AdminStats; empty: string; note?: string }) {
  const { rows, cols, values } = stats.engagement.hourOfWeek;
  let peak: { day: number; hour: number; value: number } | null = null;
  for (let day = 0; day < values.length; day++) {
    for (let hour = 0; hour < values[day].length; hour++) {
      const value = values[day][hour];
      if (value !== null && value > 0 && (peak === null || value > peak.value)) peak = { day, hour, value };
    }
  }
  const quiet = values.every((row) => row.every((v) => v === 0));
  const hour = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;

  return (
    <ChartCard
      title="When conversations start"
      subtitle={
        quiet || !peak
          ? undefined
          : `Busiest: ${WEEKDAYS[peak.day]} from ${hour(peak.hour)} to ${hour(peak.hour + 1)} UTC, with ${peak.value}.`
      }
      table={heatmapTable(rows, cols, values, { corner: "UTC" })}
      empty={quiet ? empty : undefined}
      note={[note, "Hours are UTC, Gambian time. Each cell adds up the conversations started in that hour on that weekday."]
        .filter(Boolean)
        .join(" ")}
      minHeight={220}
      className="lg:col-span-2"
    >
      <Heatmap rows={rows} cols={cols} values={values} label="Conversations started, by weekday and hour, UTC" />
    </ChartCard>
  );
}

// ------------------------------------------------------------------- money

function MoneySection({ stats }: { stats: AdminStats }) {
  const { money, headline, range } = stats;
  const payments = money.byPurpose.reduce((sum, p) => sum + p.count, 0);
  const payouts = money.payouts;
  const purposes: Category[] = money.byPurpose.map((p) => ({ key: p.key, label: p.label, value: p.amountMinor, suppressed: false }));
  const series: LineSeries[] = money.series.map((s, i) => ({
    id: s.key,
    label: s.label,
    color: seriesColor(i),
    points: s.points.map((pt) => ({ x: pt.t, y: pt.amountMinor })),
  }));
  const quiet = money.series.every((s) => s.points.every((pt) => pt.amountMinor === 0));
  const top = largest(purposes);
  const tableX = (t: number) => bucketLabel(t, range.bucket);

  return (
    <DashboardSection
      id="money"
      eyebrow="Money"
      title="What came in and went out"
      lede="Exact amounts in dalasi: money is never withheld, so it can be checked against Modem Pay to the butut. Test payments are left out."
    >
      <div className={MONEY_GRID}>
        <MetricCard
          label="Received"
          metric={headline.revenueMinor}
          range={range}
          format={formatDalasi}
          caption="After refunds."
        />
        <StatCard label="Paid in" value={formatDalasi(money.grossMinor)} caption={`${plural(payments, "payment")}, before refunds.`} />
        <StatCard label="Refunded" value={formatDalasi(money.refundsMinor)} caption={`${plural(money.refundsCount, "refund")}.`} />
        <StatCard
          label="TALK keeps"
          value={formatDalasi(money.platformFeeMinor)}
          caption={`Conversations with TALK in full, and ${percentText(PLATFORM_FEE_RATE)} of each session not refunded.`}
        />
        <StatCard
          label="Paid to providers"
          value={formatDalasi(payouts.sentMinor)}
          caption={`${plural(payouts.sentCount, "payout")} made in these dates.`}
        />
        <StatCard
          label="Payouts on the way"
          value={formatDalasi(payouts.pendingMinor)}
          caption={`${plural(payouts.pendingCount, "payout")}${
            payouts.failedCount ? `; ${plural(payouts.failedCount, "failed payout")} (${formatDalasi(payouts.failedMinor)})` : ""
          }.`}
        />
      </div>

      <div className={TWO_UP}>
        <ChartCard
          title="Money received, by what it was for"
          subtitle={quiet ? undefined : `${formatDalasi(money.netMinor)} after refunds; TALK keeps ${formatDalasi(money.platformFeeMinor)}.`}
          legend={lineChartLegend(series)}
          table={lineChartTable(series, {
            xLabel: range.bucket === "day" ? "Day" : range.bucket === "week" ? "Week" : "Month",
            xFormat: tableX,
            yFormat: (v) => formatDalasi(v),
          })}
          empty={quiet ? "No payments were received in these dates." : undefined}
          minHeight={240}
        >
          <LineChart
            series={series}
            yFormat={(v) => formatDalasi(v)}
            xFormat={tableX}
            curve="straight"
            label="Money received per period, by what it was for, in dalasi"
          />
        </ChartCard>
        <CategoryCard
          title="What the money was for"
          list={purposes}
          labelHeading="For"
          valueHeading="Received"
          valueFormat={(v) => formatDalasi(v)}
          shareOf={money.grossMinor ? { total: money.grossMinor, label: "money in" } : null}
          takeaway={top ? `${top.label} brought in the most: ${formatDalasi(top.value ?? 0)}.` : undefined}
          note={
            payments
              ? `Number of payments: ${money.byPurpose.map((p) => `${p.label}, ${p.count.toLocaleString("en-GB")}`).join("; ")}.`
              : undefined
          }
          empty="No payments were received in these dates."
        />
      </div>
    </DashboardSection>
  );
}

// ---------------------------------------------------------------- loading

function InsightsSkeleton() {
  const placeholderCards = (labels: string[]) =>
    labels.map((label) => <StatCard key={label} label={label} value="" loading />);
  return (
    <div className="space-y-10 md:space-y-12">
      <div className="space-y-4">
        <div className={FOUR_GRID}>
          {placeholderCards(["Active today", "Active this week", "Active this month", "Got started"])}
        </div>
        <ChartPlaceholder title="People in the app each day" />
      </div>
      <ChartPlaceholder title="Step by step" height={320} />
      <div className="space-y-4">
        <div className={FOUR_GRID}>
          {placeholderCards(["Typical length", "The longest tenth", "Reached the end", "With a length"])}
        </div>
        <div className={TWO_UP}>
          <ChartPlaceholder title="How long conversations last" />
          <ChartPlaceholder title="When conversations start" />
        </div>
      </div>
      <div className="space-y-4">
        <div className={FOUR_GRID}>
          {placeholderCards(["Session calls", "Typical length", "The longest tenth", "With a length"])}
        </div>
        <ChartPlaceholder title="How long session calls last" />
      </div>
    </div>
  );
}
