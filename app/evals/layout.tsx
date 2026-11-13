import React from 'react';
import Link from 'next/link';
import { OrganizationSwitcher, UserButton } from '@clerk/nextjs';
import { ThemeToggle } from '@/components/theme-toggle';
import { LayoutDashboard, Users, Activity } from 'lucide-react';

export default function EvalsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-jetbrains transition-colors selection:bg-primary selection:text-primary-foreground">
      {/* Shell Header */}
      <header className="border-b border-border bg-card/85 backdrop-blur-xl sticky top-0 z-40 px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3 sm:gap-4">
          <Link
            href="/workspace"
            className="flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg p-1"
          >
            <div className="w-6 h-6 text-primary">
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
            <span className="font-jetbrains font-bold tracking-tight text-sm hidden sm:inline text-foreground">
              codograph
            </span>
          </Link>

          <span className="text-muted-foreground/50 text-xs font-mono select-none">/</span>

          <OrganizationSwitcher
            hidePersonal={true}
            afterSelectOrganizationUrl="/evals"
            afterCreateOrganizationUrl="/evals"
            afterLeaveOrganizationUrl="/workspace"
            appearance={{
              elements: {
                rootBox: 'flex items-center',
                organizationSwitcherTrigger:
                  'py-1 px-2.5 rounded-lg border border-border bg-secondary/50 hover:bg-secondary text-xs font-jetbrains font-medium text-foreground transition-all gap-2',
                organizationPreviewAvatarBox:
                  'w-4 h-4 rounded text-[10px] bg-primary/15 border border-primary/30 text-primary font-bold flex items-center justify-center',
                organizationPreviewTextContainer: 'text-xs text-foreground font-medium',
              },
            }}
          />

          <nav className="flex items-center gap-1.5 ml-2">
            <Link
              href="/workspace"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-secondary/30 hover:bg-secondary text-xs font-jetbrains text-muted-foreground hover:text-foreground transition-colors"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Workspace</span>
            </Link>

            <Link
              href="/evals"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-primary/40 bg-primary/10 text-xs font-jetbrains text-primary font-semibold transition-colors"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Evals</span>
            </Link>

            <Link
              href="/team"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-secondary/30 hover:bg-secondary text-xs font-jetbrains text-muted-foreground hover:text-foreground transition-colors"
            >
              <Users className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Team</span>
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <UserButton
            appearance={{
              elements: {
                userButtonAvatarBox: 'w-7 h-7 rounded-full border border-border shadow-xs',
              },
            }}
          />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}

