"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { motion } from "motion/react";
import { SPRING_SOFT } from "../motion/primitives";
import { Input, Textarea, Select } from "../ui/Input";
import Button from "../ui/Button";
import { Alert } from "../ui/Feedback";
import { useAuth } from "../AuthProvider";
import { firebaseConfigured, firestore } from "../../lib/firebase";
import { COLLECTIONS, SUPPORT_TOPIC_LABELS, type SupportTopic } from "../../lib/models";

/**
 * Contact form.
 *
 * Writes straight to Firestore rather than through a mail service, because the
 * rule for `supportRequests` is create-only: anyone can submit, nobody can read
 * the queue back. That keeps a contact form working with no backend and no way
 * for one submitter to read another's message.
 *
 * `?intent=organisation` preselects the topic, so the CTA on the institutions
 * page lands people somewhere that already understands why they are here.
 */

const TOPICS = Object.entries(SUPPORT_TOPIC_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export default function SupportForm() {
  const params = useSearchParams();
  const { user, profile } = useAuth();

  const intent = params.get("intent");
  const [topic, setTopic] = useState<SupportTopic>(
    intent === "organisation" ? "organisation" : "general",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      if (!firebaseConfigured()) {
        throw new Error("Messaging is temporarily unavailable. Please try again later.");
      }

      await addDoc(collection(firestore(), COLLECTIONS.supportRequests), {
        name: name.trim(),
        email: email.trim(),
        topic,
        message: message.trim(),
        userId: user?.uid ?? null,
        status: "new",
        createdAt: serverTimestamp(),
      });

      setSent(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "We could not send that. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={SPRING_SOFT}
      >
        <Alert tone="success" title="Message received">
          Thank you — we have your message and will reply by email. If this is
          about something urgent and safety-related, please also see our crisis
          contacts page rather than waiting for a reply.
        </Alert>
        <div className="mt-6">
          <Button variant="secondary" withArrow={false} onClick={() => setSent(false)}>
            Send another message
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5 max-w-[560px]">
      <Select
        label="What is this about?"
        value={topic}
        onChange={(e) => setTopic(e.target.value as SupportTopic)}
        options={TOPICS}
      />

      <Input
        label="Your name"
        required
        value={name || profile?.displayName || ""}
        onChange={(e) => setName(e.target.value)}
        autoComplete="name"
      />

      <Input
        label="Email"
        type="email"
        required
        value={email || user?.email || ""}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        hint="We will only use this to reply to you."
      />

      <Textarea
        label="Message"
        required
        rows={6}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={4900}
        hint="Please do not include sensitive health details here — this is a general inbox, not a counselling session."
      />

      {error ? <Alert tone="warning">{error}</Alert> : null}

      <Button type="submit" loading={busy} disabled={busy} withArrow={false}>
        Send message
      </Button>
    </form>
  );
}
