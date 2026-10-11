/**
 * Talk's voice, loud — and never distorted.
 *
 * Every way Talk speaks ends here: the conversation and read-aloud (live
 * speech, through StreamPlayer) and the recorded lines on the landing and
 * urgent-help pages (lines.ts). The owner's brief: much, much louder — a
 * phone speaker in a room with somebody else in it, often outdoors.
 *
 * Measured before (ITU-R BS.1770 loudness, 23 clips: all 20 recorded lines
 * and 3 live replies from the deployed companionSpeak):
 *   about -20 LUFS on average, and uneven — one recorded line at -26, another
 *   at -16 — with peaks already touching 0 dBFS. A browser cannot turn an
 *   audio element past 100%, and a plain boost would distort the loud clips
 *   while leaving the quiet ones quiet.
 *
 * So, in order:
 *   1. a leveller (a slow, deep compressor) that lifts quiet speech and holds
 *      loud speech back, so every line arrives at much the same loudness;
 *   2. the boost itself;
 *   3. a limiter, then a soft clipper whose curve cannot go past CEILING —
 *      the guarantee that no sample ever clips, whatever comes in.
 *
 * The numbers were tuned by rendering this exact chain in Chrome's own audio
 * engine (OfflineAudioContext, 48 kHz) over those 23 clips and measuring:
 *
 *                     before            after
 *   average           -19.9 LUFS        -10.2 LUFS   (+9.7 dB, ~3x the level)
 *   quietest line     -26.5 LUFS        -11.9 LUFS   (~5x)
 *   live replies      -17 to -20.5      -9.2 to -10.8
 *   spread            10.5 LU           3.1 LU
 *   highest peak      0 dBFS, 5 clipped  -0.2 dBFS, none clipped
 *
 * Pushed further (limiter at -1 dB, more boost) it starts clipping and
 * squashing the voice audibly for barely any more loudness: this is about as
 * loud as speech gets from a phone before it stops sounding like a person.
 *
 * The particles keep reading the voice BEFORE this chain, so Talk sounds
 * louder without the blob suddenly looking twice as excited.
 */

const dbToGain = (db: number) => Math.pow(10, db / 20);

export const VOICE_CHAIN = {
  leveller: { threshold: -50, knee: 20, ratio: 8, attack: 0.006, release: 0.3 },
  boostDb: 15,
  limiter: { threshold: -1.5, knee: 0, ratio: 20, attack: 0, release: 0.1 },
  trimDb: -0.3,
  /** The highest any sample can reach: 0.94 ≈ -0.5 dBFS. */
  ceiling: 0.94,
} as const;

/** Straight through to 0.8, then a smooth knee that never passes the ceiling. */
function softClipCurve(ceiling: number): Float32Array<ArrayBuffer> {
  const n = 8192;
  const knee = 0.8;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + (ceiling - knee) * Math.tanh((a - knee) / (ceiling - knee));
    curve[i] = Math.sign(x) * Math.min(y, ceiling);
  }
  return curve;
}

const chains = new WeakMap<BaseAudioContext, AudioNode>();

/**
 * Where Talk's voice should be connected instead of `ctx.destination`. Built
 * once per audio context and shared by everything that speaks in it.
 */
export function voiceOutput(ctx: BaseAudioContext): AudioNode {
  const existing = chains.get(ctx);
  if (existing) return existing;

  const c = VOICE_CHAIN;
  const leveller = ctx.createDynamicsCompressor();
  leveller.threshold.value = c.leveller.threshold;
  leveller.knee.value = c.leveller.knee;
  leveller.ratio.value = c.leveller.ratio;
  leveller.attack.value = c.leveller.attack;
  leveller.release.value = c.leveller.release;

  const boost = ctx.createGain();
  boost.gain.value = dbToGain(c.boostDb);

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = c.limiter.threshold;
  limiter.knee.value = c.limiter.knee;
  limiter.ratio.value = c.limiter.ratio;
  limiter.attack.value = c.limiter.attack;
  limiter.release.value = c.limiter.release;

  const trim = ctx.createGain();
  trim.gain.value = dbToGain(c.trimDb);

  const clipper = ctx.createWaveShaper();
  clipper.curve = softClipCurve(c.ceiling);
  clipper.oversample = "2x";

  leveller.connect(boost);
  boost.connect(limiter);
  limiter.connect(trim);
  trim.connect(clipper);
  clipper.connect(ctx.destination);

  chains.set(ctx, leveller);
  return leveller;
}
