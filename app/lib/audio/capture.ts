/**
 * Turns the open microphone into discrete utterances.
 *
 * An AudioWorklet taps raw PCM off the same source node the blob analyses
 * (one microphone, never two). A small voice-activity detector decides when
 * someone has started and finished speaking; each finished utterance is
 * encoded as 16kHz mono 16-bit WAV — the format gemini-3.8-flash is verified
 * to transcribe (scripts/probe-models.mjs) — and handed to `onUtterance`.
 *
 * WHY NOT MediaRecorder: it cannot pre-roll. It starts recording when told
 * to, and speech detection always fires a beat after the first syllable, so
 * every utterance would lose its first word. The worklet keeps a rolling half
 * second of audio from before speech was detected and prepends it.
 */

const WORKLET = `
class TalkCapture extends AudioWorkletProcessor {
  constructor() { super(); this.size = 2048; this.buf = new Float32Array(this.size); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i];
        if (this.n === this.size) {
          this.port.postMessage(this.buf, [this.buf.buffer]);
          this.buf = new Float32Array(this.size);
          this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("talk-capture", TalkCapture);
`;

/** Tuning, in seconds unless noted. */
const PRE_ROLL = 0.5;
/**
 * Silence that ends an utterance. Long on purpose: people talking about hard
 * things pause mid-thought, and cutting them off to answer is worse than a
 * slightly slower reply.
 */
const HANG = 1.2;
/** Speech shorter than this is a cough, a click, a door — not a turn. */
const MIN_SPEECH = 0.35;
/** A single turn cannot run longer than this. */
const MAX_UTTERANCE = 45;
/**
 * Speech starts when this many of the last START_WINDOW chunks (~43ms each)
 * are loud. Not "consecutive": soft speech dips between syllables, and a
 * consecutive rule missed a quiet speaker's whole first sentence in testing.
 */
const START_CHUNKS = 3;
const START_WINDOW = 5;
/**
 * Absolute floors for the thresholds. Low on purpose — the people most likely
 * to speak quietly are the people this is for. A noisy room raises the bar
 * through the adaptive estimate instead.
 */
const MIN_START_RMS = 0.008;
const MIN_KEEP_RMS = 0.005;
const TARGET_RATE = 16000;

export type CaptureEvents = {
  /** Speech detected — the user has started talking. */
  onSpeechStart?: () => void;
  /** A finished utterance, as base64 WAV (16kHz mono 16-bit). */
  onUtterance: (wavBase64: string, seconds: number) => void;
};

export class UtteranceCapture {
  private node: AudioWorkletNode | null = null;
  private sink: GainNode | null = null;
  private enabled = false;

  private preRoll: Float32Array[] = [];
  private preRollSamples = 0;
  private chunks: Float32Array[] = [];
  private samples = 0;
  private speaking = false;
  private recent: boolean[] = [];
  private speechSamples = 0;
  private silentSamples = 0;
  /** Adaptive room-noise estimate, so a fan or a street does not count as speech. */
  private floor = 0.004;

  private constructor(
    private readonly ctx: AudioContext,
    private readonly events: CaptureEvents,
  ) {}

  static async attach(ctx: AudioContext, source: AudioNode, events: CaptureEvents): Promise<UtteranceCapture> {
    const capture = new UtteranceCapture(ctx, events);
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const node = new AudioWorkletNode(ctx, "talk-capture", { numberOfInputs: 1, numberOfOutputs: 1 });
    node.port.onmessage = (e: MessageEvent<Float32Array>) => capture.chunk(e.data);
    // Pulled through a silent sink, or the browser may never run the worklet.
    const sink = ctx.createGain();
    sink.gain.value = 0;
    source.connect(node);
    node.connect(sink);
    sink.connect(ctx.destination);
    capture.node = node;
    capture.sink = sink;
    return capture;
  }

  /**
   * Listening on or off. Off while Talk is thinking or speaking: the
   * conversation is turn-based, and a microphone that stays hot while Talk
   * talks will sooner or later transcribe Talk.
   */
  setEnabled(on: boolean) {
    if (on === this.enabled) return;
    this.enabled = on;
    this.reset();
  }

  /** Force the current utterance to finish now (e.g. a "done talking" tap). */
  flush() {
    if (this.speaking) this.finish();
  }

  get isSpeaking() {
    return this.speaking;
  }

  dispose() {
    this.enabled = false;
    if (this.node) this.node.port.onmessage = null;
    this.node?.disconnect();
    this.sink?.disconnect();
    this.node = null;
    this.sink = null;
    this.reset();
  }

  private reset() {
    this.preRoll = [];
    this.preRollSamples = 0;
    this.chunks = [];
    this.samples = 0;
    this.speaking = false;
    this.recent = [];
    this.speechSamples = 0;
    this.silentSamples = 0;
  }

  private chunk(data: Float32Array) {
    if (!this.enabled) return;
    const rate = this.ctx.sampleRate;

    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    const rms = Math.sqrt(sum / data.length);

    // Thresholds ride above the room: speech must clearly beat the noise
    // floor to start, and only has to stay a little above it to continue.
    const startAt = Math.max(MIN_START_RMS, this.floor * 3.5);
    const keepAt = Math.max(MIN_KEEP_RMS, this.floor * 2.2);

    if (!this.speaking) {
      // Learn the room only from audio that is not speech.
      if (rms < startAt) this.floor = this.floor * 0.97 + rms * 0.03;

      this.preRoll.push(data);
      this.preRollSamples += data.length;
      while (this.preRollSamples - this.preRoll[0].length > PRE_ROLL * rate) {
        this.preRollSamples -= this.preRoll.shift()!.length;
      }

      this.recent.push(rms > startAt);
      if (this.recent.length > START_WINDOW) this.recent.shift();
      const loud = this.recent.filter(Boolean).length;
      if (loud >= START_CHUNKS) {
        this.speaking = true;
        this.chunks = this.preRoll;
        this.samples = this.preRollSamples;
        this.speechSamples = loud * data.length;
        this.silentSamples = 0;
        this.preRoll = [];
        this.preRollSamples = 0;
        this.events.onSpeechStart?.();
      }
      return;
    }

    this.chunks.push(data);
    this.samples += data.length;
    if (rms > keepAt) {
      this.speechSamples += data.length;
      this.silentSamples = 0;
    } else {
      this.silentSamples += data.length;
    }

    if (this.silentSamples >= HANG * rate || this.samples >= MAX_UTTERANCE * rate) this.finish();
  }

  private finish() {
    const rate = this.ctx.sampleRate;
    const chunks = this.chunks;
    const total = this.samples;
    const speech = this.speechSamples;
    // Trim most of the trailing silence — it is only upload size and latency —
    // but keep a little so the last word is not clipped.
    const trailing = Math.max(0, this.silentSamples - Math.round(0.25 * rate));
    this.reset();
    if (speech < MIN_SPEECH * rate) return;

    const length = total - trailing;
    const pcm = new Float32Array(length);
    let offset = 0;
    for (const c of chunks) {
      if (offset >= length) break;
      const n = Math.min(c.length, length - offset);
      pcm.set(c.subarray(0, n), offset);
      offset += n;
    }
    this.events.onUtterance(encodeWav(downsample(pcm, rate, TARGET_RATE), TARGET_RATE), length / rate);
  }
}

/** Box-filter decimation — plenty for speech recognition at 16kHz. */
function downsample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

function encodeWav(samples: Float32Array, rate: number): string {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytesToBase64(bytes);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}
