/**
 * Voice analysis for the blob: loudness, pitch and a 16-band spectrum.
 *
 * One implementation for every voice the blob reacts to — the user's
 * microphone and Talk's own speech — so both drive it with identical
 * processing. It was inline in useAudioLevel until Talk needed a voice too.
 */

/**
 * Number of spectral bands. Shared with the blob's shader, which allocates a
 * uniform array of exactly this length — change it in one place only.
 */
export const BAND_COUNT = 16;

/** Speech-relevant span for the bands: fundamental up through sibilance. */
const BAND_LO_HZ = 90;
const BAND_HI_HZ = 7500;

/** Below this, treat it as silence — room tone should not wobble the blob. */
const NOISE_FLOOR = 0.005;
/**
 * Speech f0 range. Roughly a low male voice to a high female one; anything
 * outside is almost certainly noise or a harmonic misfire rather than pitch.
 */
export const MIN_HZ = 70;
export const MAX_HZ = 400;
/** Autocorrelation below this is not a confident periodicity — report no pitch. */
const PITCH_CONFIDENCE = 0.55;

type Ref<T> = { current: T };

/**
 * Per-frame audio for a visual to read directly.
 *
 * Refs rather than state, deliberately: the blob samples these inside its own
 * render loop at 60fps. Routing them through React state would cap the
 * response at the publish rate and re-render the page on every frame.
 */
export type AudioFeed = {
  levelRef: Ref<number>;
  pitchRef: Ref<number>;
  /** BAND_COUNT smoothed energies, 0..1, lowest frequency first. */
  bandsRef: Ref<Float32Array>;
};

export function createFeed(): AudioFeed {
  return { levelRef: { current: 0 }, pitchRef: { current: 0 }, bandsRef: { current: new Float32Array(BAND_COUNT) } };
}

/**
 * Log-spaced FFT bin ranges for each band. Log, not linear, because pitch is
 * perceived logarithmically and speech energy is concentrated low: linear
 * bands would spend most of their resolution above 4kHz where little happens.
 */
function bandEdges(sampleRate: number, fftSize: number): Array<[number, number]> {
  const binHz = sampleRate / fftSize;
  const edges: Array<[number, number]> = [];
  for (let i = 0; i < BAND_COUNT; i++) {
    const f0 = BAND_LO_HZ * Math.pow(BAND_HI_HZ / BAND_LO_HZ, i / BAND_COUNT);
    const f1 = BAND_LO_HZ * Math.pow(BAND_HI_HZ / BAND_LO_HZ, (i + 1) / BAND_COUNT);
    const b0 = Math.max(1, Math.floor(f0 / binHz));
    const b1 = Math.max(b0 + 1, Math.ceil(f1 / binHz));
    edges.push([b0, b1]);
  }
  return edges;
}

/**
 * Fundamental frequency by autocorrelation.
 *
 * Chosen over an FFT peak because the loudest bin in speech is frequently a
 * harmonic rather than f0, which makes a naive spectral peak jump an octave
 * mid-vowel — the blob would twitch on timbre instead of tracking the voice.
 * Autocorrelation finds the repeat period directly and is stable across it.
 */
function detectPitch(buf: Float32Array, sampleRate: number): number {
  const minLag = Math.floor(sampleRate / MAX_HZ);
  const maxLag = Math.min(Math.floor(sampleRate / MIN_HZ), buf.length - 1);

  let bestLag = -1;
  let bestCorr = 0;
  let energy = 0;
  for (let i = 0; i < buf.length; i++) energy += buf[i] * buf[i];
  if (energy <= 0) return 0;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < buf.length - lag; i++) corr += buf[i] * buf[i + lag];
    // Normalised so long lags are not penalised for overlapping less.
    corr /= buf.length - lag;
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  if (bestLag < 0) return 0;
  const normalised = bestCorr / (energy / buf.length);
  if (normalised < PITCH_CONFIDENCE) return 0;
  return sampleRate / bestLag;
}

export type FrameReading = { rms: number; level: number; hz: number };

export class VoiceAnalyser {
  readonly feed: AudioFeed;
  private readonly time: AnalyserNode;
  private readonly freq: AnalyserNode;
  private readonly sink: GainNode;
  private readonly buf: Float32Array<ArrayBuffer>;
  private readonly fbuf: Uint8Array<ArrayBuffer>;
  private readonly edges: Array<[number, number]>;

  constructor(
    private readonly ctx: AudioContext,
    input: AudioNode,
    /** Write into an existing feed (so a consumer's refs stay stable). */
    feed: AudioFeed = createFeed(),
  ) {
    this.feed = feed;

    this.time = ctx.createAnalyser();
    this.time.fftSize = 1024;
    // No smoothing: smoothingTimeConstant only affects the FREQUENCY data,
    // and leaving it high on a node we read time-domain samples from buys
    // nothing while making the analyser lag.
    this.time.smoothingTimeConstant = 0;

    this.freq = ctx.createAnalyser();
    this.freq.fftSize = 2048;
    this.freq.smoothingTimeConstant = 0.35;
    // The dB window the byte data is scaled into. Narrower than the default
    // so ordinary speech spans most of 0..255 instead of sitting in the
    // bottom third.
    this.freq.minDecibels = -92;
    this.freq.maxDecibels = -28;

    // THE ANALYSERS MUST REACH THE DESTINATION.
    //
    // The Web Audio graph is pulled from ctx.destination. A branch that
    // dead-ends at an AnalyserNode is not guaranteed to be processed at all,
    // and the analyser then reads silence — microphone granted, status "live",
    // meter permanently flat. A zero-gain sink keeps the branch alive without
    // playing anything back, which for the microphone would also feed back.
    this.sink = ctx.createGain();
    this.sink.gain.value = 0;
    input.connect(this.time);
    input.connect(this.freq);
    this.time.connect(this.sink);
    this.freq.connect(this.sink);
    this.sink.connect(ctx.destination);

    this.buf = new Float32Array(new ArrayBuffer(this.time.fftSize * 4));
    this.fbuf = new Uint8Array(new ArrayBuffer(this.freq.frequencyBinCount));
    this.edges = bandEdges(ctx.sampleRate, this.freq.fftSize);
  }

  /** Read one frame and write it into the feed. Call once per animation frame. */
  update(): FrameReading {
    const buf = this.buf;
    this.time.getFloatTimeDomainData(buf);

    // RMS over the waveform, not an average of the FFT bins. Time-domain RMS
    // tracks loudness; a frequency average also rises when the timbre changes
    // at constant volume, which makes the blob react to vowels, not speech.
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);

    const gated = rms < NOISE_FLOOR ? 0 : (rms - NOISE_FLOOR) / (1 - NOISE_FLOOR);
    // Speech RMS rarely exceeds ~0.3, so scale into a usable 0..1 before the
    // curve — otherwise the blob barely moves at normal volume.
    const level = Math.min(1, gated * 4.5);
    this.feed.levelRef.current = level;

    // Pitch only while there is enough signal to be periodic. Running it on
    // silence returns confident nonsense.
    const hz = level > 0.06 ? detectPitch(buf, this.ctx.sampleRate) : 0;
    // Hold the last pitch briefly through consonants rather than snapping to
    // zero between every syllable, which reads as flicker.
    if (hz > 0) {
      this.feed.pitchRef.current = Math.min(1, Math.max(0, (hz - MIN_HZ) / (MAX_HZ - MIN_HZ)));
    } else {
      this.feed.pitchRef.current *= 0.92;
    }

    // Spectral bands — what makes different sounds move different parts of
    // the blob. Loudness alone cannot tell "sss" from "ooh"; the spectrum can.
    this.freq.getByteFrequencyData(this.fbuf);
    const bands = this.feed.bandsRef.current;
    for (let i = 0; i < BAND_COUNT; i++) {
      const [b0, b1] = this.edges[i];
      let peak = 0;
      for (let b = b0; b < b1 && b < this.fbuf.length; b++) if (this.fbuf[b] > peak) peak = this.fbuf[b];
      let v = peak / 255;
      // Spectral tilt. Speech carries far more energy low than high, so
      // without lifting the upper bands the top of the blob would almost
      // never move — sibilants and fricatives would be invisible.
      v *= 0.85 + (i / (BAND_COUNT - 1)) * 0.9;
      // Gate then curve: room tone stays still, real syllables pop.
      v = Math.max(0, v - 0.14) / 0.86;
      v = Math.min(1, v * v * 1.7);
      // Fast attack, slow release, per band — so a region blooms on the sound
      // that excites it and relaxes on its own time afterwards.
      const cur = bands[i];
      bands[i] = cur + (v - cur) * (v > cur ? 0.5 : 0.1);
    }

    return { rms, level, hz };
  }

  /** Zero the feed, e.g. when the source goes quiet for good. */
  reset() {
    this.feed.levelRef.current = 0;
    this.feed.pitchRef.current = 0;
    this.feed.bandsRef.current.fill(0);
  }

  dispose() {
    this.time.disconnect();
    this.freq.disconnect();
    this.sink.disconnect();
    this.reset();
  }
}
