"use client";

import { useEffect, useRef } from "react";
import { BAND_COUNT, type AudioFeed } from "../../lib/audio/useAudioLevel";

/**
 * Talk's voice blob — a GPU particle field that reacts to sound.
 *
 * The physics is ported from the particle engine in `general/animations`
 * (`src/30-gl.js`, `FS_SIM`): position and velocity live in floating-point
 * textures, a fragment shader integrates them, and the result ping-pongs
 * between two framebuffers. Each particle springs toward a target, is carried
 * sideways by divergence-free curl noise, and is damped exponentially.
 *
 * WHAT MAKES IT FEEL ALIVE
 *
 * The voice is split into BAND_COUNT frequency bands, and the sphere carries
 * the same number of soft "sensitive patches" laid out on a golden-angle
 * spiral — lowest frequencies at the bottom, highest at the top. Each patch
 * swells and reaches outward on its own band. Different words have different
 * spectra ("sss" is high, "ooh" is low), so different parts of the blob move
 * for different sounds rather than the whole thing pulsing on loudness.
 *
 * Outer particles spring softer than inner ones, so they trail behind the
 * motion — tendrils rather than a hard edge. And every patch breathes on its
 * own phase in silence, so it never sits dead.
 *
 * CONTROLLED COMPONENT. It never touches the microphone: the companion needs
 * that same stream for Gemini, and two getUserMedia calls compete. Audio
 * arrives through `feed` (refs, read every frame) or the `level`/`pitch`
 * props as a fallback.
 */

export type BlobState = "idle" | "listening" | "thinking" | "speaking";

type Props = {
  state?: BlobState;
  /** Fallback amplitude, 0..1, used when no `feed` is supplied. */
  level?: number;
  /** Fallback pitch, 0..1, used when no `feed` is supplied. */
  pitch?: number;
  /**
   * Per-frame audio as refs. Preferred over the props: read inside the render
   * loop at full frame rate, with no React re-render involved.
   */
  feed?: AudioFeed | null;
  /** Maximum CSS size in px. The canvas fills its container up to this. */
  size?: number;
  className?: string;
};

// ---------------------------------------------------------------- shaders

const VS_FULLSCREEN = `#version 300 es
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** Simplex noise and curl, verbatim from the source engine. */
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
#define BANDS ${BAND_COUNT}
uniform sampler2D uPos, uVel;
uniform float uDt, uTime, uSpring, uDamp, uFlow, uNoiseScale;
uniform float uJitter, uBurst, uRadius, uDeform, uSwirl, uPitch;
uniform float uBands[BANDS];
uniform float uBandGain, uSharp, uIdle;
layout(location=0) out vec4 outPos;
layout(location=1) out vec4 outVel;
${NOISE_GLSL}

/* Where band i listens on the sphere. A golden-angle spiral from the bottom
   pole to the top: evenly spread with no visible stripes, and ordered so the
   lowest frequencies sit at the bottom and sibilance lives at the top. The
   spiral drifts slowly so the patches migrate rather than sitting fixed. */
vec3 bandCenter(int i){
  float k = float(i) + 0.5;
  float y = -0.92 + 1.84 * k / float(BANDS);
  float r = sqrt(max(0.0, 1.0 - y * y));
  float phi = k * 2.39996323 + uTime * 0.07;
  return vec3(cos(phi) * r, y, sin(phi) * r);
}

void main(){
  ivec2 uv = ivec2(gl_FragCoord.xy);
  vec4 P = texelFetch(uPos, uv, 0);
  vec4 V = texelFetch(uVel, uv, 0);
  float seed = P.w;
  vec3 dir = sphereDir(seed);

  /* Depth biased toward the surface with a wide spread: a thick, airy shell
     with room between particles, not a packed ball. The sqrt pushes most of
     the population outward while leaving a sparse interior. */
  float depth = mix(0.36, 1.0, sqrt(fract(seed * 53.13)));
  float outer = smoothstep(0.6, 1.0, depth);

  /* How strongly this particle's region is being spoken to. Each band excites
     a soft patch around its centre; overlapping patches blend, so the
     response flows across the surface instead of switching tile by tile. */
  float resp = 0.0;
  for (int i = 0; i < BANDS; i++) {
    vec3 c = bandCenter(i);
    float w = exp(-(1.0 - dot(dir, c)) * uSharp);
    /* Each patch breathes on its own phase in silence, so the whole thing
       reads as an organism at rest rather than an object switched off. */
    float breath = uIdle * 0.10 * (0.5 + 0.5 * sin(uTime * 0.8 + float(i) * 1.7));
    resp += w * (uBands[i] + breath);
  }
  resp = min(resp, 1.1);

  /* Pitch sets the spatial frequency of the denting: a low voice makes broad
     lobes, a high one fine ripples. */
  float scale = uNoiseScale * mix(1.0, 3.4, uPitch);
  float wob = snoise(dir * scale + vec3(0.0, 0.0, uTime * (0.45 + uPitch * 1.1)));
  float shell = uRadius * (1.0 + wob * uDeform);

  /* The active region reaches out. Outer particles reach furthest, so a
     spoken-to patch grows tendrils rather than just bulging. */
  float reach = resp * uRadius * uBandGain * (0.5 + outer);
  vec3 tgt = dir * (shell * depth + reach);

  /* Wind, stirred harder wherever the voice is landing. A perturbation of the
     shell, never a replacement — past about uRadius it smears into a cube. */
  vec3 np = tgt * 0.006 + vec3(uTime * 0.09, uTime * -0.06, uTime * 0.11);
  tgt += curlNoise(np) * uFlow * (1.0 + resp * 1.5) * vec3(1.0, 1.15, 1.0);

  /* A small global kick on a loud syllable, on top of the regional response. */
  tgt += dir * uBurst * (0.45 + fract(seed * 13.71));

  vec3 pos = P.xyz, vel = V.xyz;

  /* Outer particles spring softer and so trail behind — the lag is what makes
     the edge read as living tissue rather than a rigid surface. */
  float k = uSpring * mix(1.0, 0.5, outer);
  vec3 f = (tgt - pos) * k;

  /* Never fully still. Straight from the original. */
  f += vec3(sin(uTime * 1.17 + pos.y * 0.011 + seed * 6.28),
            cos(uTime * 0.93 + pos.x * 0.013 + seed * 4.71),
            sin(uTime * 0.71 + pos.z * 0.021)) * uJitter;

  f += vec3(-pos.z, 0.0, pos.x) * uSwirl;

  vel += f * uDt;
  vel *= exp(-uDamp * uDt);

  /* Hard rails: a stray force must never be able to poison the buffer. */
  vel = clamp(vel, vec3(-4000.0), vec3(4000.0));
  pos = clamp(pos + vel * uDt, vec3(-4000.0), vec3(4000.0));
  if (any(isnan(pos)) || any(isnan(vel))) { pos = tgt; vel = vec3(0.0); }

  outPos = vec4(pos, seed);
  /* The spare channel carries this particle's regional activity to the
     renderer, so a spoken-to patch can glow as well as move. */
  outVel = vec4(vel, resp);
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
  float act = clamp(V.w, 0.0, 1.1);

  /* Slow turntable. */
  float c = cos(uSpin), s = sin(uSpin);
  vec3 p = vec3(P.x * c - P.z * s, P.y, P.x * s + P.z * c);
  vec3 v = vec3(V.x * c - V.z * s, V.y, V.x * s + V.z * c);

  float w = uFocal / max(40.0, uFocal + p.z);
  vec2 sp = p.xy * w + uRes * 0.5;

  /* Active particles grow a little — the spoken-to region sparkles. */
  float px = uPointScale * w * (1.0 + act * 0.55);

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

  float heat = clamp(length(V.xyz) / 420.0, 0.0, 1.0);
  vec3 col = mix(uColA, uColB, clamp(p.z * 0.004 + 0.5, 0.0, 1.0));
  /* Whitening is capped on every term. Additive blending already drives
     dense areas toward white; letting heat, pitch and activity all push the
     same way is what produced the blown-out white disc. */
  col = mix(col, uColHot, heat * 0.4);
  col = mix(col, uColHot, uPitch * 0.18);
  col = mix(col, uColHot, act * 0.34);

  float a = uAlpha / max(stretch, 1.0);
  a *= mix(1.0, 1.3, heat);
  a *= mix(1.0, 3.2, act);
  /* The far half is dimmer than the near half: cheapest depth cue there is. */
  a *= mix(1.0, 0.4, smoothstep(-120.0, 160.0, p.z));

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
 * Per-state physics — the whole personality of the thing.
 *
 * Alpha is low on purpose. The field is additive, so density does the
 * brightening; a high base alpha is what turned the blob into a white disc.
 */
const PRESETS: Record<
  BlobState,
  {
    spring: number; damp: number; flow: number; jitter: number; deform: number;
    swirl: number; burst: number; alpha: number; bandGain: number; idle: number;
  }
> = {
  idle:      { spring: 7.0,  damp: 5.0, flow: 1.8, jitter: 4, deform: 0.10, swirl: 0.10, burst: 0,  alpha: 0.17, bandGain: 0.30, idle: 1.0 },
  listening: { spring: 9.0,  damp: 5.2, flow: 2.0, jitter: 6, deform: 0.12, swirl: 0.16, burst: 10, alpha: 0.20, bandGain: 0.62, idle: 0.45 },
  thinking:  { spring: 11.0, damp: 6.0, flow: 3.2, jitter: 4, deform: 0.13, swirl: 0.62, burst: 0,  alpha: 0.19, bandGain: 0.30, idle: 0.0 },
  speaking:  { spring: 10.0, damp: 5.0, flow: 2.0, jitter: 5, deform: 0.14, swirl: 0.22, burst: 12, alpha: 0.22, bandGain: 0.62, idle: 0.35 },
};

const ACCENT = [1.0, 0.353, 0.122]; // #FF5A1F
const ACCENT_SOFT = [1.0, 0.478, 0.271]; // #FF7A45
const HOT = [1.0, 0.9, 0.78];

/**
 * Shell radius as a fraction of the canvas. Kept well under half because the
 * reach of an active region, the curl noise and the perspective divide all
 * stack on top of it — and once the total passes half the canvas the sphere
 * crops into a square.
 */
const RADIUS_FRACTION = 0.16;

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
  feed = null,
  size = 440,
  className = "",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Props mirrored into refs so the render loop reads the latest value
  // without the effect re-running — which would rebuild every GL resource.
  // Mirrored in effects rather than during render: writing a ref while
  // rendering is not safe under concurrent rendering.
  const stateRef = useRef(state);
  const levelPropRef = useRef(level);
  const pitchPropRef = useRef(pitch);
  const feedRef = useRef(feed);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    levelPropRef.current = level;
  }, [level]);
  useEffect(() => {
    pitchPropRef.current = pitch;
  }, [pitch]);
  useEffect(() => {
    feedRef.current = feed;
  }, [feed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

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

    // Fewer particles on a phone — mid-range Android on a mobile network is
    // the default case here, not the exception.
    const small = window.innerWidth < 768;
    const TEX = small ? 96 : 144; // 9,216 or 20,736 particles
    const COUNT = TEX * TEX;
    const dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2);

    // The canvas is sized by CSS and measured here, so the blob fills its
    // container on a phone and caps at `size` on a desktop. Resizing only
    // re-measures; the particle buffers are not rebuilt.
    let cssSize = canvas.clientWidth || size;
    const measure = () => {
      cssSize = canvas.clientWidth || size;
      canvas.width = Math.max(1, Math.round(cssSize * dpr));
      canvas.height = Math.max(1, Math.round(cssSize * dpr));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(canvas);

    let simProg: WebGLProgram;
    let drawProg: WebGLProgram;
    try {
      simProg = program(gl, VS_FULLSCREEN, FS_SIM);
      drawProg = program(gl, VS_PARTICLE, FS_PARTICLE);
    } catch (e) {
      if (process.env.NODE_ENV !== "production") console.error("[TalkBlob]", e);
      ro.disconnect();
      return;
    }

    // Uniform locations looked up once. Doing it per frame is ~40 string
    // lookups every 16ms for values that never change.
    const locCache = new Map<string, WebGLUniformLocation | null>();
    const loc = (prog: WebGLProgram, name: string) => {
      const key = (prog === simProg ? "s:" : "d:") + name;
      if (!locCache.has(key)) locCache.set(key, gl.getUniformLocation(prog, name));
      return locCache.get(key) ?? null;
    };

    // --- particle state ----------------------------------------------------
    const pos = new Float32Array(COUNT * 4);
    const vel = new Float32Array(COUNT * 4);
    for (let i = 0; i < COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const z = Math.random() * 2 - 1;
      const r = Math.sqrt(1 - z * z);
      // Scattered just outside the shell: the opening reads as the field
      // gathering itself, and it is formed within a few hundred milliseconds.
      const d = cssSize * (0.2 + Math.random() * 0.18);
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
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const bands = new Float32Array(BAND_COUNT);

    let raf = 0;
    let last = performance.now();
    let time = 0;
    let spin = 0;
    // Asymmetric smoothing of overall level: snap open, settle slowly.
    let smooth = 0;
    let smoothPitch = 0;
    let disposed = false;

    function frame(now: number) {
      if (disposed) return;
      raf = requestAnimationFrame(frame);

      // Clamp BOTH ends: a backgrounded tab returns a huge dt and explodes
      // the spring, and a non-monotonic timestamp gives a negative dt that
      // integrates backwards. Math.min alone allows the latter.
      const dt = Math.max(0, Math.min((now - last) / 1000, 1 / 30));
      last = now;
      time += dt;

      const st = stateRef.current;
      const p = PRESETS[st];
      const silent = st === "idle" || st === "thinking";
      const src = feedRef.current;

      const rawLevel = src ? src.levelRef.current : levelPropRef.current;
      const rawPitch = src ? src.pitchRef.current : pitchPropRef.current;
      const target = silent ? 0 : Math.min(1, Math.max(0, rawLevel));
      smooth += (target - smooth) * (target > smooth ? 0.55 : 0.09);
      const pitchTarget = silent ? 0 : Math.min(1, Math.max(0, rawPitch));
      smoothPitch += (pitchTarget - smoothPitch) * 0.25;

      // Band energies. With a feed they come straight from the spectrum.
      // Without one (a caller passing only `level`), a scalar is spread
      // across the bands with a travelling phase so regions still move
      // independently rather than the whole blob pulsing as one.
      const srcBands = src?.bandsRef.current;
      for (let i = 0; i < BAND_COUNT; i++) {
        const next = silent
          ? 0
          : srcBands
            ? srcBands[i]
            : smooth * (0.55 + 0.45 * Math.sin(time * 3.1 + i * 1.3));
        bands[i] += (next - bands[i]) * 0.5;
      }

      spin += dt * (0.1 + smooth * 0.6);

      const g = gl!;
      const radius = cssSize * RADIUS_FRACTION;

      // ---- simulate ----
      // Blending MUST be off here. The draw pass enables additive blending
      // and GL state is global; left on, the sim's output is ADDED to the
      // target texture instead of replacing it, which with ping-pong is a
      // Fibonacci recurrence — every value, including the copied seed,
      // growing by 1.618x per frame.
      g.disable(g.BLEND);
      g.bindFramebuffer(g.FRAMEBUFFER, fboB);
      g.viewport(0, 0, TEX, TEX);
      g.useProgram(simProg);
      g.activeTexture(g.TEXTURE0);
      g.bindTexture(g.TEXTURE_2D, posA);
      g.uniform1i(loc(simProg, "uPos"), 0);
      g.activeTexture(g.TEXTURE1);
      g.bindTexture(g.TEXTURE_2D, velA);
      g.uniform1i(loc(simProg, "uVel"), 1);
      g.uniform1f(loc(simProg, "uDt"), reduced ? dt * 0.35 : dt);
      g.uniform1f(loc(simProg, "uTime"), time);
      g.uniform1f(loc(simProg, "uSpring"), p.spring);
      g.uniform1f(loc(simProg, "uDamp"), p.damp);
      g.uniform1f(loc(simProg, "uFlow"), p.flow * (1 + smooth * 0.8));
      g.uniform1f(loc(simProg, "uNoiseScale"), 0.009);
      g.uniform1f(loc(simProg, "uJitter"), reduced ? p.jitter * 0.3 : p.jitter);
      // Cubed so room tone is ignored and a syllable kicks.
      g.uniform1f(loc(simProg, "uBurst"), (cssSize / 340) * p.burst * smooth * smooth * smooth);
      g.uniform1f(loc(simProg, "uRadius"), radius * (1 + smooth * 0.12));
      g.uniform1f(loc(simProg, "uDeform"), p.deform + smooth * 0.15);
      g.uniform1f(loc(simProg, "uSwirl"), reduced ? 0 : p.swirl * (1 + smooth * 1.5));
      g.uniform1f(loc(simProg, "uPitch"), smoothPitch);
      g.uniform1fv(loc(simProg, "uBands"), bands);
      g.uniform1f(loc(simProg, "uBandGain"), p.bandGain);
      g.uniform1f(loc(simProg, "uSharp"), 9.5);
      g.uniform1f(loc(simProg, "uIdle"), reduced ? p.idle * 0.3 : p.idle);
      // The DEFAULT vertex array. Drawing through a created-but-unconfigured
      // VAO emitted no fragments at all on this driver.
      g.bindVertexArray(null);
      g.drawArrays(g.TRIANGLES, 0, 3);

      [posA, posB] = [posB, posA];
      [velA, velB] = [velB, velA];
      [fboA, fboB] = [fboB, fboA];

      // ---- draw ----
      g.bindFramebuffer(g.FRAMEBUFFER, null);
      g.viewport(0, 0, canvas!.width, canvas!.height);
      g.clearColor(0, 0, 0, 0);
      g.clear(g.COLOR_BUFFER_BIT);
      g.enable(g.BLEND);
      // Additive, premultiplied: overlapping particles build to the hot core.
      g.blendFunc(g.ONE, g.ONE);

      g.useProgram(drawProg);
      g.activeTexture(g.TEXTURE0);
      g.bindTexture(g.TEXTURE_2D, posA);
      g.uniform1i(loc(drawProg, "uPos"), 0);
      g.activeTexture(g.TEXTURE1);
      g.bindTexture(g.TEXTURE_2D, velA);
      g.uniform1i(loc(drawProg, "uVel"), 1);
      g.uniform2f(loc(drawProg, "uTexSize"), TEX, TEX);
      g.uniform2f(loc(drawProg, "uRes"), canvas!.width, canvas!.height);
      // Long focal length: a flatter perspective, so the near side is not
      // magnified past the canvas edge when a region reaches outward.
      g.uniform1f(loc(drawProg, "uFocal"), 900);
      // Projection is in CSS pixels scaled by dpr, so world units stay in
      // proportion to the component at any density.
      g.uniform1f(loc(drawProg, "uPointScale"), 1.35 * dpr);
      g.uniform1f(loc(drawProg, "uStretch"), 0.05);
      g.uniform1f(loc(drawProg, "uAlpha"), p.alpha);
      g.uniform1f(loc(drawProg, "uSpin"), spin);
      g.uniform1f(loc(drawProg, "uPitch"), smoothPitch);
      g.uniform3fv(loc(drawProg, "uColA"), ACCENT);
      g.uniform3fv(loc(drawProg, "uColB"), ACCENT_SOFT);
      g.uniform3fv(loc(drawProg, "uColHot"), HOT);
      g.bindVertexArray(null);
      g.drawArraysInstanced(g.TRIANGLES, 0, 6, COUNT);
    }

    raf = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      gl.deleteProgram(simProg);
      gl.deleteProgram(drawProg);
      gl.deleteTexture(posA);
      gl.deleteTexture(posB);
      gl.deleteTexture(velA);
      gl.deleteTexture(velB);
      gl.deleteFramebuffer(fboA);
      gl.deleteFramebuffer(fboB);
      // NOT loseContext(): it kills the context permanently for this canvas,
      // and getContext() afterwards returns the same dead one — so the blob
      // was blank after any remount, including StrictMode's.
    };
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`block ${className}`}
      style={{ width: "100%", maxWidth: size, aspectRatio: "1 / 1" }}
    />
  );
}
