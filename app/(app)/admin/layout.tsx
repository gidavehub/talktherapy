"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import LogoLoader from "@/components/ui/LogoLoader";
import { homeFor } from "@/lib/routing";
import { ensureAdminClaim } from "@/lib/adminOps-client";

/**
 * Every staff page, behind one check: the signed-in person's role is exactly
 * "admin". Anyone else is sent to their own home, quietly — a patient who
 * types /admin into the address bar needs no explanation, just their app.
 *
 * Inside `(app)`, so AppGate has already settled sign-in and the profile; this
 * only adds the role. It is a UX layer, not the security boundary: the data
 * behind these pages is guarded by firestore.rules and by the callables, which
 * check the role again on the server.
 *
 * Once a session it also makes sure the staff member's sign-in carries the
 * `admin` claim, before the pages render: Storage rules read the claim, not
 * the role, so a token minted before somebody was made staff would be
 * refused the provider documents and site images these pages show. When the
 * token already has it, that check is local and instant.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, ready } = useAuth();
  const router = useRouter();
  const isAdmin = profile?.role === "admin";
  /** Whose sign-in has been checked for the claim. */
  const [claimChecked, setClaimChecked] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !isAdmin) router.replace(homeFor(profile));
  }, [ready, isAdmin, profile, router]);

  useEffect(() => {
    if (!ready || !isAdmin || !user) return;
    let live = true;
    void ensureAdminClaim(user).then(() => {
      if (live) setClaimChecked(user.uid);
    });
    return () => {
      live = false;
    };
  }, [ready, isAdmin, user]);

  if (!ready || (isAdmin && claimChecked !== user?.uid)) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <LogoLoader label="Checking your access" />
      </div>
    );
  }

  return isAdmin ? <>{children}</> : null;
}
