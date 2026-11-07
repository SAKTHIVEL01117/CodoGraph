/**
 * CodoGraph — Workspace page (Server Component).
 *
 * Protected at the edge by Next.js 16 proxy (proxy.ts) and verified here on the server.
 * Uses centralized resolveOrgContext() to resolve or auto-provision the team organization.
 * Mounts OrgSync to synchronize active organization state to client-side Clerk session claims.
 */
import React from 'react';
import { redirect } from 'next/navigation';
import { Users, Shield, Layers, CheckCircle } from 'lucide-react';
import { resolveOrgContext } from '@/lib/auth/org-context';
import { OrgSync } from '@/components/org-sync';
import { syncUserToSupabase } from '@/lib/supabase/sync-user';

// Next.js 16: opt out of static prerendering so it reads the live session
export const instant = false;

export default async function WorkspacePage() {
  const ctx = await resolveOrgContext(true);

  if (!ctx.isAuthenticated || !ctx.userId) {
    redirect('/sign-in');
  }

  // Best-effort sync of authenticated Clerk user profile into Supabase Postgres
  await syncUserToSupabase().catch(() => {});

  const activeOrgName = ctx.orgName || 'Your Workspace';
  const activeOrgId = ctx.orgId;
  const activeOrgSlug = ctx.orgSlug;
  const activeOrgRole = ctx.orgRole || 'org:admin';

  return (
    <div className="flex-1 p-6 sm:p-8 lg:p-12 max-w-7xl w-full mx-auto font-jetbrains">
      {/* Synchronize active org to browser session for Clerk token rotation */}
      <OrgSync activeOrgId={activeOrgId} />

      {/* Active Organization Banner */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F64302]/10 border border-[#F64302]/20 text-[#F64302] text-xs font-medium mb-3">
          <Layers className="w-3.5 h-3.5" />
          <span>Active Organization</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-bubbledot tracking-tight text-foreground">
          {activeOrgName}
        </h1>

        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground font-mono">
          <span>
            Org ID:{' '}
            <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">
              {activeOrgId || 'Not assigned'}
            </code>
          </span>
          {activeOrgSlug && (
            <span>
              Slug:{' '}
              <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">
                {activeOrgSlug}
              </code>
            </span>
          )}
          <span>
            Role:{' '}
            <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">
              {activeOrgRole}
            </code>
          </span>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="p-5 rounded-2xl bg-card border border-border shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Team Members
            </div>
            <div className="text-2xl font-bold font-bubbledot mt-2 text-foreground">Active</div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-4 pt-4 border-t border-border">
            <Users className="w-4 h-4 text-[#F64302]" />
            <span>Manage & invite via organization switcher</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-card border border-border shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Identity Claims
            </div>
            <div className="text-2xl font-bold font-bubbledot mt-2 text-foreground">Clerk JWT</div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-4 pt-4 border-t border-border">
            <Shield className="w-4 h-4 text-[#F64302]" />
            <span>org_id claim forwarded to Supabase RLS</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-card border border-border shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Auth Provider
            </div>
            <div className="text-2xl font-bold font-bubbledot mt-2 text-foreground">Clerk SSO</div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-4 pt-4 border-t border-border">
            <CheckCircle className="w-4 h-4 text-[#F64302]" />
            <span>Native Clerk + Supabase integration</span>
          </div>
        </div>
      </div>

      {/* Architecture info */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-bold font-bubbledot text-foreground">
          Production-Grade Authentication Verified
        </h2>
        <ul className="mt-3 space-y-2 text-xs sm:text-sm text-muted-foreground leading-relaxed list-none">
          <li className="flex items-start gap-2">
            <span className="text-[#F64302] mt-0.5 shrink-0">→</span>
            <span>
              <strong className="text-foreground">Identity authority:</strong> Clerk issues and verifies all
              identities (Google, GitHub, Microsoft, and Email).
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#F64302] mt-0.5 shrink-0">→</span>
            <span>
              <strong className="text-foreground">Session ownership:</strong> Clerk owns the session exclusively.
              Supabase operates with <code className="bg-muted px-1 rounded text-[11px]">persistSession: false</code> — no conflicting session cookies.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#F64302] mt-0.5 shrink-0">→</span>
            <span>
              <strong className="text-foreground">Organization context:</strong> Active organization ID and role are
              carried inside the Clerk JWT claims and resolved server-side.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#F64302] mt-0.5 shrink-0">→</span>
            <span>
              <strong className="text-foreground">Route protection:</strong> Next.js 16 proxy intercepts unauthenticated requests
              with a 307 redirect before HTML rendering.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
