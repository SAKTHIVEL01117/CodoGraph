"use client";

/**
 * CodoGraph — Client-side active organization synchronizer.
 *
 * Ensures that the organization resolved on the server is made active in the
 * browser's Clerk session. Once setActive({ organization: activeOrgId })
 * resolves, the Clerk session token rotates and includes the org_id and org_role
 * claims in its JWT payload for Supabase and Postgres RLS.
 */
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useOrganization, useClerk } from "@clerk/nextjs";

export function OrgSync({ activeOrgId }: { activeOrgId: string | null }) {
  const router = useRouter();
  const { organization, isLoaded } = useOrganization();
  const clerk = useClerk();
  const syncAttempted = useRef<string | null>(null);

  useEffect(() => {
    if (!clerk.loaded || !isLoaded || !activeOrgId) return;
    if (organization?.id === activeOrgId) return;
    if (syncAttempted.current === activeOrgId) return;

    syncAttempted.current = activeOrgId;
    clerk
      .setActive({ organization: activeOrgId })
      .then(() => {
        router.refresh();
      })
      .catch((err) => {
        console.warn("[CodoGraph] Organization sync warning:", err);
      });
  }, [clerk, isLoaded, organization, activeOrgId, router]);

  return null;
}
