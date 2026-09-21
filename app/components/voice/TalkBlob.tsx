"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { BAND_COUNT, type AudioFeed } from "../../lib/audio/useAudioLevel";

/**
 * Talk's voice blob — a GPU particle field that reacts to sound.
 *
 * The physics is ported from the particle engine in `general/animations`
 * (`src/30-gl.js`, `FS_SIM`): position and velocity live in floating-point
 * textures, a fragment shader integrates them, and the result ping-pongs
 * between two framebuffers.
 *
 * WHAT MAKES IT FEEL ALIVE
 *
 * - Regions. The voice is split into BAND_COUNT frequency bands; the sphere
 *   carries the same number of soft patches on a golden-angle spiral, lowest
 *   frequencies at the bottom and sibilance at the top. Different words have
 *   different spectra, so different parts of the blob move for them.
 * - Violence. A band that suddenly jumps (an onset) does not just move its
 *   patch's target — it kicks the particles' VELOCITY, so they are flung out
 *   and stiff springs snap them back. The first word after silence hits
 *   hardest; kicks ease off while talk continues, so the body stays legible.
 * - Restlessness. Every particle random-walks on its own noise track, patches
 *   twitch spontaneously even in silence, and a sparse halo of free particles
 *   orbits the body like embers. Before anyone speaks it is already moving.
 *
 * UNITS. World units are CSS pixels. The projection multiplies by the device
 * pixel ratio; an earlier version did not, which rendered the blob at 1/dpr
 * of its intended size on every scaled display.
 *
 * CONTROLLED COMPONENT. It never touches the microphone. Audio arrives through
 * `feed` (refs, read every frame) or the `level`/`pitch` props as a fallback.
 * The canvas fills its container; the page decides how big that is, and should
 * make it considerably larger than the blob so thrown particles are not
 * clipped.
 */

export type BlobState = "idle" | "listening" | "thinking" | "speaking";

type Props = {
  state?: BlobState;
  /** Fallback amplitude, 0..1, used when no `feed` is supplied. */
  level?: number;
  /** Fallback pitch, 0..1, used when no `feed` is supplied. */
  pitch?: number;
  /** Per-frame audio as refs. Preferred: read at full frame rate. */
  feed?: AudioFeed | null;
  /** Body radius as a fraction of the smaller viewport dimension. */
  radiusFraction?: number;
  /** Clamp on the body radius, in CSS px. */
  minRadius?: number;
  maxRadius?: number;
  className?: string;
  style?: CSSProperties;
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
`;

/**
 * Per-particle randomness, shared by both passes.
 *
 * An integer hash of the particle's texel index — NOT fract(seed * k). That
 * form is a smooth function of the seed, so particles with nearby seeds got
 * nearby directions, depths and jitter: the "random" sphere was really one
 * long thread wound round it like a ball of yarn, and the embers were worms.
 * It only became obvious at 80,000 particles.
 */
const HASH_GLSL = `
uint hashU(uint x){
  x ^= x >> 16; x *= 0x7feb352dU;
  x ^= x >> 15; x *= 0x846ca68bU;
  x ^= x >> 16; return x;
}
/* The k-th independent uniform in [0,1) for particle id. */
float rnd(uint id, uint k){
  return float(hashU(id * 0x9E3779B9U + k * 0x85EBCA6BU + 0x632BE5ABU) >> 8) / 16777216.0;
}
vec3 sphereDir(uint id){
  float a = rnd(id, 1u) * 6.2831853;
  float z = rnd(id, 2u) * 2.0 - 1.0;
  float r = sqrt(max(0.0, 1.0 - z * z));
  return vec3(cos(a) * r, sin(a) * r, z);
}
/* ~3.5% of particles are free-floating embers rather than part of the body.
   Any more and the halo reads as a fuzzy ball twice the size of the body. */
float isFree(uint id){ return step(0.965, rnd(id, 11u)); }`;

const FS_SIM = `#version 300 es
precision highp float; precision highp sampler2D;
#define BANDS ${BAND_COUNT}
uniform sampler2D uPos, uVel;
uniform float uDt, uTime, uSpring, uDamp, uFlow, uNoiseScale;
uniform float uJitter, uBurst, uRadius, uDeform, uSwirl, uPitch;
uniform float uBands[BANDS];
uniform float uFlux[BANDS];
uniform float uBandGain, uSharp, uIdle, uKick, uWander;
layout(location=0) out vec4 outPos;
layout(location=1) out vec4 outVel;
${NOISE_GLSL}
${HASH_GLSL}

/* Where band i listens: a golden-angle spiral from the bottom pole to the top,
   drifting slowly so the patches migrate over time. */
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
  uint id = uint(uv.y) * uint(textureSize(uPos, 0).x) + uint(uv.x);
  vec3 dir = sphereDir(id);
  float free = isFree(id);

  /* Thick shell biased to the surface, sparse inside. */
  float depth = mix(0.36, 1.0, sqrt(rnd(id, 3u)));
  float outer = max(smoothstep(0.6, 1.0, depth), free);

  /* Regional response (sustained) and onset (sudden). */
  float resp = 0.0;
  float flux = 0.0;
  for (int i = 0; i < BANDS; i++) {
    vec3 c = bandCenter(i);
    float w = exp(-(1.0 - dot(dir, c)) * uSharp);
    float breath = uIdle * 0.12 * (0.5 + 0.5 * sin(uTime * 0.8 + float(i) * 1.7));
    resp += w * (uBands[i] + breath);
    flux += w * uFlux[i];
  }
  resp = min(resp, 1.0);
  flux = min(flux, 1.2);

  /* Pitch sets how many lobes the shell dents into. dir is a UNIT vector, so
     the scale here is a count of features around the sphere — an earlier
     version used a world-space scale (~0.009) and the denting was flat. */
  float scale = uNoiseScale * mix(1.0, 3.2, uPitch);
  float wob = snoise(dir * scale + vec3(0.0, 0.0, uTime * (0.45 + uPitch * 1.2)));
  float shell = uRadius * (1.0 + wob * uDeform);

  vec3 tgt;
  if (free > 0.5) {
    /* Embers orbit on their own tilted axes at their own speeds, and get
       thrown further than the body when the voice hits their side. */
    float orbitR = uRadius * (1.3 + 1.1 * rnd(id, 4u));
    float ang = uTime * (0.12 + 0.3 * rnd(id, 5u)) + rnd(id, 6u) * 6.2831853;
    vec3 ax = normalize(vec3(rnd(id, 7u) - 0.5, 1.0, rnd(id, 8u) - 0.5));
    vec3 d2 = dir * cos(ang) + cross(ax, dir) * sin(ang) + ax * dot(ax, dir) * (1.0 - cos(ang));
    tgt = d2 * orbitR * (1.0 + resp * uBandGain * 0.6);
    /* Cheap wander, not a second curl: a branch in a fragment shader costs
       every particle in the warp, and embers are scattered through them all. */
    tgt += vec3(sin(uTime * 0.71 + rnd(id, 9u) * 40.0),
                sin(uTime * 0.53 + rnd(id, 10u) * 40.0),
                sin(uTime * 0.61 + rnd(id, 12u) * 40.0)) * uRadius * 0.28 * uWander;
  } else {
    /* The active region reaches out; outer particles reach furthest, so a
       spoken-to patch grows tendrils rather than just bulging. */
    float reach = resp * uRadius * uBandGain * (0.5 + outer);
    tgt = dir * (shell * depth + reach);
  }

  /* Wind, radius-relative, stirred much harder where the voice lands. */
  vec3 np = tgt / max(uRadius, 1.0) * 0.55 + vec3(uTime * 0.09, uTime * -0.06, uTime * 0.11);
  tgt += curlNoise(np) * uFlow * (1.0 + resp * 1.5) * vec3(1.0, 1.15, 1.0);

  /* Global kick on a loud syllable. */
  tgt += dir * uBurst * (0.45 + rnd(id, 13u));

  vec3 pos = P.xyz, vel = V.xyz;

  /* Outer particles and embers spring softer: they trail and overshoot. */
  float k = uSpring * mix(1.0, 0.45, outer);
  vec3 f = (tgt - pos) * k;

  /* Restlessness: each particle random-walks along its own noise track.
     Smooth in time, uncorrelated between particles — so the field churns
     constantly without any visible pattern. */
  float jx = rnd(id, 14u) * 300.0;
  vec3 jn = vec3(snoise(vec3(jx, uTime * 0.85, 1.7)),
                 snoise(vec3(jx, uTime * 0.85, 8.3)),
                 snoise(vec3(jx, uTime * 0.85, 15.1)));
  f += jn * uJitter;

  /* VIOLENCE. An onset is a force on the velocity, not a move of the target:
     particles are flung, carry momentum past their rest point, and ring back.
     Part of it is tangential so the burst sprays rather than just inflating. */
  vec3 tang = normalize(cross(dir, vec3(0.3, 1.0, 0.2)) + 1e-4);
  f += dir * flux * uKick * (0.6 + outer * 0.9);
  f += tang * flux * uKick * 0.45 * (rnd(id, 15u) - 0.5);

  f += vec3(-pos.z, 0.0, pos.x) * uSwirl;

  vel += f * uDt;
  vel *= exp(-uDamp * uDt);

  /* Hard rails: a stray force must never be able to poison the buffer. */
  vel = clamp(vel, vec3(-6000.0), vec3(6000.0));
  pos = clamp(pos + vel * uDt, vec3(-6000.0), vec3(6000.0));
  if (any(isnan(pos)) || any(isnan(vel))) { pos = tgt; vel = vec3(0.0); }

  outPos = vec4(pos, P.w);
  /* Spare channel: regional activity for the renderer to light up. */
  outVel = vec4(vel, resp + flux * 0.6);
}`;

const VS_PARTICLE = `#version 300 es
precision highp float; precision highp sampler2D;
uniform sampler2D uPos, uVel;
uniform vec2 uTexSize, uRes;
uniform float uFocal, uPointScale, uStretch, uAlpha, uSpin, uPitch;
uniform float uPxScale, uRadius, uTime, uHeatScale;
uniform float uStride, uSizeMul, uAlphaMul;
uniform vec3 uColA, uColB, uColHot;
out vec2 vUv;
out vec4 vCol;
${HASH_GLSL}
void main(){
  int id = gl_InstanceID * int(uStride);
  ivec2 tx = ivec2(id % int(uTexSize.x), id / int(uTexSize.x));
  vec4 P = texelFetch(uPos, tx, 0);
  vec4 V = texelFetch(uVel, tx, 0);
  uint pid = uint(id);
  float free = isFree(pid);
  float act = clamp(V.w, 0.0, 1.4);

  float c = cos(uSpin), s = sin(uSpin);
  vec3 p = vec3(P.x * c - P.z * s, P.y, P.x * s + P.z * c);
  vec3 v = vec3(V.x * c - V.z * s, V.y, V.x * s + V.z * c);

  /* World units are CSS px; uPxScale converts to device px. */
  float w = uFocal / max(uFocal * 0.2, uFocal + p.z);
  vec2 sp = p.xy * w * uPxScale + uRes * 0.5;

  float px = uPointScale * w * (1.0 + act * 0.55) * (1.0 + free * 0.5) * uSizeMul;

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

  float heat = clamp(length(V.xyz) / uHeatScale, 0.0, 1.0);
  vec3 col = mix(uColA, uColB, clamp(p.z / uRadius * 0.5 + 0.5, 0.0, 1.0));

  /* Per-particle colour variation — a few deep embers, a few golds — so the
     field has grain instead of being one flat orange. */
  float hue = rnd(pid, 16u);
  col = mix(col, vec3(0.78, 0.17, 0.05), smoothstep(0.72, 1.0, hue) * 0.7);
  col = mix(col, vec3(1.0, 0.68, 0.32), smoothstep(0.28, 0.0, hue) * 0.55);

  /* Whitening capped on every term, or additive blending blows it to white. */
  col = mix(col, uColHot, heat * 0.4);
  col = mix(col, uColHot, uPitch * 0.18);
  col = mix(col, uColHot, act * 0.34);

  float a = uAlpha / max(stretch, 1.0);
  a *= mix(1.0, 1.3, heat);
  a *= mix(1.0, 3.2, act);
  a *= mix(1.0, 0.4, smoothstep(-uRadius * 0.9, uRadius * 1.2, p.z));
  /* Soft circular edge, so a particle thrown past the canvas dissolves
     instead of meeting a hard square border. */
  vec2 nd = (sp - uRes * 0.5) / (uRes * 0.5);
  a *= 1.0 - smoothstep(0.7, 0.97, length(nd));
  /* Embers twinkle. */
  a *= mix(1.0, 0.45 + 1.2 * abs(sin(uTime * 2.3 + rnd(pid, 17u) * 60.0)), free);
  a *= uAlphaMul;

  vCol = vec4(col, a);
}`;

const FS_PARTICLE = `#version 300 es
precision highp float;
in vec2 vUv; in vec4 vCol;
uniform float uCore;
out vec4 frag;
void main(){
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  float body = pow(1.0 - r2, 1.85);
  float core = pow(1.0 - r2, 9.0);
  float a = (body + core * 0.85 * uCore) * vCol.a;
  frag = vec4(vCol.rgb * a, a);
}`;

// ------------------------------------------------------------- parameters

/**
 * Per-state physics — the whole personality of the thing.
 *
 * Lengths are FRACTIONS OF THE RADIUS so the character is identical at any
 * size: flow and jitter are displacements, kick is an onset force, burst is a
 * displacement on overall loudness.
 *
 * Stiff, lightly damped springs are what make a hit read as violent: an
 * onset throws particles out and the spring snaps them back within ~0.3s.
 * Soft springs (the first attempt) turned the same kick into a slow swell
 * that peaked half a second later and read as breathing, not reacting.
 */
type Preset = {
  spring: number; damp: number; flow: number; jitter: number; deform: number;
  swirl: number; burst: number; kick: number; alpha: number; bandGain: number;
  idle: number; twitch: number; wander: number;
};

const PRESETS: Record<BlobState, Preset> = {
  idle:      { spring: 12.0, damp: 3.2, flow: 0.07, jitter: 0.09, deform: 0.14, swirl: 0.12, burst: 0.0, kick: 26, alpha: 0.16, bandGain: 0.6, idle: 1.0, twitch: 0.75, wander: 1.0 },
  listening: { spring: 30.0, damp: 4.5, flow: 0.08, jitter: 0.10, deform: 0.18, swirl: 0.18, burst: 0.2, kick: 55, alpha: 0.19, bandGain: 0.7, idle: 0.6, twitch: 0.45, wander: 1.0 },
  thinking:  { spring: 14.0, damp: 5.0, flow: 0.10, jitter: 0.05, deform: 0.14, swirl: 0.70, burst: 0.0, kick: 14, alpha: 0.18, bandGain: 0.5, idle: 0.2, twitch: 0.30, wander: 0.6 },
  speaking:  { spring: 30.0, damp: 4.5, flow: 0.08, jitter: 0.08, deform: 0.20, swirl: 0.24, burst: 0.2, kick: 55, alpha: 0.21, bandGain: 0.7, idle: 0.4, twitch: 0.25, wander: 1.0 },
};

const ACCENT = [1.0, 0.353, 0.122]; // #FF5A1F
const ACCENT_SOFT = [1.0, 0.478, 0.271]; // #FF7A45
const HOT = [1.0, 0.9, 0.78];

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
  radiusFraction = 0.15,
  minRadius = 88,
  maxRadius = 150,
  className = "",
  style,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Props mirrored into refs in effects, so the render loop reads the latest
  // value without the GL effect re-running and rebuilding every resource.
  const stateRef = useRef(state);
  const levelPropRef = useRef(level);
  const pitchPropRef = useRef(pitch);
  const feedRef = useRef(feed);
  const sizingRef = useRef({ radiusFraction, minRadius, maxRadius });

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
    sizingRef.current = { radiusFraction, minRadius, maxRadius };
  }, [radiusFraction, minRadius, maxRadius]);

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
      powerPreference: "high-performance",
    });
    if (!gl || !gl.getExtension("EXT_color_buffer_float")) return;

    // Four times the particles of the previous version, because the blob is
    // twice as wide: same count per unit of screen area, same density. Phones
    // start at the same density too and rely on the adaptive step below —
    // mid-range Android is the common device here.
    const small = window.innerWidth < 768;
    const TEX = small ? 224 : 288; // 50,176 or 82,944 particles
    // Capped at 1.5: the canvas is deliberately much larger than the blob so
    // thrown particles are not clipped, and a 2x buffer at that size costs a
    // lot of fill for detail nobody can see in a soft particle field.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    let radius = minRadius;
    const measure = () => {
      const cw = canvas.clientWidth || 600;
      const ch = canvas.clientHeight || 600;
      canvas.width = Math.max(1, Math.round(cw * dpr));
      canvas.height = Math.max(1, Math.round(ch * dpr));
      const { radiusFraction: f, minRadius: lo, maxRadius: hi } = sizingRef.current;
      const v = Math.min(window.innerWidth, window.innerHeight) * f;
      radius = Math.min(hi, Math.max(lo, v));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(canvas);
    window.addEventListener("resize", measure);

    let simProg: WebGLProgram;
    let drawProg: WebGLProgram;
    try {
      simProg = program(gl, VS_FULLSCREEN, FS_SIM);
      drawProg = program(gl, VS_PARTICLE, FS_PARTICLE);
    } catch (e) {
      if (process.env.NODE_ENV !== "production") console.error("[TalkBlob]", e);
      ro.disconnect();
      window.removeEventListener("resize", measure);
      return;
    }

    const locCache = new Map<string, WebGLUniformLocation | null>();
    const loc = (prog: WebGLProgram, name: string) => {
      const key = (prog === simProg ? "s:" : "d:") + name;
      if (!locCache.has(key)) locCache.set(key, gl.getUniformLocation(prog, name));
      return locCache.get(key) ?? null;
    };

    // --- particle state ----------------------------------------------------
    const COUNT = TEX * TEX;
    const pos = new Float32Array(COUNT * 4);
    const vel = new Float32Array(COUNT * 4);
    for (let i = 0; i < COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const z = Math.random() * 2 - 1;
      const r = Math.sqrt(1 - z * z);
      const d = radius * (1.2 + Math.random() * 1.1);
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

    // --- per-frame audio state -------------------------------------------
    const bands = new Float32Array(BAND_COUNT); // smoothed input
    const prev = new Float32Array(BAND_COUNT);
    const flux = new Float32Array(BAND_COUNT); // onset envelopes
    const twitch = new Float32Array(BAND_COUNT); // spontaneous activity
    const bandsOut = new Float32Array(BAND_COUNT);
    let nextTwitch = 0.3;
    // Startle, then settle. Every onset adds fatigue, which decays over ~1.2s
    // and scales the kicks down. The first word after silence hits at full
    // force; sustained talk keeps the body recognisable instead of letting
    // back-to-back kicks compound into a spray that fills the frame.
    let fatigue = 0;

    // Adaptive quality. Every two seconds of slow frames halves the rows that
    // are simulated and drawn, at most twice (a quarter of the particles). A
    // 20fps blob looks broken; a thinner one does not, and this runs on
    // whatever laptop or phone the user happens to own.
    let activeRows = TEX;
    let perfSum = 0;
    let perfN = 0;
    let downgrades = 0;

    let raf = 0;
    let last = performance.now();
    let time = 0;
    let spin = 0;
    let smooth = 0;
    let smoothPitch = 0;
    let disposed = false;

    function frame(now: number) {
      if (disposed) return;
      raf = requestAnimationFrame(frame);

      const rawDt = (now - last) / 1000;
      last = now;
      // Clamp both ends: huge dt after a background tab explodes the spring,
      // negative dt from a non-monotonic clock integrates backwards.
      const dt = Math.max(0, Math.min(rawDt, 1 / 30));
      time += dt;

      if (downgrades < 2 && rawDt > 0 && rawDt < 0.2) {
        perfSum += rawDt;
        perfN += 1;
        if (perfN >= 120) {
          if (perfSum / perfN > 0.024) {
            activeRows = Math.floor(activeRows / 2);
            downgrades += 1;
          } else {
            downgrades = 2; // fast enough: stop measuring
          }
          perfSum = 0;
          perfN = 0;
        }
      }

      const st = stateRef.current;
      const p = PRESETS[st];
      const silent = st === "idle" || st === "thinking";
      const src = feedRef.current;

      const rawLevel = src ? src.levelRef.current : levelPropRef.current;
      const rawPitch = src ? src.pitchRef.current : pitchPropRef.current;
      const target = silent ? 0 : Math.min(1, Math.max(0, rawLevel));
      smooth += (target - smooth) * (target > smooth ? 0.6 : 0.09);
      const pitchTarget = silent ? 0 : Math.min(1, Math.max(0, rawPitch));
      smoothPitch += (pitchTarget - smoothPitch) * 0.25;

      const srcBands = src?.bandsRef.current;
      const fluxDecay = Math.exp(-dt * 9);
      for (let i = 0; i < BAND_COUNT; i++) {
        const next = silent
          ? 0
          : srcBands
            ? srcBands[i]
            : smooth * (0.55 + 0.45 * Math.sin(time * 3.1 + i * 1.3));
        bands[i] += (next - bands[i]) * 0.6;
        // Onset = how much this band ROSE this frame. Sustained sound holds
        // the region out; a sudden rise throws it.
        const rise = Math.max(0, bands[i] - prev[i]);
        prev[i] = bands[i];
        flux[i] = Math.max(flux[i] * fluxDecay, rise * 5);
      }

      // Spontaneous twitches — the thing is alive before anyone speaks.
      const twitchRate = reduced ? 0 : p.twitch;
      if (twitchRate > 0) {
        nextTwitch -= dt;
        if (nextTwitch <= 0) {
          const i = Math.floor(Math.random() * BAND_COUNT);
          const amp = twitchRate * (0.4 + Math.random() * 0.6);
          twitch[i] = Math.max(twitch[i], amp);
          flux[i] = Math.max(flux[i], amp * 0.9);
          nextTwitch = 0.18 + Math.random() * 0.7;
        }
      }
      let fluxSum = 0;
      for (let i = 0; i < BAND_COUNT; i++) fluxSum += flux[i];
      fatigue = fatigue * Math.exp(-dt / 1.2) + fluxSum * dt * 0.25;
      const kickScale = 1 / (1 + fatigue);

      const twitchDecay = Math.exp(-dt * 3.5);
      for (let i = 0; i < BAND_COUNT; i++) {
        twitch[i] *= twitchDecay;
        bandsOut[i] = Math.min(1.2, bands[i] + twitch[i]);
      }

      spin += dt * (0.1 + smooth * 0.6);

      const g = gl!;
      const R = radius;

      // ---- simulate ----
      // Blending MUST be off: the draw pass enables additive blending and GL
      // state is global. Left on, the sim's output is ADDED to the target
      // texture — a Fibonacci recurrence that grows everything by 1.618x per
      // frame, including the seed.
      g.disable(g.BLEND);
      g.bindFramebuffer(g.FRAMEBUFFER, fboB);
      g.viewport(0, 0, TEX, activeRows);
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
      g.uniform1f(loc(simProg, "uDamp"), reduced ? p.damp * 1.6 : p.damp);
      g.uniform1f(loc(simProg, "uFlow"), R * p.flow * (1 + smooth * 0.8));
      g.uniform1f(loc(simProg, "uNoiseScale"), 1.15);
      // Force whose equilibrium displacement is ~jitter * R.
      g.uniform1f(loc(simProg, "uJitter"), R * p.jitter * p.spring * (reduced ? 0.3 : 1));
      g.uniform1f(loc(simProg, "uBurst"), R * p.burst * smooth * smooth * smooth);
      g.uniform1f(loc(simProg, "uRadius"), R * (1 + smooth * 0.18));
      g.uniform1f(loc(simProg, "uDeform"), p.deform + smooth * 0.2);
      g.uniform1f(loc(simProg, "uSwirl"), reduced ? 0 : p.swirl * (1 + smooth * 1.5));
      g.uniform1f(loc(simProg, "uPitch"), smoothPitch);
      g.uniform1fv(loc(simProg, "uBands"), bandsOut);
      g.uniform1fv(loc(simProg, "uFlux"), flux);
      g.uniform1f(loc(simProg, "uBandGain"), p.bandGain);
      g.uniform1f(loc(simProg, "uSharp"), 9.5);
      g.uniform1f(loc(simProg, "uIdle"), reduced ? p.idle * 0.3 : p.idle);
      g.uniform1f(loc(simProg, "uKick"), R * p.kick * kickScale * (reduced ? 0.3 : 1));
      g.uniform1f(loc(simProg, "uWander"), p.wander);
      // The DEFAULT vertex array: a created-but-unconfigured VAO emitted no
      // fragments at all on this driver.
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
      g.uniform1f(loc(drawProg, "uFocal"), R * 7);
      g.uniform1f(loc(drawProg, "uPxScale"), dpr);
      g.uniform1f(loc(drawProg, "uRadius"), R);
      g.uniform1f(loc(drawProg, "uTime"), time);
      g.uniform1f(loc(drawProg, "uHeatScale"), R * 3.5);
      g.uniform1f(loc(drawProg, "uStretch"), 0.012);
      g.uniform1f(loc(drawProg, "uAlpha"), p.alpha);
      g.uniform1f(loc(drawProg, "uSpin"), spin);
      g.uniform1f(loc(drawProg, "uPitch"), smoothPitch);
      g.uniform3fv(loc(drawProg, "uColA"), ACCENT);
      g.uniform3fv(loc(drawProg, "uColB"), ACCENT_SOFT);
      g.uniform3fv(loc(drawProg, "uColHot"), HOT);
      g.bindVertexArray(null);

      const drawn = TEX * activeRows;

      // Glow pass: every 8th particle as a large, faint, coreless sprite. A
      // cheap stand-in for bloom that gives the body a soft atmosphere
      // without a second render target.
      g.uniform1f(loc(drawProg, "uStride"), 8);
      g.uniform1f(loc(drawProg, "uSizeMul"), 4.5);
      g.uniform1f(loc(drawProg, "uAlphaMul"), 0.028);
      g.uniform1f(loc(drawProg, "uPointScale"), 1.35 * dpr);
      g.uniform1f(loc(drawProg, "uCore"), 0);
      g.drawArraysInstanced(g.TRIANGLES, 0, 6, Math.floor(drawn / 8));

      // Main pass.
      g.uniform1f(loc(drawProg, "uStride"), 1);
      g.uniform1f(loc(drawProg, "uSizeMul"), 1);
      g.uniform1f(loc(drawProg, "uAlphaMul"), 1);
      g.uniform1f(loc(drawProg, "uCore"), 1);
      g.drawArraysInstanced(g.TRIANGLES, 0, 6, drawn);
    }

    raf = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", measure);
      gl.deleteProgram(simProg);
      gl.deleteProgram(drawProg);
      gl.deleteTexture(posA);
      gl.deleteTexture(posB);
      gl.deleteTexture(velA);
      gl.deleteTexture(velB);
      gl.deleteFramebuffer(fboA);
      gl.deleteFramebuffer(fboB);
      // NOT loseContext(): it kills the context permanently for this canvas,
      // and getContext() then returns the same dead one on remount.
    };
    // The GL setup runs once. Sizing props are read through sizingRef so a
    // change does not rebuild 80,000 particles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`block ${className}`}
      style={{ width: "100%", height: "100%", ...style }}
    />
  );
}
