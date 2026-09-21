import { VoiceAnalyser, type AudioFeed } from "./analysis";

/**
 * Plays Talk's voice as it streams in.
 *
 * Chunks of raw PCM arrive over the network every ~0.2s and are scheduled
 * back to back on the audio clock, so playback is gapless even though the
 * reply is still being synthesised. Everything passes through a VoiceAnalyser
 * so the blob reacts to Talk exactly the way it reacts to the user.
 *
 * Plays in the microphone's own AudioContext. That context was created inside
 * the user's click, so it is allowed to make sound — a second context created
 * later, after a network round trip, is not on Safari.
 */

/**
 * How far ahead of "now" the first chunk is scheduled. Absorbs network jitter
 * between chunks; small enough not to be heard as a delay.
 */
const LEAD = 0.15;

export class StreamPlayer {
  private readonly out: GainNode;
  private readonly analyser: VoiceAnalyser;
  private sources = new Set<AudioBufferSourceNode>();
  private nextTime = 0;
  private ended = false;
  private started = false;
  private onDone: (() => void) | null = null;

  constructor(private readonly ctx: AudioContext) {
    this.out = ctx.createGain();
    this.out.connect(ctx.destination);
    this.analyser = new VoiceAnalyser(ctx, this.out);
  }

  get feed(): AudioFeed {
    return this.analyser.feed;
  }

  /** Call once per animation frame while speaking, to move the blob. */
  analyse() {
    this.analyser.update();
  }

  get playing() {
    return this.started && (this.sources.size > 0 || !this.ended);
  }

  /** Begin a new utterance. `onDone` fires once it has finished playing. */
  begin(onDone: () => void) {
    this.stop();
    this.ended = false;
    this.started = false;
    this.onDone = onDone;
  }

  push(pcmBase64: string, sampleRate: number) {
    const bin = atob(pcmBase64);
    const n = bin.length >> 1;
    if (!n) return;
    const data = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const lo = bin.charCodeAt(i * 2);
      const hi = bin.charCodeAt(i * 2 + 1);
      let v = (hi << 8) | lo;
      if (v >= 0x8000) v -= 0x10000;
      data[i] = v / 0x8000;
    }

    // AudioBuffer takes the source rate and the context resamples on play.
    const buffer = this.ctx.createBuffer(1, n, sampleRate);
    buffer.copyToChannel(data, 0);

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.out);

    const now = this.ctx.currentTime;
    // First chunk, or the stream fell behind playback (a network stall):
    // restart the schedule a little ahead of now rather than in the past.
    if (!this.started || this.nextTime < now) this.nextTime = now + LEAD;
    src.start(this.nextTime);
    this.nextTime += buffer.duration;
    this.started = true;

    this.sources.add(src);
    src.onended = () => {
      this.sources.delete(src);
      this.check();
    };
  }

  /** No more chunks are coming for this utterance. */
  end() {
    this.ended = true;
    this.check();
  }

  /** Silence now — the user interrupted, or the session ended. */
  stop() {
    for (const s of this.sources) {
      s.onended = null;
      try {
        s.stop();
      } catch {}
      s.disconnect();
    }
    this.sources.clear();
    this.onDone = null;
    this.ended = true;
    this.started = false;
    this.analyser.reset();
  }

  dispose() {
    this.stop();
    this.analyser.dispose();
    this.out.disconnect();
  }

  private check() {
    if (this.ended && this.sources.size === 0) {
      const done = this.onDone;
      this.onDone = null;
      this.started = false;
      this.analyser.reset();
      done?.();
    }
  }
}
