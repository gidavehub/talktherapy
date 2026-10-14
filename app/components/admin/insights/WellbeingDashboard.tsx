"use client";

import StatCard from "@/components/ui/StatCard";
import Button from "@/components/ui/Button";
import { IconLock } from "@/components/ui/icons";
import { ChartCard, Heatmap, LineChart, heatmapTable } from "@/components/ui/charts";
import type { LineSeries } from "@/components/ui/charts";
import { Alert } from "@/components/ui/Feedback";
import {
  K_ANONYMITY,
  SUPPRESSED_TEXT,
  wellbeingCsv,
  type AdminStats,
  type ResolvedRange,
  type WellbeingStats,
} from "@/lib/adminStats";
import StatsDashboard from "./StatsDashboard";
import { CategoryCard, ChartPlaceholder, DashboardSection } from "./cards";
import {
  bucketLabel,
  capitalise,
  cellText,
  countWords,
  dayMonthText,
  isoDay,
  largest,
  leadText,
  shareBase,
  sinceNote,
  wholeShare,
} from "./format";

/**
 * /admin/insights/wellbeing — what people bring to TALK: what they are
 * struggling with and the help they want, the topics their conversations
 * touch week by week, how their mood moves, who they are, and how often TALK
 * sensed danger.
 *
 * The most sensitive page staff have, so it is the strictest: groups only,
 * every one under five withheld, one whole month at a time and only once it
 * has ended, a plain note on how, and a download that holds exactly what is
 * on the page and nothing more.
 */
export default function WellbeingDashboard() {
  return (
    <StatsDashboard
      scope="month"
      eyebrow="Wellbeing"
      lines={["What people bring", "to TALK."]}
      lede="What people told TALK they are struggling with, how their mood moves, and who they are — in groups, never one by one, a month at a time."
      barTitle="Wellbeing"
      actions={(stats) => (
        <Button
          variant="secondary"
          disabled={!stats?.wellbeing}
          onClick={() => {
            if (stats?.wellbeing) downloadCsv(stats.wellbeing, stats.range);
          }}
        >
          Download CSV
        </Button>
      )}
      lead={() => <PrivacyNote />}
      skeleton={<WellbeingSkeleton />}
    >
      {(stats) =>
        stats.wellbeing ? (
          <Wellbeing stats={stats} w={stats.wellbeing} />
        ) : (
          // Only a month's figures carry these; another range's never do.
          <Alert title="Choose a month">Wellbeing figures come a whole month at a time, once the month has ended.</Alert>
        )
      }
    </StatsDashboard>
  );
}

/** The aggregates as a file: the same groups and "<5"s the page shows, built by wellbeingCsv. */
function downloadCsv(wellbeing: WellbeingStats, range: ResolvedRange) {
  // The byte-order mark makes Excel read the file as UTF-8, so the dashes in
  // "1–5" arrive as written.
  const blob = new Blob(["﻿", wellbeingCsv(wellbeing, range)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `talk-wellbeing-${isoDay(range.from).slice(0, 7)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked well after the click, which some browsers read only once it has returned.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function PrivacyNote() {
  return (
    <aside
      aria-labelledby="privacy-title"
      className="rounded-[24px] border border-[var(--sage)]/25 bg-[var(--sage-pale)]/45 p-5 md:p-6"
    >
      <div className="flex items-start gap-4">
        <span className="arch flex h-12 w-10 shrink-0 items-center justify-center rounded-b-lg bg-[var(--sage)] text-white">
          <IconLock />
        </span>
        <div className="min-w-0">
          <h2 id="privacy-title" className="font-display text-[19px] font-medium leading-tight md:text-[20px]">
            How these figures stay anonymous
          </h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-4 text-[13.5px] leading-relaxed text-[var(--dark-soft)] marker:text-[var(--sage-deep)]">
            <li>
              Every figure is a count of a group, worked out on the server. Names, messages, journals, notes and what
              people said to TALK are never read for this page.
            </li>
            <li>
              Any group of 1 to {K_ANONYMITY - 1} people shows as {SUPPRESSED_TEXT}. Where a total would give a hidden
              group away, the next smallest group is hidden too.
            </li>
            <li>
              Figures come one whole month at a time, once it has ended, and each month is counted on its own. Dates
              that could be moved a day at a time would let two views be compared to single out one day&rsquo;s people.
            </li>
            <li>Staff, test and sample accounts are left out.</li>
            <li>The CSV download holds these group counts and nothing more.</li>
          </ul>
        </div>
      </div>
    </aside>
  );
}

const FOUR_GRID = "grid grid-cols-2 gap-3 lg:grid-cols-4";
const TWO_UP = "grid grid-cols-1 gap-4 lg:grid-cols-2";

/** What every breakdown of the people counted says when there is nobody. */
const NOBODY_TOLD = "Nobody finished getting to know TALK in this month.";

function Wellbeing({ stats, w }: { stats: AdminStats; w: WellbeingStats }) {
  const { range, recordingSince } = stats;
  const people = shareBase(w.population, "people");
  const largestGroup = (label: string, part: string) => `Largest group: ${label}, ${part}.`;
  const topRisk = largest(w.safetyByRisk);

  return (
    <>
      <div className={FOUR_GRID}>
        <StatCard
          label="People counted"
          value={cellText(w.population)}
          caption="Finished getting to know TALK in this month."
        />
        <StatCard label="Mood check-ins" value={cellText(w.mood.entries)} caption="Made in this month." />
        <StatCard
          label="Average mood"
          value={w.mood.average === null ? "—" : w.mood.average.toFixed(2)}
          caption={w.mood.average === null ? "Too few check-ins to give an average." : "Out of 5: 1 is struggling, 5 is great."}
        />
        <StatCard
          label="Flagged by TALK"
          value={cellText(w.safetyFlaggedConversations)}
          caption="Conversations where she sensed danger. Counted only."
        />
      </div>

      <DashboardSection
        id="struggles"
        eyebrow="What people bring"
        title="What they are struggling with"
        lede="From the answers people gave TALK while getting to know them. People could name more than one thing, so shares add up to more than the whole."
      >
        <div className={TWO_UP}>
          <CategoryCard
            title="What people are struggling with"
            list={w.concerns}
            labelHeading="Concern"
            valueHeading="People"
            shareOf={people}
            takeaway={leadText(w.concerns, w.population, (label, part) => `${label} is named most often, by ${part}.`)}
            empty={NOBODY_TOLD}
          />
          <CategoryCard
            title="The help they want"
            list={w.servicesWanted}
            labelHeading="Service"
            valueHeading="People"
            shareOf={people}
            takeaway={leadText(w.servicesWanted, w.population, (label, part) => `${label} is asked for most often, by ${part}.`)}
            empty={NOBODY_TOLD}
          />
        </div>
        <TopicsCard
          w={w}
          note={sinceNote(recordingSince.talkSessions, range, "Conversations")}
          empty={
            recordingSince.talkSessions === null
              ? "Not recorded yet. Conversations are counted from the release that started recording them."
              : undefined
          }
        />
      </DashboardSection>

      <DashboardSection
        id="mood"
        eyebrow="Mood"
        title="How people are feeling"
        lede="From the mood check-ins people make in the app: a score from 1, struggling, to 5, great. Notes written with a check-in are never read."
      >
        <div className={TWO_UP}>
          <MoodTrendCard w={w} />
          <CategoryCard
            title="How people rated their mood"
            list={w.mood.distribution}
            labelHeading="Mood"
            valueHeading="Check-ins"
            shareOf={shareBase(w.mood.entries, "check-ins")}
            takeaway={leadText(w.mood.distribution, w.mood.entries, (label, part) => `Most often “${label.toLowerCase()}”: ${part}.`)}
            note="Counted from every check-in, without looking at whose it is, so a staff or test account's could be among them."
            empty="No mood check-ins in this month."
          />
        </div>
      </DashboardSection>

      <DashboardSection
        id="who"
        eyebrow="Who they are"
        title="The people in these figures"
        lede="As they told TALK. “Not said” is somebody who skipped the question."
      >
        <div className={TWO_UP}>
          <CategoryCard
            title="Age"
            list={w.ageBands}
            labelHeading="Age"
            valueHeading="People"
            shareOf={people}
            takeaway={leadText(w.ageBands, w.population, largestGroup)}
            empty={NOBODY_TOLD}
          />
          <CategoryCard
            title="Gender"
            list={w.gender}
            labelHeading="Gender"
            valueHeading="People"
            shareOf={people}
            takeaway={leadText(w.gender, w.population, largestGroup)}
            empty={NOBODY_TOLD}
          />
          <CategoryCard
            title="Where they live"
            list={w.regions}
            labelHeading="Region"
            valueHeading="People"
            shareOf={people}
            takeaway={leadText(w.regions, w.population, largestGroup)}
            empty={NOBODY_TOLD}
          />
          <CategoryCard
            title="Who they would like to see"
            list={w.providerGender}
            labelHeading="A provider who is"
            valueHeading="People"
            shareOf={people}
            takeaway={leadText(w.providerGender, w.population, largestGroup)}
            empty={NOBODY_TOLD}
          />
          <CategoryCard
            title="Language they chose"
            list={w.languages}
            labelHeading="Language"
            valueHeading="People"
            shareOf={people}
            takeaway={leadText(w.languages, w.population, largestGroup)}
            empty={NOBODY_TOLD}
            className="lg:col-span-2"
          />
        </div>
      </DashboardSection>

      <DashboardSection
        id="safety"
        eyebrow="Safety"
        title="When there may be danger"
        lede="Counts only. Who it was is never shown here."
      >
        <CategoryCard
          title="Conversations TALK flagged, by how serious"
          list={w.safetyByRisk}
          labelHeading="How serious"
          valueHeading="Conversations"
          shareOf={wholeShare(w.safetyByRisk)}
          takeaway={
            topRisk
              ? `${capitalise(countWords(w.safetyFlaggedConversations))} flagged; the most at “${topRisk.label.toLowerCase()}”: ${countWords(topRisk)}.`
              : `${capitalise(countWords(w.safetyFlaggedConversations))} flagged, too few at each level to show.`
          }
          note="The highest level TALK rated each conversation, from her safety check on every turn. Elevated: thoughts of self-harm, abuse, or feeling unsafe. Urgent: in danger right now. Each time, she gave the emergency numbers: 117 for the police, 116 for an ambulance."
          empty="TALK flagged no conversations in this month."
        />
      </DashboardSection>
    </>
  );
}

/** Topics week by week, as a grid: one row per topic, one column per week, darker for more. */
function TopicsCard({ w, note, empty }: { w: WellbeingStats; note?: string; empty?: string }) {
  const topics = w.topicsByWeek;
  const weeks = topics[0]?.points.map((p) => p.t) ?? [];
  const rows = topics.map((t) => t.label);
  const values = topics.map((t) => t.points.map((p) => (p.suppressed ? null : (p.value ?? 0))));
  // The table runs down the weeks: on a phone a long list scrolls better than a wide one.
  const byWeek = weeks.map((_, c) => values.map((row) => row[c]));
  const [first, second] = topics;

  return (
    <ChartCard
      title="Topics in conversations with TALK, week by week"
      subtitle={
        first
          ? `${first.label} comes up most${second ? `, then ${second.label.toLowerCase()}` : ""}.`
          : undefined
      }
      table={heatmapTable(
        weeks.map((t) => bucketLabel(t, "week")),
        rows,
        byWeek,
        { corner: "Week" },
      )}
      empty={topics.length ? undefined : (empty ?? "No conversation with TALK touched a topic in this month.")}
      note={[
        note,
        "Each cell counts conversations that touched the topic that week. Getting to know somebody, that is the concerns they named; later conversations, the topics TALK tagged their turns with. Both come from a fixed list, never from what was said. The first and last weeks are cut at the month's edges.",
      ]
        .filter(Boolean)
        .join(" ")}
      minHeight={200}
    >
      <Heatmap
        rows={rows}
        cols={weeks.map(dayMonthText)}
        values={values}
        label="Conversations touching each topic, by week"
      />
    </ChartCard>
  );
}

/** The weekly average, as a line through the weeks that have one. */
function MoodTrendCard({ w }: { w: WellbeingStats }) {
  const { mood } = w;
  const known = mood.weeklyAverage.flatMap((p) => (p.value === null ? [] : [{ x: p.t, y: p.value }]));
  const series: LineSeries[] = [{ id: "mood", label: "Average mood", points: known }];
  const entries = new Map(mood.weeklyEntries.map((p) => [p.t, p]));
  const withheldWeeks = mood.weeklyAverage.some((p) => p.suppressed);

  return (
    <ChartCard
      title="Average mood, week by week"
      subtitle={
        known.length && mood.average !== null
          ? `${mood.average.toFixed(2)} out of 5 across ${countWords(mood.entries)} check-ins.`
          : undefined
      }
      table={{
        columns: ["Week", "Average (1 to 5)", "Check-ins"],
        rows: mood.weeklyAverage.map((p) => {
          const n = entries.get(p.t);
          return [
            bucketLabel(p.t, "week"),
            p.value === null ? "—" : p.value.toFixed(2),
            n ? cellText(n) : "—",
          ];
        }),
      }}
      empty={known.length ? undefined : "Too few check-ins in this month to show an average."}
      note={
        withheldWeeks
          ? `Weeks with fewer than ${K_ANONYMITY} check-ins have no average, so the line skips them; the table marks their check-ins ${SUPPRESSED_TEXT}.`
          : undefined
      }
      minHeight={220}
    >
      <LineChart
        series={series}
        xFormat={(t) => bucketLabel(t, "week")}
        curve="straight"
        label="Average mood per week, from 1 to 5"
      />
    </ChartCard>
  );
}

function WellbeingSkeleton() {
  return (
    <div className="space-y-10 md:space-y-12">
      <div className={FOUR_GRID}>
        {["People counted", "Mood check-ins", "Average mood", "Flagged by TALK"].map((label) => (
          <StatCard key={label} label={label} value="" loading />
        ))}
      </div>
      <div className={TWO_UP}>
        <ChartPlaceholder title="What people are struggling with" height={300} />
        <ChartPlaceholder title="The help they want" height={200} />
      </div>
      <ChartPlaceholder title="Topics in conversations with TALK, week by week" />
    </div>
  );
}
