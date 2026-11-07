/**
 * CodoGraph — Organization & Team Management (Server Component).
 *
 * Protected at the edge by proxy.ts and on the server by resolveOrgContext().
 * Renders Clerk's official <OrganizationProfile /> component styled with
 * CodoGraph's design system tokens, enabling:
 *  - Team member invitations by email
 *  - Role management (Admin / Member)
 *  - Viewing, revoking, and resending pending invitations
 *  - Organization settings and domain verification
 */
import React from 'react';
import { redirect } from 'next/navigation';
import { OrganizationProfile } from '@clerk/nextjs';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { OrgSync } from '@/components/org-sync';

export const instant = false;

export default async function TeamPage() {
  const ctx = await resolveOrgContext(true);

  if (!ctx.isAuthenticated || !ctx.userId) {
    redirect('/sign-in');
  }

  return (
    <div className="flex-1 p-6 sm:p-8 lg:p-12 max-w-7xl w-full mx-auto font-jetbrains">
      <OrgSync activeOrgId={ctx.orgId} />

      <div className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-bubbledot tracking-tight text-foreground">
          Team & Organization
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-2">
          Manage team members, invite collaborators via email, and configure organization roles.
        </p>
      </div>

      <div className="flex justify-center items-center py-4">
        <OrganizationProfile
          appearance={{
            variables: {
              colorPrimary: '#F64302',
              colorBackground: '#0c0d11',
              borderRadius: '0.75rem',
              fontFamily: 'JetBrains Mono, monospace',
            },
            elements: {
              card: 'bg-card border border-border rounded-3xl shadow-xl text-foreground font-jetbrains',
              navbar: 'border-b border-border',
              navbarButton: 'text-xs font-jetbrains hover:text-[#F64302]',
              headerTitle: 'font-bubbledot text-xl text-foreground',
              headerSubtitle: 'font-jetbrains text-xs text-muted-foreground',
              formButtonPrimary:
                'bg-[#F64302] hover:bg-[#ff4e0d] text-white font-jetbrains text-xs rounded-xl py-2.5 transition-all shadow-md',
              formFieldInput:
                'bg-secondary border border-border text-foreground rounded-xl text-xs font-jetbrains focus:border-[#F64302]',
            },
          }}
          routing="hash"
        />
      </div>
    </div>
  );
}
