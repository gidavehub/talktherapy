/**
 * Just enough of `firebase/firestore` for the group call mesh, in memory,
 * with the behaviour that makes signalling hard: every write and every
 * snapshot arrives after a random delay; snapshots coalesce (a listener sees
 * the latest state, not every step); a device that is offline queues its
 * writes and hears nothing until it is back. A device's own writes reach the
 * server in the order it made them.
 *
 * Swapped in for the real module by scripts/lib/mesh-hooks.mjs.
 */

import { als, client, clock, errors, offline, random, whenOnline } from "./mesh-sim.mjs";

const store = new Map();
const listeners = new Set();
const queued = new Map();
const lastWriteAt = new Map();
let autoId = 0;

export const __store = store;

const latency = () => 15 + Math.floor(random() * 120);

export class Timestamp {
  constructor(ms) {
    this.ms = ms;
  }
  toMillis() {
    return this.ms;
  }
  static fromMillis(ms) {
    return new Timestamp(ms);
  }
}

const SERVER_TIME = Symbol("serverTimestamp");
export const serverTimestamp = () => ({ [SERVER_TIME]: true });

const ref = (kind, path, extra = {}) => ({ kind, path, id: path.split("/").pop(), ...extra });
const join = (...parts) => parts.filter(Boolean).join("/");

export function doc(parent, ...segments) {
  return ref("doc", join(parent.path, ...segments));
}
export function collection(parent, ...segments) {
  return ref("col", join(parent.path, ...segments));
}
export const where = (field, op, value) => ({ field, op, value });
export const query = (col, ...filters) => ref("query", col.path, { filters });

const parentOf = (path) => path.split("/").slice(0, -1).join("/");
const isPlain = (v) => v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Timestamp);

function resolve(value) {
  if (value && typeof value === "object" && value[SERVER_TIME]) return new Timestamp(clock.now());
  if (Array.isArray(value)) return value.map(resolve);
  if (isPlain(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v)]));
  return value;
}

function merge(base, patch) {
  const out = { ...(base ?? {}) };
  for (const [k, v] of Object.entries(patch)) out[k] = isPlain(v) && isPlain(out[k]) ? merge(out[k], v) : v;
  return out;
}

const clone = (v) => (v === undefined ? undefined : structuredCloneish(v));
function structuredCloneish(v) {
  if (v instanceof Timestamp) return new Timestamp(v.ms);
  if (Array.isArray(v)) return v.map(structuredCloneish);
  if (isPlain(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, structuredCloneish(x)]));
  return v;
}

const matches = (data, filters = []) =>
  filters.every((f) => (f.op === "==" ? data?.[f.field] === f.value : true));

function docsIn(path, filters) {
  const out = [];
  for (const [p, data] of store) {
    if (parentOf(p) !== path || !matches(data, filters)) continue;
    out.push({ id: p.split("/").pop(), ref: ref("doc", p), data: () => clone(data) });
  }
  return out;
}

// ------------------------------------------------------------------ writes

/** A write from the current device, applied at the server after a delay — or queued while offline. */
function write(apply) {
  const device = client();
  return new Promise((resolveWrite) => {
    const send = () => {
      const at = Math.max(clock.now() + latency(), (lastWriteAt.get(device) ?? 0) + 1);
      lastWriteAt.set(device, at);
      setTimeout(() => {
        const path = apply();
        notify(path);
        resolveWrite();
      }, at - clock.now());
    };
    if (offline.has(device)) {
      if (!queued.has(device)) queued.set(device, []);
      queued.get(device).push(send);
    } else {
      send();
    }
  });
}

export function setDoc(r, data, options) {
  const value = resolve(data);
  return write(() => {
    store.set(r.path, options?.merge ? merge(store.get(r.path), value) : value);
    return r.path;
  });
}
export function updateDoc(r, data) {
  return setDoc(r, data, { merge: true });
}
export function addDoc(col, data) {
  const r = ref("doc", join(col.path, `auto${++autoId}`));
  return setDoc(r, data).then(() => r);
}
export function deleteDoc(r) {
  return write(() => {
    store.delete(r.path);
    return r.path;
  });
}
export function getDocs(q) {
  const device = client();
  return new Promise((resolveRead) => {
    const read = () => setTimeout(() => resolveRead({ docs: docsIn(q.path, q.filters) }), latency());
    if (offline.has(device)) whenOnline((d) => d === device && read());
    else read();
  });
}

// --------------------------------------------------------------- listening

function deliver(l) {
  if (!listeners.has(l)) return;
  if (offline.has(l.device)) {
    l.dirty = true;
    return;
  }
  if (l.scheduled) return;
  l.scheduled = true;
  als.run({ client: l.device }, () =>
    setTimeout(() => {
      l.scheduled = false;
      if (!listeners.has(l)) return;
      if (offline.has(l.device)) {
        l.dirty = true;
        return;
      }
      try {
        if (l.kind === "doc") {
          const data = store.get(l.path);
          l.next({ exists: () => data !== undefined, data: () => clone(data), id: l.path.split("/").pop() });
        } else {
          const docs = docsIn(l.path, l.filters);
          const seen = new Map(docs.map((d) => [d.id, JSON.stringify(d.data())]));
          const changes = [];
          for (const d of docs) {
            if (!l.prev.has(d.id)) changes.push({ type: "added", doc: d });
            else if (l.prev.get(d.id) !== seen.get(d.id)) changes.push({ type: "modified", doc: d });
          }
          for (const id of l.prev.keys()) if (!seen.has(id)) changes.push({ type: "removed", doc: { id } });
          l.prev = seen;
          l.next({ docs, docChanges: () => changes });
        }
      } catch (e) {
        errors.push(e);
      }
    }, latency()),
  );
}

function notify(path) {
  for (const l of listeners) {
    if ((l.kind === "doc" && l.path === path) || (l.kind !== "doc" && parentOf(path) === l.path)) deliver(l);
  }
}

export function onSnapshot(r, next) {
  const l = { kind: r.kind, path: r.path, filters: r.filters, next, device: client(), prev: new Map(), scheduled: false, dirty: false };
  listeners.add(l);
  deliver(l);
  return () => void listeners.delete(l);
}

whenOnline((device) => {
  for (const send of queued.get(device) ?? []) als.run({ client: device }, send);
  queued.delete(device);
  for (const l of listeners) {
    if (l.device === device && l.dirty) {
      l.dirty = false;
      deliver(l);
    }
  }
});
