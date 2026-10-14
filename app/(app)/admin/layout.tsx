"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import LogoLoader from "@/components/ui/LogoLoader";
import { homeFor } from "@/lib/routing";

/**
 * Every staff page, behind one check: the signed-in person's role is exactly
 * "admin". Anyone else is sent to their own home, quietly — a patient who
 * types /admin into the address bar needs no explanation, just their app.
 *
 * Inside `(app)`, so AppGate has already settled sign-in and the profile; this
 * only adds the role. It is a UX layer, not the security boundary: the data
 * behind these pages is guarded by firestore.rules and by the callables, which
 * check the role again on the server.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile, ready } = useAuth();
  const router = useRouter();
  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    if (ready && !isAdmin) router.replace(homeFor(profile));
  }, [ready, isAdmin, profile, router]);

  if (!ready) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <LogoLoader label="Checking your access" />
      </div>
    );
  }

  return isAdmin ? <>{children}</> : null;
}
