/**
 * Chat — the thread where a person and the provider Talk matched them with
 * actually talk.
 *
 * Shape: `chats/{chatId}` holds the participant list and the denormalised
 * state the chat list needs (preview, unread counts, typing), and
 * `chats/{chatId}/messages/{messageId}` holds the messages. `participants` is
 * copied onto every message. That duplication is deliberate and load-bearing:
 * the obvious security rule is a get() on the parent chat, which bills a
 * document read on every message read AND every message write. At the
 * free-tier ceiling of 50k reads/day, a handful of busy conversations would
 * exhaust the quota on access checks alone. See the `messages` block in
 * firestore.rules, which does the same thing for session transcripts.
 *
 * Everything here is 1:1 in the UI and group-ready in the data. A group chat
 * is the same document with a longer `participants` array; no field changes
 * meaning and no rule needs rewriting.
 *
 * Voice notes and images go to Cloud Storage and the message keeps the object
 * PATH, never a download URL — see `mediaPath` on ChatMessage for why that
 * distinction is a security property rather than a style choice.
 */

import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDoc,
  increment,
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import { getBlob, ref as storageRef, uploadBytes } from "firebase/storage";
import { firebaseConfigured, firebaseStorage, firestore } from "./firebase";
import { COLLECTIONS, type Chat, type ChatMessage, type ChatMessageKind } from "./models";

const CHATS = COLLECTIONS.chats;

/** Storage prefix. Mirrors the `chat-media/` block in storage.rules exactly. */
const CHAT_MEDIA = "chat-media";

/**
 * How long a typing signal stays true.
 *
 * Judged on the reader's clock against the writer's, so the two have to agree
 * roughly on the time — a few seconds of skew only makes the indicator a
 * little eager or a little slow, which is why this is a client-side rule and
 * not a serverTimestamp comparison.
 */
export const TYPING_TTL_MS = 5_000;

/**
 * Minimum gap between typing writes.
 *
 * Without it every keystroke is a document write. Billing aside, Firestore
 * rate-limits sustained writes to the same document, and losing a message send
 * because the typing indicator saturated the document would be an absurd way
 * to break a chat.
 */
const TYPING_WRITE_GAP_MS = 2_500;

// ------------------------------------------------------------- deserialisers

/**
 * Firestore hands back a Timestamp, a number, or — on a write this client just
 * made — null, because serverTimestamp() has not resolved yet. The fallback is
 * what keeps a just-sent message in the right place in the thread instead of
 * jumping to 1970 and back.
 */
function millis(value: unknown, fallback = Date.now()): number {
  if (typeof value === "number") return value;
  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof (value as { toMillis: unknown }).toMillis === "function"
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  return fallback;
}

/** Defensive: a map field can come back as anything, or as nothing. */
function numberMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "number" && Number.isFinite(raw)) out[key] = raw;
  }
  return out;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

const MESSAGE_KINDS: ChatMessageKind[] = ["text", "voice", "image", "file"];

/** Defensive, like numberMap: a map field can come back as anything. */
function stringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "string" && raw.trim()) out[key] = raw;
  }
  return out;
}

function toChat(id: string, data: DocumentData): Chat {
  const createdAt = millis(data.createdAt);
  return {
    id,
    participants: stringList(data.participants),
    names: stringMap(data.names),
    minor: data.minor === true,
    title: typeof data.title === "string" && data.title.trim() ? data.title.trim() : null,
    createdBy: typeof data.createdBy === "string" ? data.createdBy : null,
    // Only a group has somebody who created it; every group made before peer
    // groups existed was a led one.
    group: typeof data.createdBy === "string" ? (data.group === "peer" ? "peer" : "led") : null,
    lastMessage: typeof data.lastMessage === "string" ? data.lastMessage : "",
    // Falls back to createdAt, not to now: an empty chat should sort by when it
    // was opened rather than drifting to the top of the list on every render.
    lastMessageAt: millis(data.lastMessageAt, createdAt),
    unread: numberMap(data.unread),
    typing: numberMap(data.typing),
    createdAt,
  };
}

function toMessage(id: string, data: DocumentData, pending: boolean): ChatMessage {
  const kind = MESSAGE_KINDS.includes(data.kind as ChatMessageKind)
    ? (data.kind as ChatMessageKind)
    : "text";

  return {
    id,
    senderId: typeof data.senderId === "string" ? data.senderId : "",
    participants: stringList(data.participants),
    kind,
    text: typeof data.text === "string" ? data.text : "",
    mediaPath: typeof data.mediaPath === "string" ? data.mediaPath : null,
    durationSec: typeof data.durationSec === "number" ? data.durationSec : null,
    transcript: typeof data.transcript === "string" ? data.transcript : null,
    createdAt: millis(data.createdAt),
    readBy: stringList(data.readBy),
    pending,
  };
}

// --------------------------------------------------------------------- paths

function chatRef(chatId: string) {
  return doc(firestore(), CHATS, chatId);
}

function messagesRef(chatId: string) {
  return collection(firestore(), CHATS, chatId, COLLECTIONS.messages);
}

/**
 * Deterministic id for a two-person chat: both uids, sorted, joined.
 *
 * This is what makes the "Message" button on a provider's profile idempotent.
 * With a generated id, two taps — or the patient and the provider opening the
 * thread at the same moment — produce two chats holding half the conversation
 * each, and nothing ever reconciles them. Sorting is what makes it
 * order-independent, so both sides compute the same id without coordinating.
 *
 * Firebase Auth uids are alphanumeric, so "__" cannot occur inside one and the
 * split is unambiguous.
 */
export function directChatId(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join("__");
}

// ---------------------------------------------------------------- open/create

/**
 * The chat between a patient and a provider, created if it does not exist yet.
 *
 * Returns the id either way, so a caller can navigate immediately.
 *
 * Two clients racing here both write the same initial document at the same
 * deterministic id, so the loser's write is a harmless rewrite of identical
 * state rather than a duplicate thread. That is the whole reason for the
 * deterministic id, and it is why this does not need a transaction.
 */
export async function openChat(
  patientId: string,
  providerId: string,
  names: Record<string, string> = {},
  /** The patient is under 18 — see Chat.minor. */
  minor = false,
): Promise<string> {
  const chatId = directChatId(patientId, providerId);
  if (!firebaseConfigured()) return chatId;

  const ref = chatRef(chatId);

  // Reading a document that does not exist is REFUSED, not empty. The rule is
  // `uid in resource.data.participants`, and on a missing document `resource`
  // is null, so that expression cannot be evaluated and Firestore denies the
  // read. Every first-ever chat therefore arrives here as permission-denied,
  // and treating that as fatal is what would make the Message button fail the
  // one time it matters — the first time somebody taps it.
  //
  // Only that one code means "not there yet". A genuine refusal cannot reach
  // this line, because the caller is a participant by construction and the
  // create below is held to the same membership test; anything else (offline,
  // unavailable) must still surface rather than silently overwrite a live
  // chat's preview and unread counts with this initial state.
  try {
    const existing = await getDoc(ref);
    if (existing.exists()) {
      // A chat opened before the age question was answered. The flag only
      // ever goes ON from here; nothing on this path turns it off.
      if (minor && existing.data().minor !== true) await updateDoc(ref, { minor: true });
      return chatId;
    }
  } catch (error) {
    if ((error as { code?: string }).code !== "permission-denied") throw error;
  }

  await setDoc(ref, {
    participants: [patientId, providerId].sort(),
    names: stringMap(names),
    minor,
    lastMessage: "",
    lastMessageAt: serverTimestamp(),
    // Every participant gets an explicit zero. An absent key and a zero mean
    // the same thing to a reader, but seeding them keeps `increment()` on the
    // send path from being the thing that first creates the field.
    unread: { [patientId]: 0, [providerId]: 0 },
    typing: {},
    createdAt: serverTimestamp(),
  });

  return chatId;
}

/**
 * A group thread. Generated id, not a deterministic one: the same set of people
 * may legitimately want more than one group, so there is nothing to converge
 * on and no race to defend against.
 *
 * Unused by the current UI — group sessions are a later phase — but it is here
 * because it is the proof that the data model does not need changing for them.
 */
export async function createGroupChat(
  participants: string[],
  createdBy: string,
  names: Record<string, string> = {},
  title = "",
  group: "led" | "peer" = "led",
): Promise<string> {
  const unique = Array.from(new Set(participants));
  if (!unique.includes(createdBy)) {
    // firestore.rules refuses this write anyway; failing here says why.
    throw new Error("The creator of a chat must be one of its participants.");
  }
  if (unique.length < 3) {
    // Not a style rule. firestore.rules requires a two-person chat to live at
    // the id derived from the pair, so that nobody can squat it; a generated
    // id cannot satisfy that. Two people belong in openChat.
    throw new Error("A two-person conversation must be opened with openChat.");
  }

  const ref = await addDoc(collection(firestore(), CHATS), {
    participants: unique.sort(),
    names: stringMap(names),
    title: title.trim().slice(0, 80) || null,
    // The provider leading it. firestore.rules checks this is the caller and
    // that the caller is a provider.
    createdBy,
    group,
    lastMessage: "",
    lastMessageAt: serverTimestamp(),
    unread: Object.fromEntries(unique.map((uid) => [uid, 0])),
    typing: {},
    createdAt: serverTimestamp(),
  });

  return ref.id;
}

// ------------------------------------------------------------------ watching

/**
 * Live list of a person's chats, newest activity first.
 *
 * Needs the composite index on (participants array-contains, lastMessageAt
 * desc) in firestore.indexes.json — without it this fails with
 * `failed-precondition` rather than returning nothing, which is why the error
 * path reports empty instead of hanging.
 *
 * Bounded, like every other listener in this codebase: an unbounded
 * onSnapshot on a growing collection re-reads every document on every change.
 */
export function watchChats(
  uid: string,
  cb: (chats: Chat[]) => void,
  max = 50,
): () => void {
  if (!firebaseConfigured()) {
    cb([]);
    return () => {};
  }

  return onSnapshot(
    query(
      collection(firestore(), CHATS),
      where("participants", "array-contains", uid),
      orderBy("lastMessageAt", "desc"),
      fsLimit(max),
    ),
    (snap) => cb(snap.docs.map((d) => toChat(d.id, d.data()))),
    () => cb([]),
  );
}

/** One chat, live. The thread needs participants, unread and typing from it. */
export function watchChat(chatId: string, cb: (chat: Chat | null) => void): () => void {
  if (!firebaseConfigured()) {
    cb(null);
    return () => {};
  }

  return onSnapshot(
    chatRef(chatId),
    (snap) => cb(snap.exists() ? toChat(snap.id, snap.data()) : null),
    () => cb(null),
  );
}

/**
 * Live messages, oldest first.
 *
 * Queried newest-first and reversed in memory. Ordering ascending with a limit
 * would pin the listener to the OLDEST messages in the thread, which is the
 * wrong end; descending-then-reverse keeps the window on the newest `max` and
 * stays on a single-field index, so there is no composite index to deploy.
 */
export function watchMessages(
  chatId: string,
  cb: (messages: ChatMessage[]) => void,
  max = 100,
): () => void {
  if (!firebaseConfigured()) {
    cb([]);
    return () => {};
  }

  return onSnapshot(
    query(messagesRef(chatId), orderBy("createdAt", "desc"), fsLimit(max)),
    (snap) =>
      cb(
        snap.docs
          // hasPendingWrites is true until the server acknowledges the write.
          // It is the only honest source for the single-tick state.
          .map((d) => toMessage(d.id, d.data(), d.metadata.hasPendingWrites))
          .reverse(),
      ),
    () => cb([]),
  );
}

// -------------------------------------------------------------------- sending

/** Everything a send needs about where it is going. */
export type ChatTarget = {
  chatId: string;
  senderId: string;
  /** Copied from the parent chat onto the message. */
  participants: string[];
};

/** Preview text for the chat list when a message has no words of its own. */
const MEDIA_PREVIEW: Record<Exclude<ChatMessageKind, "text">, string> = {
  voice: "Voice note",
  image: "Photo",
  file: "File",
};

/**
 * Write a message and update its chat's denormalised state in one batch.
 *
 * Batched so the thread and the chat list can never disagree: a message
 * without its preview shows an empty row in the list, and a preview without
 * its message shows a chat that opens blank. Both are possible with two
 * separate writes and neither is recoverable from the client.
 *
 * `unread` is incremented for everyone except the sender, which is also what
 * makes group chat work here without a second code path.
 */
async function commitMessage(
  target: ChatTarget,
  messageId: string,
  message: {
    kind: ChatMessageKind;
    text: string;
    mediaPath?: string | null;
    durationSec?: number | null;
  },
): Promise<void> {
  const batch = writeBatch(firestore());

  batch.set(doc(messagesRef(target.chatId), messageId), {
    senderId: target.senderId,
    participants: target.participants,
    kind: message.kind,
    text: message.text,
    mediaPath: message.mediaPath ?? null,
    durationSec: message.durationSec ?? null,
    transcript: null,
    createdAt: serverTimestamp(),
    // The sender has obviously read their own message. Seeding it here keeps
    // the "has everyone read this" test a plain length comparison.
    readBy: [target.senderId],
  });

  const chatPatch: Record<string, unknown> = {
    lastMessage:
      message.kind === "text" ? message.text : MEDIA_PREVIEW[message.kind],
    lastMessageAt: serverTimestamp(),
    // Sending is proof of not typing. Zero rather than deleteField(): it is
    // always older than the TTL, so it reads as "not typing" without needing a
    // second field-level operation.
    [`typing.${target.senderId}`]: 0,
  };

  for (const uid of target.participants) {
    if (uid !== target.senderId) chatPatch[`unread.${uid}`] = increment(1);
  }

  batch.update(chatRef(target.chatId), chatPatch);

  await batch.commit();
}

export async function sendText(target: ChatTarget, text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  await commitMessage(target, doc(messagesRef(target.chatId)).id, {
    kind: "text",
    text: trimmed,
  });
}

/**
 * Upload media, then write the message that points at it.
 *
 * The message id is minted locally first so the Storage path can contain it:
 * `chat-media/{chatId}/{messageId}` makes every object traceable to exactly
 * one message, which is what lets the chat's participant list be the only
 * thing that governs access to the file.
 *
 * Upload before write, never the reverse. A write that lands first would show
 * a message whose media 404s; an upload that lands first and then fails to
 * write leaves an orphaned object, which costs a few KB and nothing else.
 */
async function uploadThenCommit(
  target: ChatTarget,
  blob: Blob,
  message: { kind: ChatMessageKind; text: string; durationSec?: number | null },
): Promise<void> {
  const messageId = doc(messagesRef(target.chatId)).id;
  const path = `${CHAT_MEDIA}/${target.chatId}/${messageId}`;

  await uploadBytes(storageRef(firebaseStorage(), path), blob, {
    contentType: blob.type || "application/octet-stream",
  });

  await commitMessage(target, messageId, { ...message, mediaPath: path });
}

export async function sendVoiceNote(
  target: ChatTarget,
  audio: Blob,
  durationSec: number,
): Promise<void> {
  await uploadThenCommit(target, audio, {
    kind: "voice",
    // Readable stand-in wherever the player cannot run — a notification, the
    // chat list, or a screen reader reaching the bubble before the audio.
    text: `Voice note · ${formatDuration(durationSec)}`,
    durationSec: Math.max(1, Math.round(durationSec)),
  });
}

export async function sendImage(target: ChatTarget, image: Blob): Promise<void> {
  await uploadThenCommit(target, image, { kind: "image", text: "Photo" });
}

/**
 * Fetch chat media as a blob URL.
 *
 * `getBlob()` rather than `getDownloadURL()` on purpose. A download URL embeds
 * a token and is a capability: it works for anyone who ever sees it, from any
 * browser, regardless of storage.rules, for as long as the token lives. For a
 * voice note in a therapy conversation that is not an acceptable trade.
 * `getBlob()` is an authenticated read, so the `chat-media/` rule is actually
 * enforced on every fetch.
 *
 * getBlob is an XHR carrying an Authorization header, so it needs the bucket
 * to answer a CORS preflight. Checked on 2026-10-03: the
 * firebasestorage.googleapis.com endpoint the SDK uses replies to OPTIONS
 * with `Access-Control-Allow-Origin: *` and allows the Authorization header,
 * so this works with no bucket CORS configuration. Worth re-checking if we
 * ever address the bucket through storage.googleapis.com, which does not.
 *
 * Callers must revoke the URL they get back; see VoiceNotePlayer.
 */
export async function chatMediaUrl(mediaPath: string): Promise<string> {
  const blob = await getBlob(storageRef(firebaseStorage(), mediaPath));
  return URL.createObjectURL(blob);
}

// ------------------------------------------------------------ read receipts

/**
 * Mark the thread read: clear this person's unread counter and add them to
 * `readBy` on the messages they just saw.
 *
 * Takes the messages the caller already has rather than querying for them.
 * The live listener has paid for those reads already, and re-reading the
 * thread on every open would roughly double the cost of opening a chat.
 * Firestore also cannot express "where readBy does not contain me", so a
 * query would fetch them all and filter in memory anyway.
 *
 * Writes nothing when there is nothing to change, so this is safe to call on
 * every snapshot.
 */
export async function markRead(
  chatId: string,
  uid: string,
  messages: ChatMessage[],
  unreadCount = 1,
): Promise<void> {
  if (!firebaseConfigured()) return;

  const unseen = messages.filter(
    (m) => !m.pending && m.senderId !== uid && !m.readBy.includes(uid),
  );
  if (unseen.length === 0 && unreadCount === 0) return;

  const batch = writeBatch(firestore());

  for (const message of unseen) {
    batch.update(doc(messagesRef(chatId), message.id), {
      // arrayUnion, not a rewritten array: two people opening the thread at
      // the same time would otherwise each overwrite the other's receipt.
      readBy: arrayUnion(uid),
    });
  }

  if (unreadCount !== 0) {
    batch.update(chatRef(chatId), { [`unread.${uid}`]: 0 });
  }

  await batch.commit();
}

/** True once every other participant has opened the message. */
export function isReadByAll(message: ChatMessage): boolean {
  return message.participants.every((uid) => message.readBy.includes(uid));
}

// ------------------------------------------------------------------- typing

/**
 * Last time this client wrote a typing signal, per chat. Module-level rather
 * than React state because it must survive re-renders without causing them.
 */
const lastTypingWrite = new Map<string, number>();

/**
 * Say "still typing".
 *
 * Call it freely on every keystroke — the throttle inside is what keeps that
 * from becoming a write per character. Failures are swallowed: a missing
 * typing indicator is not worth surfacing an error over, and the write can
 * legitimately fail when the chat has just been deleted underneath us.
 */
export async function setTyping(chatId: string, uid: string): Promise<void> {
  if (!firebaseConfigured()) return;

  const now = Date.now();
  const previous = lastTypingWrite.get(chatId) ?? 0;
  if (now - previous < TYPING_WRITE_GAP_MS) return;
  lastTypingWrite.set(chatId, now);

  try {
    await updateDoc(chatRef(chatId), { [`typing.${uid}`]: now });
  } catch {
    // Non-essential signal — never let it break sending.
  }
}

/** Stop claiming to be typing. Used when the composer empties or unmounts. */
export async function clearTyping(chatId: string, uid: string): Promise<void> {
  if (!firebaseConfigured()) return;
  lastTypingWrite.delete(chatId);
  try {
    await updateDoc(chatRef(chatId), { [`typing.${uid}`]: 0 });
  } catch {
    // As above.
  }
}

/**
 * Who, other than you, is typing right now.
 *
 * Two clocks drive this, and both are needed. The snapshot tells us when
 * somebody last typed; a local interval re-evaluates the TTL, because when a
 * typist simply stops, no new snapshot ever arrives — the document does not
 * change — and an indicator driven by snapshots alone would stay up until the
 * next unrelated write. That is the bug this interval exists to prevent.
 */
export function watchTyping(
  chatId: string,
  selfUid: string,
  cb: (uids: string[]) => void,
): () => void {
  if (!firebaseConfigured()) {
    cb([]);
    return () => {};
  }

  let typing: Record<string, number> = {};
  let last = "";

  const emit = () => {
    const now = Date.now();
    const active = Object.entries(typing)
      .filter(([uid, at]) => uid !== selfUid && now - at < TYPING_TTL_MS)
      .map(([uid]) => uid)
      .sort();

    // Only call back on an actual change, so a 1s tick does not re-render the
    // thread once a second for ever.
    const key = active.join(",");
    if (key === last) return;
    last = key;
    cb(active);
  };

  const unsubscribe = onSnapshot(
    chatRef(chatId),
    (snap) => {
      typing = snap.exists() ? numberMap(snap.data().typing) : {};
      emit();
    },
    () => {
      typing = {};
      emit();
    },
  );

  const timer = setInterval(emit, 1_000);

  return () => {
    unsubscribe();
    clearInterval(timer);
  };
}

// ------------------------------------------------------------------ helpers

/** m:ss. Used for voice-note length in both the player and the preview text. */
export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/** The other person in a 1:1 chat. Null in a group, where there is no "other". */
export function otherParticipant(chat: Chat, selfUid: string): string | null {
  const others = chat.participants.filter((uid) => uid !== selfUid);
  return others.length === 1 ? others[0] : null;
}

/**
 * The name stored on the chat for someone, if there is one.
 *
 * This is the only name a provider can get for a patient — see `names` on
 * Chat — and for a patient it saves a profile read on a list of twenty rows.
 * A live lookup still wins where it is available, because a name that has
 * since changed is right there; this is the floor, not the source of truth.
 */
export function nameOf(chat: Chat, uid: string | null): string | null {
  if (!uid) return null;
  return chat.names[uid] ?? null;
}

/**
 * Whether a chat is a group. Decided by the group having somebody who set it
 * up, not by how many are in it: a group somebody has left can be down to two
 * and is still a group, at a generated id, with its own history.
 */
export function isGroupChat(chat: Chat): boolean {
  return chat.group !== null;
}

/**
 * Leave a group. Anybody may, always — nobody is kept in a room. What was
 * said while you were there stays readable to you (each message carries its
 * own copy of who was in the room); nothing said after reaches you.
 */
export async function leaveGroup(chatId: string, uid: string): Promise<void> {
  await updateDoc(chatRef(chatId), {
    participants: arrayRemove(uid),
    [`unread.${uid}`]: deleteField(),
    [`typing.${uid}`]: deleteField(),
  });
}

/**
 * The provider who set a group up takes somebody out of it — the one power a
 * peer group needs somebody to hold. firestore.rules refuses it from anyone
 * else.
 */
export async function removeFromGroup(chatId: string, uid: string): Promise<void> {
  await leaveGroup(chatId, uid);
}

/**
 * What a conversation is called in a list or a header.
 *
 * A group session by its title; a two-person chat by the other person, which
 * the caller resolves (it may need a profile lookup), so this returns null
 * for that case rather than guessing.
 */
export function groupTitle(chat: Chat): string | null {
  if (!isGroupChat(chat)) return null;
  return chat.title || (chat.group === "peer" ? "Peer group" : "Group session");
}

/** Unread count for one person, tolerating the field being absent. */
export function unreadFor(chat: Chat, uid: string): number {
  const count = chat.unread[uid];
  return typeof count === "number" && count > 0 ? count : 0;
}
