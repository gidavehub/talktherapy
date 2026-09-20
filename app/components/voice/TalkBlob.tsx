"use client";

import { useEffect, useRef } from "react";

/**
 * Talk's voice blob — a GPU particle field that reacts to sound.
 *
 * The physics is ported from the particle engine in `general/animations`
 * (`src/30-gl.js`, `FS_SIM`): position and velocity live in floating-point
 * textures, a fragment shader integrates them, and the result ping-pongs
 * between two framebuffers. Each particle springs toward a target, is carried
 * sideways by divergence-free curl noise, and is damped exponentially.
 *
 * What is deliberately NOT ported: the bone rig, the authored scene morphs and
 * the baked target textures. Those exist to turn the field into a person or a
 * globe. A blob only needs one shape, so the target is derived from each
 * particle's seed — a stable point on a sphere — which removes two textures
 * and the whole bake step.
 *
 * CONTROLLED COMPONENT, ON PURPOSE. It does not touch the microphone. The
 * companion needs that same stream for Gemini, and two getUserMedia calls
 * compete — on mobile Safari the second one can fail outright. One owner
 * acquires the audio and feeds both this and the engine. See
 * `app/lib/audio/useAudioLevel.ts`.
 */

export type BlobState = "idle" | "listening" | "thinking" | "speaking";

type Props = {
  state?: BlobState;
  /** Audio amplitude, 0..1. Ignored when state is "idle" or "thinking". */
  level?: number;
  /** Fundamental frequency across the speech range, 0..1. 0 means unvoiced. */
  pitch?: number;
  /** CSS size in px. The canvas is rendered at devicePixelRatio above this. */
  size?: number;
  className?: string;
};

// ---------------------------------------------------------------- shaders

const VS_FULLSCREEN = `#version 300 es
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * Simplex noise and curl, lifted verbatim from the source engine.
 * curl(n*a) == grad(n) x a, so the field cannot compress — it only swirls,
 * which is what makes it read as wind rather than as scatter.
 */
const NOISE_GLSL = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))
        +i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
vec3 gradN(vec3 p, float e){
  float n = snoise(p);
  return vec3(snoise(p+vec3(e,0.0,0.0)) - n,
              snoise(p+vec3(0.0,e,0.0)) - n,
              snoise(p+vec3(0.0,0.0,e)) - n) / e;
}
vec3 curlNoise(vec3 p){
  vec3 g1 = gradN(p, 0.14);
  vec3 g2 = gradN(p * 2.15 + 31.7, 0.14);
  return cross(g1, vec3(0.0, 0.0, 1.0)) * 0.62
       + cross(g2, vec3(0.42, 0.78, 0.46)) * 0.34;
}
/* A stable unit vector per particle. The target shape is computed rather
   than baked, so there is no target texture and no bake step. */
vec3 sphereDir(float seed){
  float a = fract(seed * 127.1) * 6.2831853;
  float z = fract(seed * 311.7) * 2.0 - 1.0;
  float r = sqrt(max(0.0, 1.0 - z * z));
  return vec3(cos(a) * r, sin(a) * r, z);
}`;

const FS_SIM = `#version 300 es
precision highp float; precision highp sampler2D;
uniform sampler2D uPos, uVel;
uniform float uDt, uTime, uSpring, uDamp, uFlow, uNoiseScale;
uniform float uJitter, uBurst, uRadius, uDeform, uSwirl, uPitch;
layout(location=0) out vec4 outPos;
layout(location=1) out vec4 outVel;
${NOISE_GLSL}
void main(){
  ivec2 uv = ivec2(gl_FragCoord.xy);
  vec4 P = texelFetch(uPos, uv, 0);
  vec4 V = texelFetch(uVel, uv, 0);
  float seed = P.w;

  vec3 dir = sphereDir(seed);

  /* The shell breathes and dents. A slow noise over the sphere makes whole
     regions swell while their neighbours hold, which is what stops it
     reading as a perfect ball. uDeform is driven by the voice. */
  /* Pitch sets the SPATIAL FREQUENCY of the denting: a low voice makes a few
     broad lobes, a high one makes many fine ripples. Amplitude changes how
     far the shell moves; pitch changes what shape it moves into, so the two
     are legible independently rather than both reading as "louder". */
  float scale = uNoiseScale * mix(1.0, 3.4, uPitch);
  float wob = snoise(dir * scale + vec3(0.0, 0.0, uTime * (0.45 + uPitch * 1.1)));
  float shell = uRadius * (1.0 + wob * uDeform);

  /* Depth in the shell, so the cloud has thickness instead of being a
     soap bubble one particle deep. */
  float depth = mix(0.72, 1.0, fract(seed * 53.13));
  vec3 tgt = dir * shell * depth;

  /* Wind. Same divergence-free flow as the source engine, stretched a
     little on Y so the field drifts upward rather than churning evenly. */
  vec3 np = tgt * 0.006 + vec3(uTime * 0.09, uTime * -0.06, uTime * 0.11);
  /* A perturbation of the shell, NOT a replacement for it: once this
     term approaches uRadius the sphere smears into a filled cube and
     stops reading as a blob at all. */
  tgt += curlNoise(np) * uFlow * vec3(1.0, 1.15, 1.0);

  /* Radial kick on a loud syllable — the thing that makes it feel alive. */
  tgt += dir * uBurst * (0.45 + fract(seed * 13.71));

  vec3 pos = P.xyz, vel = V.xyz;

  vec3 f = (tgt - pos) * uSpring;

  /* Never fully still: a slow breathing drift keeps the field alive even
     in silence. Straight from the original. */
  f += vec3(sin(uTime * 1.17 + pos.y * 0.011 + seed * 6.28),
            cos(uTime * 0.93 + pos.x * 0.013 + seed * 4.71),
            sin(uTime * 0.71 + pos.z * 0.021)) * uJitter;

  /* A gentle rotation about Y so the mass turns while it listens. */
  f += vec3(-pos.z, 0.0, pos.x) * uSwirl;

  vel += f * uDt;
  vel *= exp(-uDamp * uDt);

  /* Hard rails: a stray force must never be able to poison the buffer. */
  vel = clamp(vel, vec3(-4000.0), vec3(4000.0));
  pos = clamp(pos + vel * uDt, vec3(-4000.0), vec3(4000.0));
  if (any(isnan(pos)) || any(isnan(vel))) { pos = tgt; vel = vec3(0.0); }

  outPos = vec4(pos, seed);
  outVel = vec4(vel, 0.0);
}`;

const VS_PARTICLE = `#version 300 es
precision highp float; precision highp sampler2D;
uniform sampler2D uPos, uVel;
uniform vec2 uTexSize, uRes;
uniform float uFocal, uPointScale, uStretch, uAlpha, uSpin, uPitch;
uniform vec3 uColA, uColB, uColHot;
out vec2 vUv;
out vec4 vCol;
void main(){
  int id = gl_InstanceID;
  ivec2 tx = ivec2(id % int(uTexSize.x), id / int(uTexSize.x));
  vec4 P = texelFetch(uPos, tx, 0);
  vec4 V = texelFetch(uVel, tx, 0);

  /* Slow turntable, so the silhouette keeps changing without the physics
     having to do anything. */
  float c = cos(uSpin), s = sin(uSpin);
  vec3 p = vec3(P.x * c - P.z * s, P.y, P.x * s + P.z * c);
  vec3 v = vec3(V.x * c - V.z * s, V.y, V.x * s + V.z * c);

  float w = uFocal / max(40.0, uFocal + p.z);
  vec2 sp = p.xy * w + uRes * 0.5;

  float px = uPointScale * w;

  /* Stretch along screen-space velocity — cheap, convincing motion blur. */
  vec2 sv = v.xy * w;
  float svl = length(sv);
  vec2 dirv = svl > 1e-3 ? sv / svl : vec2(1.0, 0.0);
  float stretch = 1.0 + min(uStretch * svl, 3.0);

  vec2 corner = vec2((gl_VertexID == 0 || gl_VertexID == 3 || gl_VertexID == 5) ? -1.0 : 1.0,
                     (gl_VertexID == 0 || gl_VertexID == 1 || gl_VertexID == 3) ? -1.0 : 1.0);
  vUv = corner;
  vec2 off = (corner.x * dirv * stretch + corner.y * vec2(-dirv.y, dirv.x)) * px;
  vec2 clip = (sp + off) / uRes * 2.0 - 1.0;
  gl_Position = vec4(clip, 0.0, 1.0);

  /* Fast particles run hot — the same speed-to-white cue the source uses. */
  float heat = clamp(length(V.xyz) / 420.0, 0.0, 1.0);
  vec3 col = mix(uColA, uColB, clamp(p.z * 0.004 + 0.5, 0.0, 1.0));
  col = mix(col, uColHot, heat * 0.85);
  /* A higher voice reads brighter, so pitch is visible even when the shape
     change is subtle. */
  col = mix(col, uColHot, uPitch * 0.45);

  /* Energy is conserved as the sprite smears, so a stretched one dims. */
  float a = uAlpha / max(stretch, 1.0);
  a *= mix(1.0, 1.6, heat);
  /* The far half is dimmer than the near half: cheapest depth cue there is. */
  a *= mix(1.0, 0.45, smoothstep(-120.0, 160.0, p.z));

  vCol = vec4(col, a);
}`;

const FS_PARTICLE = `#version 300 es
precision highp float;
in vec2 vUv; in vec4 vCol;
out vec4 frag;
void main(){
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  float body = pow(1.0 - r2, 1.85);
  float core = pow(1.0 - r2, 9.0);
  float a = (body + core * 0.85) * vCol.a;
  /* Premultiplied, because the blend is additive. */
  frag = vec4(vCol.rgb * a, a);
}`;

// ------------------------------------------------------------- parameters

/**
 * Per-state physics. These are the whole personality of the thing.
 *
 *  idle      — barely moving, a slow breath
 *  listening — loose and reactive, opens up on the voice
 *  thinking  — tight, fast swirl, no audio input
 *  speaking  — firm shell that pulses with the output
 */
const PRESETS: Record<
  BlobState,
  { spring: number; damp: number; flow: number; jitter: number; deform: number; swirl: number; burst: number; alpha: number }
> = {
  idle:      { spring: 7.0, damp: 5.0, flow: 1.8, jitter: 4, deform: 0.10, swirl: 0.10, burst: 0,  alpha: 0.26 },
  listening: { spring: 9.0, damp: 5.2, flow: 2.0, jitter: 6, deform: 0.12, swirl: 0.16, burst: 26, alpha: 0.34 },
  thinking:  { spring: 11.0, damp: 6.0, flow: 3.2, jitter: 4, deform: 0.13, swirl: 0.62, burst: 0, alpha: 0.32 },
  speaking:  { spring: 10.0, damp: 5.0, flow: 2.0, jitter: 5, deform: 0.14, swirl: 0.22, burst: 30, alpha: 0.40 },
};

const ACCENT = [1.0, 0.353, 0.122]; // #FF5A1F
const ACCENT_SOFT = [1.0, 0.478, 0.271]; // #FF7A45
const HOT = [1.0, 0.94, 0.86];

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("could not create shader");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`shader compile failed: ${log}`);
  }
  return sh;
}

function program(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const p = gl.createProgram();
  if (!p) throw new Error("could not create program");
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error(`program link failed: ${log}`);
  }
  return p;
}

export default function TalkBlob({
  state = "idle",
  level = 0,
  pitch = 0,
  size = 320,
  className = "",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Props are mirrored into refs so the render loop reads the latest value
  // without the effect re-running — re-running it would rebuild every GL
  // resource on each prop change, which for a 60fps `level` means rebuilding
  // the particle buffers 60 times a second.
  //
  // Mirrored in an effect rather than during render: writing a ref while
  // rendering is not safe under concurrent rendering, where a render can be
  // thrown away or replayed. One commit of lag is irrelevant to an animation
  // that smooths its input anyway.
  const stateRef = useRef(state);
  const levelRef = useRef(level);
  const pitchRef = useRef(pitch);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    levelRef.current = level;
  }, [level]);

  useEffect(() => {
    pitchRef.current = pitch;
  }, [pitch]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Respect the OS setting. A dense animated field is a genuine vestibular
    // problem for some people, and this one is large and central.
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      powerPreference: "low-power",
    });
    // No WebGL2, or no float render targets: the caller shows its fallback.
    if (!gl || !gl.getExtension("EXT_color_buffer_float")) return;

    // Fewer particles on a phone. This runs on mid-range Android over a
    // mobile network as the default case, not the exception.
    const small = window.innerWidth < 768;
    const TEX = small ? 96 : 160; // 9,216 or 25,600 particles
    const COUNT = TEX * TEX;

    const dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);

    let simProg: WebGLProgram | null = null;
    let drawProg: WebGLProgram | null = null;
    try {
      simProg = program(gl, VS_FULLSCREEN, FS_SIM);
      drawProg = program(gl, VS_PARTICLE, FS_PARTICLE);
    } catch (e) {
      if (process.env.NODE_ENV !== "production") console.error("[TalkBlob]", e);
      return;
    }

    // --- particle state textures -----------------------------------------
    const pos = new Float32Array(COUNT * 4);
    const vel = new Float32Array(COUNT * 4);
    for (let i = 0; i < COUNT; i++) {
      // Start scattered well outside the shell so the first seconds are the
      // field gathering itself, rather than a ball simply appearing.
      const a = Math.random() * Math.PI * 2;
      const z = Math.random() * 2 - 1;
      const r = Math.sqrt(1 - z * z);
      // Scattered just outside the shell. Far enough that the opening reads as
      // the field gathering itself, close enough that it is formed in a few
      // hundred milliseconds — a blob that takes seconds to appear looks
      // broken, not dramatic. Relative to `size` so the intro does not get
      // longer on a bigger canvas.
      const d = size * (0.22 + Math.random() * 0.2);
      pos[i * 4 + 0] = Math.cos(a) * r * d;
      pos[i * 4 + 1] = Math.sin(a) * r * d;
      pos[i * 4 + 2] = z * d;
      pos[i * 4 + 3] = Math.random(); // seed
    }

    function stateTexture(data: Float32Array) {
      const t = gl!.createTexture();
      gl!.bindTexture(gl!.TEXTURE_2D, t);
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA32F, TEX, TEX, 0, gl!.RGBA, gl!.FLOAT, data);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.NEAREST);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.NEAREST);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
      return t;
    }

    let posA = stateTexture(pos);
    let velA = stateTexture(vel);
    let posB = stateTexture(pos);
    let velB = stateTexture(vel);

    function fbo(p: WebGLTexture | null, v: WebGLTexture | null) {
      const f = gl!.createFramebuffer();
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, f);
      gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, p, 0);
      gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT1, gl!.TEXTURE_2D, v, 0);
      gl!.drawBuffers([gl!.COLOR_ATTACHMENT0, gl!.COLOR_ATTACHMENT1]);
      return f;
    }
    let fboA = fbo(posA, velA);
    let fboB = fbo(posB, velB);

    const uSim = (n: string) => gl.getUniformLocation(simProg!, n);
    const uDraw = (n: string) => gl.getUniformLocation(drawProg!, n);

    let raf = 0;
    let last = performance.now();
    let time = 0;
    let spin = 0;
    // Smoothed level. Raw amplitude is jittery enough to make the blob
    // twitch; the asymmetric rise/fall makes it snap open on a syllable and
    // settle gently afterwards, which is what reads as "voice".
    let smooth = 0;
    let smoothPitch = 0;
    let voiced = 0;
    let disposed = false;

    function frame(now: number) {
      if (disposed) return;
      raf = requestAnimationFrame(frame);
      const dtRaw = (now - last) / 1000;
      last = now;
      // Clamp BOTH ends. The upper bound stops a backgrounded tab returning a
      // huge dt and exploding the spring. The lower bound matters too: any
      // path that hands the loop a timestamp older than the last one — a
      // non-monotonic clock, or a test harness driving frames by hand —
      // produces a negative dt, which integrates the simulation backwards and
      // diverges. Math.min alone silently allows that.
      const dt = Math.max(0, Math.min(dtRaw, 1 / 30));
      time += dt;

      const p = PRESETS[stateRef.current];
      const silent = stateRef.current === "idle" || stateRef.current === "thinking";
      const target = silent ? 0 : Math.min(1, Math.max(0, levelRef.current));
      // Asymmetric on purpose: snap open on a syllable, settle slowly after.
      // Symmetric smoothing makes speech read as a vague pulsing.
      smooth += (target - smooth) * (target > smooth ? 0.55 : 0.09);

      const pitchTarget = silent ? 0 : Math.min(1, Math.max(0, pitchRef.current));
      smoothPitch += (pitchTarget - smoothPitch) * 0.25;
      voiced = smoothPitch;

      spin += dt * (0.12 + smooth * 0.9);

      const g = gl!;

      // ---- simulate ----
      // Blending MUST be off here. The draw pass below enables additive
      // blending, and GL state is global — leaving it on means the sim's
      // output is ADDED to whatever the target texture already held rather
      // than replacing it. With ping-pong that produces x[n] = f(x[n-1]) +
      // x[n-2]: a Fibonacci recurrence whose ratio converges on the golden
      // ratio, which is exactly how this presented — every value, including
      // the supposedly-copied particle seed, growing by 1.618x per frame.
      g.disable(g.BLEND);
      g.bindFramebuffer(g.FRAMEBUFFER, fboB);
      g.viewport(0, 0, TEX, TEX);
      g.useProgram(simProg);
      g.activeTexture(g.TEXTURE0);
      g.bindTexture(g.TEXTURE_2D, posA);
      g.uniform1i(uSim("uPos"), 0);
      g.activeTexture(g.TEXTURE1);
      g.bindTexture(g.TEXTURE_2D, velA);
      g.uniform1i(uSim("uVel"), 1);
      g.uniform1f(uSim("uDt"), reduced ? dt * 0.35 : dt);
      g.uniform1f(uSim("uTime"), time);
      g.uniform1f(uSim("uSpring"), p.spring);
      g.uniform1f(uSim("uDamp"), p.damp);
      // Every audio-driven term below is sized against the SHELL RADIUS rather
      // than in absolute units, so the reaction is the same proportion of the
      // blob at any component size. The budget matters: radius + curl + burst
      // is magnified up to ~1.5x by the perspective divide, and once that
      // exceeds half the canvas the sphere crops into a square.
      g.uniform1f(uSim("uFlow"), p.flow * (1 + smooth * 1.6));
      g.uniform1f(uSim("uNoiseScale"), 0.009);
      g.uniform1f(uSim("uJitter"), reduced ? p.jitter * 0.3 : p.jitter);
      // Cubed: quiet room tone barely registers, a spoken syllable kicks hard.
      // Linear here made normal speech look like a gentle wobble.
      g.uniform1f(uSim("uBurst"), (size / 340) * p.burst * smooth * smooth * smooth);
      // Sized so the outermost particles land inside the canvas: near ones
      // are magnified ~1.5x by the perspective divide and the curl noise
      // pushes another ~40% beyond the shell, so the base radius has to be
      // well under half the canvas or the sphere crops to a square.
      g.uniform1f(uSim("uRadius"), size * 0.135 + smooth * size * 0.075);
      g.uniform1f(uSim("uDeform"), p.deform + smooth * 0.55);
      g.uniform1f(uSim("uSwirl"), reduced ? 0 : p.swirl * (1 + smooth * 1.8));
      g.uniform1f(uSim("uPitch"), voiced);
      g.bindVertexArray(null);
      g.drawArrays(g.TRIANGLES, 0, 3);

      // ping-pong
      [posA, posB] = [posB, posA];
      [velA, velB] = [velB, velA];
      [fboA, fboB] = [fboB, fboA];

      // ---- draw ----
      g.bindFramebuffer(g.FRAMEBUFFER, null);
      g.viewport(0, 0, canvas!.width, canvas!.height);
      g.clearColor(0, 0, 0, 0);
      g.clear(g.COLOR_BUFFER_BIT);
      g.enable(g.BLEND);
      // Additive, premultiplied: overlapping particles build to the hot core
      // instead of averaging to mud.
      g.blendFunc(g.ONE, g.ONE);

      g.useProgram(drawProg);
      g.activeTexture(g.TEXTURE0);
      g.bindTexture(g.TEXTURE_2D, posA);
      g.uniform1i(uDraw("uPos"), 0);
      g.activeTexture(g.TEXTURE1);
      g.bindTexture(g.TEXTURE_2D, velA);
      g.uniform1i(uDraw("uVel"), 1);
      g.uniform2f(uDraw("uTexSize"), TEX, TEX);
      g.uniform2f(uDraw("uRes"), canvas!.width, canvas!.height);
      g.uniform1f(uDraw("uFocal"), 520);
      g.uniform1f(uDraw("uPointScale"), 1.8 * dpr);
      g.uniform1f(uDraw("uStretch"), 0.05);
      g.uniform1f(uDraw("uAlpha"), p.alpha);
      g.uniform1f(uDraw("uSpin"), spin);
      g.uniform1f(uDraw("uPitch"), voiced);
      g.uniform3fv(uDraw("uColA"), ACCENT);
      g.uniform3fv(uDraw("uColB"), ACCENT_SOFT);
      g.uniform3fv(uDraw("uColHot"), HOT);
      // Default VAO rather than the empty one — attributeless instanced draws
      // are legal either way, but this removes a variable while diagnosing.
      g.bindVertexArray(null);
      g.drawArraysInstanced(g.TRIANGLES, 0, 6, COUNT);
    }

    raf = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      // Free GPU memory explicitly. These are multi-megabyte float textures;
      // relying on GC to collect them leaks across route changes.
      gl.deleteProgram(simProg);
      gl.deleteProgram(drawProg);
      gl.deleteTexture(posA);
      gl.deleteTexture(posB);
      gl.deleteTexture(velA);
      gl.deleteTexture(velB);
      gl.deleteFramebuffer(fboA);
      gl.deleteFramebuffer(fboB);
      // NOT loseContext(). It kills the context permanently for this canvas,
      // and getContext() afterwards hands back the same dead one — so the
      // component is blank after any remount, including StrictMode's
      // mount/unmount/mount in development. Deleting the resources above
      // already releases the GPU memory that mattered.
    };
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`block ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
