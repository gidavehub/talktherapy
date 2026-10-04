"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../components/AuthProvider";
import { openChat } from "./chat";
import type { ProviderProfile } from "./models";

/**
 * Choosing a provider puts you in the conversation with them.
 *
 * Not on their profile page. The whole point of the intake is the hand-off to
 * a person, and a brochure page in between — with the Message button below a
 * bio somebody may not be able to read — is a page nobody asked for. This is
 * the single way in, used by the voice surface, the dashboard and the
 * suggestions list, so the three cannot drift apart.
 *
 * Both names are written onto the chat as it is opened. That is the only
 * moment anyone can read both: the provider's from the public directory, the
 * patient's from their own profile. Without it the provider opens a thread
 * that cannot say who is in it.
 */
export function useOpenProvider() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [opening, setOpening] = useState<string | null>(null);

  const open = useCallback(
    async (provider: Pick<ProviderProfile, "uid" | "displayName">) => {
      if (!user) {
        router.push(`/sign-in?next=${encodeURIComponent(`/providers/${provider.uid}`)}`);
        return;
      }

      setOpening(provider.uid);
      // The name Talk was given in the conversation wins over the one on the
      // account: it is what this person asked to be called.
      const mine = profile?.intake?.preferredName || profile?.displayName;

      try {
        const chatId = await openChat(user.uid, provider.uid, {
          ...(mine ? { [user.uid]: mine } : {}),
          ...(provider.displayName ? { [provider.uid]: provider.displayName } : {}),
        });
        router.push(`/chats/${chatId}`);
      } catch {
        // Their profile has a Message button that does the same thing and can
        // explain itself if it fails again. Going nowhere is the one outcome
        // worth avoiding.
        router.push(`/providers/${provider.uid}`);
        setOpening(null);
      }
    },
    [profile, router, user],
  );

  return { open, opening };
}
