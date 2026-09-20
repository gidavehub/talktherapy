/**
 * Starter content for the Wellbeing Resource Centre.
 *
 * The concept note makes the resource centre the free tier, so shipping it
 * empty would mean shipping nothing for anyone who cannot pay. These entries
 * are general psychoeducation and self-help technique — the kind of thing a
 * health leaflet carries. Deliberately NOT clinical: nothing here diagnoses,
 * names a condition someone might apply to themselves, or substitutes for
 * assessment.
 *
 * These render from code today. Once `/admin/resources` exists, published
 * Firestore documents are merged over the top and eventually replace them, so
 * editing content does not require a deploy.
 */

import type { Resource } from "./models";

type SeedResource = Omit<Resource, "publishedAt" | "updatedAt"> & {
  publishedAt: number;
  updatedAt: number;
};

const AT = Date.UTC(2026, 0, 15);

export const SEED_RESOURCES: SeedResource[] = [
  {
    id: "seed-grounding",
    slug: "grounding-when-everything-feels-loud",
    title: "Grounding when everything feels loud",
    summary:
      "A five-minute exercise for moments when your thoughts are moving faster than you can follow.",
    format: "exercise",
    topics: ["stress", "emotional-regulation", "coping"],
    locales: ["en"],
    readingMinutes: 4,
    mediaUrl: null,
    coverPath: null,
    status: "published",
    publishedAt: AT,
    updatedAt: AT,
    body: `Some days your mind will not slow down. Thoughts pile on top of each other, your chest feels tight, and the harder you try to think your way out of it the faster everything moves.

Grounding does not solve the problem underneath. What it does is bring your attention back to the present moment so that you can think again.

## The 5-4-3-2-1 exercise

Sit or stand somewhere you can stay for a few minutes. Breathe normally — you are not trying to control your breath here.

Then, slowly, name to yourself:

**Five things you can see.** Look properly. The pattern on the floor. A mark on the wall. The colour of your sleeve.

**Four things you can feel.** The chair under you. The ground through your shoes. Air on your arms. The weight of your phone in your hand.

**Three things you can hear.** Start with the obvious sounds, then listen underneath them for the quieter ones.

**Two things you can smell.** If you cannot find two, name two smells you like.

**One thing you can taste.** Or one thing you are grateful for, if taste is difficult.

## Why it works

When you are overwhelmed, your attention is usually somewhere else entirely — in a conversation from yesterday, or a version of tomorrow that has not happened. This exercise gives your attention something undeniable to hold onto.

It will not feel dramatic. You are aiming for slightly steadier, not fixed.

## If it does not help

That is common, and it is not a failure. Grounding works better for some people than others, and better on some days than others. If your thoughts are consistently overwhelming, that is worth talking to someone about — not because something is wrong with you, but because you should not have to manage it alone.`,
  },
  {
    id: "seed-sleep",
    slug: "when-you-cannot-sleep-because-of-your-thoughts",
    title: "When you cannot sleep because of your thoughts",
    summary:
      "Why the mind gets loudest at night, and a few things that genuinely help.",
    format: "article",
    topics: ["stress", "coping", "emotional-regulation"],
    locales: ["en"],
    readingMinutes: 5,
    mediaUrl: null,
    coverPath: null,
    status: "published",
    publishedAt: AT,
    updatedAt: AT,
    body: `Lying awake replaying a conversation, worrying about money, or rehearsing a version of tomorrow that has not happened yet is one of the most common experiences people describe.

There is a reason the mind gets loud at night. For most of the day there is something to do — work, family, study, noise. At night the distractions stop, and whatever you have been carrying finally has your full attention.

## A few things that help

**Get out of bed.** If you have been lying awake for more than about twenty minutes, get up. Sit somewhere dim and do something undemanding until you feel sleepy. Staying in bed while frustrated teaches your body that bed is a place for lying awake.

**Write it down.** Keep paper beside you. Much of what keeps you awake is your mind refusing to let go of something it is afraid of forgetting. Writing it down often releases it.

**Stop checking the time.** Working out how few hours are left adds pressure to a situation that does not need any more.

**Be careful with the screen.** Not mainly because of the light — because of what is on it. Scrolling gives your mind more to process at the exact moment you need less.

**Let go of the goal.** "I must sleep now" is an unhelpful instruction. Aim to rest instead. Resting quietly is worth something, even without sleep.

## When it is worth talking to someone

If you have been sleeping badly for weeks, if you dread bedtime, or if exhaustion is affecting your work, study or relationships, it is worth speaking to a professional. Persistent sleep difficulty often travels alongside stress, grief or low mood, and it usually improves when the thing underneath it is addressed.`,
  },
  {
    id: "seed-grief",
    slug: "grief-does-not-follow-a-schedule",
    title: "Grief does not follow a schedule",
    summary:
      "On loss, and the unhelpful expectation that it should resolve in a set order.",
    format: "article",
    topics: ["grief", "emotional-regulation"],
    locales: ["en"],
    readingMinutes: 6,
    mediaUrl: null,
    coverPath: null,
    status: "published",
    publishedAt: AT,
    updatedAt: AT,
    body: `You may have heard that grief comes in stages, and that you pass through them in order until you arrive at acceptance. It is a tidy idea, and it is not how most people actually experience loss.

Grief is far less orderly. You can feel almost normal for a week and then be undone by a smell, a song, or someone's handwriting. You can feel relief and guilt about the relief. You can be angry at someone for dying. None of this means you are grieving wrongly.

## Things people often do not say out loud

**It comes in waves, not a slope.** Progress is not steady, and a bad day three months in is not a reversal.

**Anniversaries are hard, and so is the run-up to them.** Often the week before is heavier than the day itself.

**Other people stop asking quite quickly.** Support tends to arrive in a rush and then thin out, often just as the reality settles in. If you need someone months later, you are not being difficult by saying so.

**Practical grief is real grief.** Paperwork, belongings, someone else's phone still in a drawer. The admin of loss is exhausting and rarely acknowledged.

## What tends to help

Talk about the person. Use their name. Many people avoid mentioning someone who has died in case it causes pain, which can leave the bereaved feeling they have to carry the memory alone.

Keep some structure — eating, sleeping and moving at roughly regular times — without demanding productivity of yourself.

Accept help in specific forms. "Let me know if you need anything" is hard to answer. "I am bringing food on Thursday" is easier.

## When to reach out

Grief is not an illness and does not need to be treated. But if months on you cannot function, if you feel unable to go on, or if you are avoiding everything that reminds you of the person to the point that your life has narrowed, speaking to a counsellor can help.

If you are having thoughts of ending your life, please treat that as urgent. Call 117 for police or 116 for an ambulance, or tell someone near you right now.`,
  },
  {
    id: "seed-exam",
    slug: "academic-pressure-and-the-fear-of-falling-behind",
    title: "Academic pressure and the fear of falling behind",
    summary:
      "For students carrying expectations — their own, their family's, or both.",
    format: "article",
    topics: ["academic", "stress", "self-esteem"],
    locales: ["en"],
    readingMinutes: 5,
    mediaUrl: null,
    coverPath: null,
    status: "published",
    publishedAt: AT,
    updatedAt: AT,
    body: `Academic pressure is rarely only about the work. It is usually also about what the result is supposed to prove, and who is waiting for it.

For many students there is a family that has invested real money and real hope. That is a heavy thing to carry into an exam hall, and it is not something more revision fixes.

## Separating the task from the meaning

When studying feels impossible, it is often because the task in front of you has become attached to a much larger question — whether you are capable, whether you will let people down, what happens if this does not work.

Try to notice when that has happened. The chapter in front of you is a chapter. It is not a verdict on your worth or your family's future.

## Practical things that genuinely help

**Work in short, defined blocks.** Twenty-five focused minutes beats three distracted hours, and it is far easier to start.

**Start with the easiest thing.** Momentum matters more than optimal ordering.

**Study somewhere you do not sleep.** Mixing the two makes both worse.

**Compare less.** Someone else claiming they have finished the syllabus tells you almost nothing true.

**Sleep before the exam, not during the night before it.** Most people perform better rested than crammed.

## Talking to family

If expectations at home are adding to the pressure, a direct conversation often helps more than people expect. You do not have to announce a crisis. Something as simple as saying you are finding this term hard and would appreciate patience can change the atmosphere considerably.

If that conversation feels impossible, a counsellor can help you work out how to have it.

## When to get support

If you have stopped attending, if anxiety is stopping you from sitting assessments, or if you are unable to enjoy anything outside study, speak to someone. Your institution may have a counsellor, and you can book a session here. This is common, and it responds well to support.`,
  },
  {
    id: "seed-breathing",
    slug: "a-breathing-exercise-that-actually-works",
    title: "A breathing exercise that actually works",
    summary:
      "Extended-exhale breathing — what it does, and how to do it without making things worse.",
    format: "exercise",
    topics: ["stress", "emotional-regulation", "coping"],
    locales: ["en"],
    readingMinutes: 3,
    mediaUrl: null,
    coverPath: null,
    status: "published",
    publishedAt: AT,
    updatedAt: AT,
    body: `Most breathing advice is some version of "take a deep breath", which for an anxious person can make things worse. Breathing in deeply and quickly is what the body already does when alarmed.

What calms the body is a longer breath *out*.

## The exercise

Breathe in through your nose for a count of four.

Breathe out through your mouth, slowly, for a count of six or eight. Longer out than in is the whole technique.

Repeat for about two minutes.

That is it. No holding, no forcing, no special posture.

## Getting it right

**Do not force a big breath.** Normal volume, slow pace. Aiming for a huge lungful can leave you lightheaded, which feels like the anxiety getting worse.

**Count comfortably.** If six feels like too long, use five. This is not a test.

**Expect a small effect.** You are aiming to take the edge off, not to feel transformed. If you expect a dramatic shift and do not get one, you will conclude it does not work.

**Practise when calm.** A technique you have only ever tried mid-panic is much harder to reach for. A minute a day when you are fine makes it available when you are not.

## Why the long exhale

Slowing your out-breath nudges the part of your nervous system responsible for settling the body — heart rate eases slightly, and the physical sense of alarm quietens a little. It is a small, real, physical lever, which is exactly why it is worth having.`,
  },
  {
    id: "seed-first-session",
    slug: "what-actually-happens-in-a-first-counselling-session",
    title: "What actually happens in a first counselling session",
    summary:
      "For anyone who has considered booking and stopped because they did not know what they were walking into.",
    format: "article",
    topics: ["personal-development", "coping"],
    locales: ["en"],
    readingMinutes: 4,
    mediaUrl: null,
    coverPath: null,
    status: "published",
    publishedAt: AT,
    updatedAt: AT,
    body: `A surprising number of people decide to get support, get as far as looking at profiles, and then stop — because they have no idea what a session actually involves.

So here it is, plainly.

## You do not need to prepare

You do not need your thoughts organised, a clear account of the problem, or the right vocabulary. "I do not really know where to start" is a completely normal opening sentence, and a good counsellor will take it from there.

## It is mostly a conversation

A first session is largely about the counsellor understanding what has brought you there and what you are hoping for. They will ask questions. You are allowed to not answer any of them.

There is no couch, no analysis of your childhood unless it is relevant to you, and no verdict at the end.

## You are allowed to say very little

Some people talk for the full hour. Others say a few sentences and sit with long silences. Both are fine. You are not failing the session by finding it difficult.

## You will probably cry, or you will not

Either is normal, and neither means much.

## It is confidential

What you say stays between you and your counsellor. The exception, which any professional will explain, is if there is a serious risk to your life or someone else's — in which case they have an obligation to act.

## You can change your mind

If it does not feel right, you are not committed. Fit matters enormously in counselling, and it is normal to try more than one person before finding someone you work well with. Choosing differently is not rudeness; it is the process working.

## Afterwards

Many people feel lighter. Some feel worse for a day or two, because things have been stirred up. That is not a sign it went badly — it usually means something real was touched.`,
  },
];

export function findSeedResource(slug: string): SeedResource | null {
  return SEED_RESOURCES.find((r) => r.slug === slug) ?? null;
}
