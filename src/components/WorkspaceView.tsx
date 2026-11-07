"use client";

/**
 * CodoGraph — Workspace shell (Client Component for Vite SPA).
 *
 * Uses real Clerk hooks for user identity and organization data.
 * No hardcoded fake organizations, fake org IDs, or fake user emails.
 *
 * REMOVED:
 *  - Hardcoded organizations array ["Engineering Team", "Design Systems", ...]
 *  - Fake org_2N{length}d8x9q2 ID generation
 *  - Hardcoded userEmail default 'dev@codograph.io'
 *  - Local theme state duplicating the ThemeProvider
 *
 * REPLACED WITH:
 *  - useOrganizationList() — real Clerk org list from the user's memberships
 *  - useOrganization() — active org state from Clerk
 *  - useUser() — real user profile from Clerk
 *  - useTheme() — shared theme context (no duplicate state)
 *  - useClerk() — for real signOut()
 *
 * Note: This shell is used by the Vite SPA on port 5173.
 * The Next.js App Router has its own workspace shell at:
 *   app/workspace/layout.tsx  (Clerk OrganizationSwitcher, UserButton)
 *   app/workspace/page.tsx    (SSR org resolution)
 */
import React, { useState } from 'react';
import {
  useUser,
  useOrganization,
  useOrganizationList,
  useClerk,
  OrganizationSwitcher,
  UserButton,
} from '@clerk/nextjs';
import { Layers, Users, Shield, Check, LogOut, Sun, Moon, Laptop } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';

interface WorkspaceViewProps {
  onSignOut: () => void;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({ onSignOut }) => {
  const { user, isLoaded: userLoaded } = useUser();
  const { organization: activeOrg, isLoaded: orgLoaded } = useOrganization();
  const { userMemberships } = useOrganizationList({
    userMemberships: { infinite: false },
  });
  const { signOut } = useClerk();
  const { theme, setTheme } = useTheme();

  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [inviteError, setInviteError] = useState('');

  // Loading state: wait for Clerk to hydrate
  if (!userLoaded || !orgLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center font-jetbrains text-xs text-muted-foreground">
        Loading workspace...
      </div>
    );
  }

  // If Clerk returns no user, redirect to sign-in
  if (!user) {
    onSignOut();
    return null;
  }

  const displayEmail =
    user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? '';
  const displayName =
    user.fullName ??
    user.firstName ??
    user.username ??
    displayEmail.split('@')[0] ??
    'Developer';

  const handleSignOut = async () => {
    await signOut();
    onSignOut();
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !activeOrg) return;
    setInviteStatus('sending');
    setInviteError('');

    try {
      await activeOrg.inviteMember({ emailAddress: inviteEmail, role: 'org:member' });
      setInviteStatus('sent');
      setTimeout(() => {
        setInviteStatus('idle');
        setIsInviteModalOpen(false);
        setInviteEmail('');
      }, 2000);
    } catch (err: unknown) {
      setInviteStatus('error');
      setInviteError(
        err instanceof Error ? err.message : 'Failed to send invitation. Try again.'
      );
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-jetbrains transition-colors selection:bg-[#F64302] selection:text-white">
      {/* Workspace Header */}
      <header className="border-b border-border bg-card/60 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4 sm:gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 text-[#F64302]">
              <svg
                width="24"
                height="24"
                viewBox="0 0 32 32"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-full h-full"
                aria-hidden="true"
              >
                <path d="M16 2L19 13.5L16 16L13 13.5L16 2Z" fill="currentColor" fillOpacity="0.95" />
                <path d="M16 30L13 18.5L16 16L19 18.5L16 30Z" fill="currentColor" fillOpacity="0.75" />
                <path d="M2 16L13.5 13L16 16L13.5 19L2 16Z" fill="currentColor" fillOpacity="0.85" />
                <path d="M30 16L18.5 19L16 16L18.5 13L30 16Z" fill="currentColor" fillOpacity="0.65" />
                <circle cx="16" cy="16" r="2.2" fill="currentColor" />
              </svg>
            </div>
            <span className="font-jetbrains font-bold tracking-wider text-sm hidden sm:inline text-foreground">
              CodoGraph
            </span>
          </div>

          <div className="h-4 w-[1px] bg-border" />

          {/* Real Clerk OrganizationSwitcher — handles switching, creation, and invitations */}
          <OrganizationSwitcher
            hidePersonal={false}
            appearance={{
              elements: {
                rootBox: 'flex items-center',
                organizationSwitcherTrigger:
                  'py-1.5 px-3 rounded-lg border border-border bg-secondary hover:bg-secondary/80 text-xs font-jetbrains font-medium text-foreground transition-all',
              },
            }}
          />
        </div>

        {/* Right Header: Theme Toggle + Invite + User Button */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Theme Toggle */}
          <div
            role="group"
            aria-label="Theme selection"
            className="hidden sm:inline-flex items-center p-1 rounded-lg bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 text-xs font-jetbrains"
          >
            <button
              type="button"
              onClick={() => setTheme('light')}
              aria-label="Force light theme"
              aria-pressed={theme === 'light'}
              className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all ${
                theme === 'light'
                  ? 'bg-white text-black shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              aria-label="Force dark theme"
              aria-pressed={theme === 'dark'}
              className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all ${
                theme === 'dark'
                  ? 'bg-black text-white shadow-sm dark:bg-white/20 font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setTheme('system')}
              aria-label="Follow system theme"
              aria-pressed={theme === 'system'}
              className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all ${
                theme === 'system'
                  ? 'bg-white text-black dark:bg-white/20 dark:text-white shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Laptop className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Invite button (shortcut to org switcher invite flow) */}
          {activeOrg && (
            <button
              type="button"
              onClick={() => setIsInviteModalOpen(true)}
              aria-label="Invite team member"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-secondary hover:bg-secondary/80 text-xs font-jetbrains font-medium text-foreground transition-all"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Invite</span>
            </button>
          )}

          {/* Real Clerk UserButton */}
          <UserButton
            appearance={{
              elements: {
                userButtonAvatarBox: 'w-8 h-8 rounded-full border border-border',
              },
            }}
          />

          {/* Sign-out for SPA context */}
          <button
            onClick={handleSignOut}
            aria-label="Sign out"
            title="Sign Out"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="flex-1 p-6 sm:p-8 lg:p-12 max-w-7xl w-full mx-auto font-jetbrains">
        {/* Active Organization Banner */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F64302]/10 border border-[#F64302]/20 text-[#F64302] text-xs font-medium mb-3">
            <Layers className="w-3.5 h-3.5" />
            <span>Active Organization</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bubbledot tracking-tight text-foreground">
            {activeOrg?.name ?? `${displayName}'s Workspace`}
          </h1>
          <div className="text-xs sm:text-sm text-muted-foreground mt-2 flex flex-wrap gap-3 font-mono">
            {activeOrg?.id && (
              <span>
                Org ID:{' '}
                <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">{activeOrg.id}</code>
              </span>
            )}
            <span>
              Signed in as:{' '}
              <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">{displayEmail}</code>
            </span>
          </div>
        </div>

        {/* Phase 1 Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="p-5 rounded-2xl bg-card border border-border shadow-sm flex flex-col justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Memberships
              </div>
              <div className="text-2xl font-bold font-bubbledot mt-2 text-foreground">
                {userMemberships.data?.length ?? 0}
              </div>
            </div>
            <button
              onClick={() => activeOrg && setIsInviteModalOpen(true)}
              disabled={!activeOrg}
              className="flex items-center gap-2 text-xs text-[#F64302] mt-4 pt-4 border-t border-border hover:underline text-left cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Users className="w-4 h-4" />
              <span>Invite a member to this team</span>
            </button>
          </div>

          <div className="p-5 rounded-2xl bg-card border border-border shadow-sm flex flex-col justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Identity Token
              </div>
              <div className="text-2xl font-bold font-bubbledot mt-2 text-foreground">
                Clerk JWT
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-4 pt-4 border-t border-border">
              <Shield className="w-4 h-4 text-[#F64302]" />
              <span>org_id claim forwarded to Supabase</span>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-card border border-border shadow-sm flex flex-col justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Auth Status
              </div>
              <div className="text-2xl font-bold font-bubbledot mt-2 text-foreground">
                Authenticated
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-4 pt-4 border-t border-border">
              <Check className="w-4 h-4 text-[#F64302]" />
              <span>Real Clerk session active</span>
            </div>
          </div>
        </div>

        {/* Info Container */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-bold font-bubbledot text-foreground">Workspace Shell Ready</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-2 leading-relaxed">
            Authentication is established through Clerk. Your identity, organization membership,
            and session are real — no simulated accounts. Use the organization switcher in the
            header to manage teams and send invitations. Subsequent phases will mount project
            analysis, dependency visualization, and repository exploration inside this workspace.
          </p>
        </div>
      </main>

      {/* Invite Member Modal — calls real Clerk inviteMember() API */}
      {isInviteModalOpen && activeOrg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl p-6 shadow-2xl">
            <h3 className="font-bubbledot text-xl text-foreground">Invite to {activeOrg.name}</h3>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              A real invitation email will be sent via Clerk. Accepting it brings the user to the
              CodoGraph login page and places them in this organization.
            </p>

            {inviteStatus === 'sent' ? (
              <div className="py-6 flex flex-col items-center justify-center text-center gap-2">
                <div className="w-10 h-10 rounded-full bg-[#F64302] text-white flex items-center justify-center">
                  <Check className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold text-foreground">Invitation Sent</p>
                <p className="text-[11px] text-muted-foreground">Email dispatched to {inviteEmail}</p>
              </div>
            ) : (
              <form onSubmit={handleSendInvite} className="flex flex-col gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1 text-foreground">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@company.com"
                    className="w-full px-3 py-2 text-xs bg-secondary rounded-lg border border-border text-foreground focus-visible:ring-1 focus-visible:ring-[#F64302] outline-none"
                  />
                </div>

                {inviteStatus === 'error' && (
                  <p className="text-xs text-destructive">{inviteError}</p>
                )}

                <div className="flex items-center justify-end gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsInviteModalOpen(false);
                      setInviteEmail('');
                      setInviteStatus('idle');
                      setInviteError('');
                    }}
                    className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviteStatus === 'sending'}
                    className="px-4 py-2 bg-[#F64302] text-white text-xs font-semibold rounded-lg hover:bg-[#ff4e0d] transition-all disabled:opacity-60"
                  >
                    {inviteStatus === 'sending' ? 'Sending...' : 'Send Invitation'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkspaceView;
