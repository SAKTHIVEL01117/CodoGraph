import React from 'react';
import Link from 'next/link';
import { OrganizationSwitcher, UserButton } from '@clerk/nextjs';
import { ThemeToggle } from '@/components/theme-toggle';
import { Users, LayoutDashboard, Activity } from 'lucide-react';

export default function TeamLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-jetbrains transition-colors selection:bg-primary selection:text-primary-foreground">
      {/* Shell Header */}
      <header className="border-b border-border bg-card/60 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4 sm:gap-6">
          <Link
            href="/workspace"
            className="flex items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg p-1"
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
            <span className="font-jetbrains font-bold tracking-wider text-sm hidden sm:inline text-foreground">
              CodoGraph
            </span>
          </Link>

          <div className="h-4 w-[1px] bg-border" />

          <OrganizationSwitcher
            hidePersonal={true}
            afterSelectOrganizationUrl="/team"
            afterCreateOrganizationUrl="/team"
            afterLeaveOrganizationUrl="/workspace"
            appearance={{
              elements: {
                rootBox: 'flex items-center',
                organizationSwitcherTrigger:
                  'py-1.5 px-3 rounded-lg border border-border bg-secondary hover:bg-secondary/80 text-xs font-jetbrains font-medium text-foreground transition-all',
              },
            }}
          />

          <nav className="hidden md:flex items-center gap-1 ml-2">
            <Link
              href="/workspace"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-jetbrains text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Workspace</span>
            </Link>
            <Link
              href="/evals"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-jetbrains text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Evals</span>
            </Link>
            <Link
              href="/team"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-jetbrains text-foreground bg-secondary font-medium transition-all"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Team & Members</span>
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          <ThemeToggle />
          <UserButton
            appearance={{
              elements: {
                userButtonAvatarBox: 'w-8 h-8 rounded-full border border-border',
              },
            }}
          />
        </div>
      </header>

      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
