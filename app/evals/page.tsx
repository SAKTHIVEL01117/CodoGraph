/**
 * CodoGraph — Phase 11: Evals Dashboard Page (Server Component).
 *
 * Scoped by Clerk authentication and active organization context.
 */
import React from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { OrgSync } from '@/components/org-sync';
import { EvalsView } from '@/components/evals/evals-view';

export const dynamic = 'force-dynamic';

export default async function EvalsPage() {
  const sessionAuth = await auth({ treatPendingAsSignedOut: false });
  if (!sessionAuth.userId) {
    redirect('/sign-in');
  }

  const ctx = await resolveOrgContext(true);
  if (!ctx.isAuthenticated || !ctx.userId) {
    redirect('/sign-in');
  }

  return (
    <>
      <OrgSync activeOrgId={ctx.orgId} />
      <EvalsView initialOrgId={ctx.orgId} />
    </>
  );
}

