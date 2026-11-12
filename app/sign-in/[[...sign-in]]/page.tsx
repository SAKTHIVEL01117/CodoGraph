"use client";

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { SignIn, SignOutButton, useUser, useAuth } from '@clerk/nextjs';
import { dark } from '@clerk/themes';
import { ChevronRight, LogOut, LayoutDashboard, UserCheck, Loader2 } from 'lucide-react';

function resolvePostAuthTarget(rawRedirectUrl: string | null): string {
  if (!rawRedirectUrl || typeof window === 'undefined') return '/workspace';
  try {
    const parsed = new URL(rawRedirectUrl, window.location.origin);
    if (parsed.origin !== window.location.origin) return '/workspace';
    if (
      parsed.pathname === '/' ||
      parsed.pathname === '/sign-in' ||
      parsed.pathname.startsWith('/sign-in/') ||
      parsed.pathname === '/sign-up' ||
      parsed.pathname.startsWith('/sign-up/')
    ) {
      return '/workspace';
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/workspace';
  }
}

function SignedInCard({ targetUrl }: { targetUrl: string }) {
  const { user } = useUser();
  const primaryEmail = user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress;
  const displayName = user?.fullName || user?.username || primaryEmail || 'User';

  return (
    <div className="bg-[#0c0d11]/95 backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl text-white w-full max-w-[440px] text-center">
      <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-4">
        <UserCheck className="w-6 h-6" />
      </div>

      <h2 className="font-bubbledot text-2xl text-white tracking-tight">
        Already Signed In
      </h2>

      <p className="font-jetbrains text-xs text-white/60 mt-2">
        Signed in as <strong className="text-white">{displayName}</strong>
      </p>

      {primaryEmail && (
        <p className="font-mono text-[11px] text-white/40 mt-0.5">
          {primaryEmail}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-2.5">
        <a
          href={targetUrl}
          onClick={(e) => {
            e.preventDefault();
            try {
              sessionStorage.removeItem('codograph_post_auth_hops');
            } catch {}
            window.location.assign(targetUrl);
          }}
          className="w-full bg-white hover:bg-white/90 text-black font-jetbrains font-semibold text-xs sm:text-sm rounded-xl py-3 flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Go to Workspace</span>
        </a>

        <SignOutButton redirectUrl="/sign-in">
          <button
            type="button"
            onClick={() => {
              try {
                sessionStorage.removeItem('codograph_post_auth_hops');
              } catch {}
            }}
            className="w-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-white font-jetbrains text-xs rounded-xl py-3 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            <LogOut className="w-3.5 h-3.5 text-white/60" />
            <span>Sign out / Switch account</span>
          </button>
        </SignOutButton>
      </div>
    </div>
  );
}

function SignInContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn, getToken } = useAuth({
    treatPendingAsSignedOut: false,
  });
  const [redirectBlocked, setRedirectBlocked] = useState(false);

  const isCallbackRoute = pathname.includes('/sso-callback');
  const rawRedirectUrl = searchParams.get('redirect_url');

  useEffect(() => {
    if (!isLoaded || !isSignedIn || isCallbackRoute) return;

    let cancelled = false;
    (async () => {
      // Flush active session cookie before full document navigation to workspace
      await getToken().catch(() => null);
      if (cancelled) return;

      try {
        const key = 'codograph_post_auth_hops';
        const now = Date.now();
        const raw = sessionStorage.getItem(key);
        const recent: number[] = raw
          ? (JSON.parse(raw) as unknown[]).filter(
              (ts): ts is number => typeof ts === 'number' && now - ts < 10_000
            )
          : [];

        if (recent.length >= 2) {
          setRedirectBlocked(true);
          return;
        }

        sessionStorage.setItem(key, JSON.stringify([...recent, now]));
      } catch {
        // Proceed with navigation if sessionStorage is unavailable
      }

      const target = resolvePostAuthTarget(rawRedirectUrl);
      window.location.assign(target);
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, isCallbackRoute, rawRedirectUrl, getToken]);

  if (!isLoaded) {
    return (
      <div className="min-h-[460px] w-full flex items-center justify-center text-xs text-white/50">
        Loading sign in...
      </div>
    );
  }

  if (isSignedIn && !isCallbackRoute) {
    if (redirectBlocked) {
      return <SignedInCard targetUrl={resolvePostAuthTarget(rawRedirectUrl)} />;
    }

    return (
      <div className="bg-[#0c0d11]/95 backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl text-white w-full max-w-[440px] min-h-[220px] flex flex-col items-center justify-center gap-3 text-center">
        <Loader2 className="w-5 h-5 animate-spin text-[#F64302]" />
        <p className="font-jetbrains text-xs text-white/70">
          Redirecting to workspace...
        </p>
      </div>
    );
  }

  return (
    <SignIn
      appearance={{
        theme: dark,
        variables: {
          colorPrimary: '#F64302',
          colorPrimaryForeground: '#000000',
          colorBackground: '#0c0d11',
          colorInput: '#13151b',
          colorInputForeground: '#ffffff',
          colorForeground: '#ffffff',
          colorNeutral: '#ffffff',
          borderRadius: '0.75rem',
          fontFamily: 'JetBrains Mono, monospace',
        },
        elements: {
          card: 'bg-[#0c0d11]/95 backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl text-white w-full',
          headerTitle: 'font-bubbledot text-2xl text-white tracking-tight',
          headerSubtitle: 'font-jetbrains text-xs text-white/60',
          socialButtonsRoot: 'flex items-center justify-center gap-3 w-full',
          socialButtonsIconButton:
            'w-full h-11 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 rounded-xl text-white transition-all active:scale-[0.98] flex items-center justify-center',
          socialButtonsBlockButton:
            'w-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 rounded-xl text-white font-jetbrains text-xs transition-all active:scale-[0.98]',
          socialButtonsBlockButtonText: 'font-jetbrains text-xs text-white font-medium',
          dividerRow: 'my-4',
          dividerLine: 'bg-white/10',
          dividerText: 'text-white/40 font-jetbrains text-xs px-2',
          formFieldLabel: 'text-white/90 font-jetbrains text-xs font-medium mb-1.5 block',
          formFieldInput:
            'bg-[#13151b] border border-white/10 text-white rounded-xl text-xs sm:text-sm font-jetbrains placeholder:text-white/30 focus:border-[#F64302]/60 focus:ring-1 focus:ring-[#F64302]/60 h-11',
          formFieldHintText: 'text-white/40 font-jetbrains text-[11px]',
          formFieldErrorText: 'text-red-400 font-jetbrains text-xs mt-1',
          formButtonPrimary:
            'bg-white hover:bg-white/90 text-black font-jetbrains font-semibold text-xs sm:text-sm rounded-xl py-3 active:scale-[0.98] transition-all shadow-md mt-2',
          footer: 'border-t border-white/5 pt-4 mt-6',
          footerAction: 'flex items-center justify-center gap-1.5 text-xs',
          footerActionText: 'text-white/70 font-jetbrains text-xs',
          footerActionLink: 'text-[#F64302] hover:text-[#ff4e0d] font-jetbrains text-xs font-semibold hover:underline',
          identityPreview: 'bg-[#13151b] border border-white/10 rounded-xl p-2.5 text-white',
          identityPreviewText: 'text-white font-jetbrains text-xs',
          identityPreviewEditButton: 'text-[#F64302] hover:text-[#ff4e0d] text-xs font-semibold',
          formHeaderTitle: 'text-white font-bubbledot text-xl',
          formHeaderSubtitle: 'text-white/60 font-jetbrains text-xs',
          otpCodeFieldInput: 'bg-[#13151b] border border-white/15 text-white rounded-lg font-jetbrains text-lg',
        },
      }}
      routing="path"
      path="/sign-in"
      signUpUrl="/sign-up"
      fallbackRedirectUrl="/workspace"
    />
  );
}

export default function SignInPage() {
  return (
    <div className="relative min-h-screen w-full bg-[#050507] text-white font-jetbrains overflow-hidden flex flex-col justify-between selection:bg-[#F64302] selection:text-white">
      {/* Background Video */}
      <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
        <video
          autoPlay
          loop
          muted
          playsInline
          poster="/assets/aeris/aeris-hero-poster.webp"
          className="w-full h-full object-cover"
        >
          <source src="/assets/aeris/aeris-hero-atmosphere.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-black/60 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/60 pointer-events-none" />
      </div>

      {/* Decorative SVG Topographic contours in bottom-left */}
      <div className="absolute -bottom-10 -left-10 w-[600px] h-[450px] pointer-events-none z-10 opacity-35" aria-hidden="true">
        <svg viewBox="0 0 600 450" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
          <path d="M-50 400C120 380 220 320 320 380C420 440 500 350 650 390" stroke="#505560" strokeWidth="1" strokeOpacity="0.5" />
          <path d="M-50 350C100 320 200 280 290 320C380 360 480 300 650 340" stroke="#505560" strokeWidth="1" strokeOpacity="0.4" />
          <path d="M-50 300C80 270 180 230 260 270C340 310 440 250 650 290" stroke="#505560" strokeWidth="1" strokeOpacity="0.3" />
          <path d="M-50 250C60 220 150 190 230 220C310 250 400 200 650 240" stroke="#505560" strokeWidth="1" strokeOpacity="0.25" />
        </svg>
      </div>

      {/* Scattered Ambient Glowing Orange Sensor Nodes */}
      <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden" aria-hidden="true">
        <div className="absolute bottom-28 left-20">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-[1px] bg-gradient-to-r from-transparent via-[#F64302]/70 to-transparent" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-16 w-[1px] bg-gradient-to-b from-transparent via-[#F64302]/70 to-transparent" />
          <div className="w-4 h-4 bg-[#F64302] rounded-[2px] shadow-[0_0_16px_#F64302]" />
        </div>
        <div className="absolute top-44 left-[18%] w-2 h-2 bg-[#F64302] rounded-[1px] shadow-[0_0_8px_#F64302] opacity-80" />
        <div className="absolute top-36 left-[30%] w-2.5 h-2.5 bg-[#F64302] rounded-[1px] shadow-[0_0_10px_#F64302]" />
        <div className="absolute top-60 left-[32%] w-1.5 h-1.5 bg-[#F64302]/70 rounded-[1px]" />
        <div className="absolute top-80 left-[52%] w-2.5 h-2.5 bg-[#F64302] rounded-[1px] shadow-[0_0_10px_#F64302]" />
        <div className="absolute bottom-40 left-[49%] w-2 h-2 bg-[#F64302] rounded-[1px] shadow-[0_0_8px_#F64302]" />
        <div className="absolute bottom-32 left-[55%] w-2.5 h-2.5 bg-[#F64302] rounded-[1px] shadow-[0_0_10px_#F64302]" />
        <div className="absolute top-1/2 right-12 w-2.5 h-2.5 bg-[#F64302] rounded-[1px] shadow-[0_0_10px_#F64302]" />
        <div className="absolute bottom-24 right-20 w-1.5 h-1.5 bg-[#F64302]/60 rounded-[1px]" />
      </div>

      {/* Top Header Row */}
      <header className="relative z-20 w-full max-w-7xl mx-auto px-6 lg:px-12 pt-8 flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="w-8 h-8 text-white">
            <svg
              width="32"
              height="32"
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
          <span className="font-jetbrains font-bold tracking-widest text-sm text-white">
            CodoGraph
          </span>
        </div>

        <Link
          href="/"
          className="group flex items-center bg-[#111216]/80 hover:bg-[#1a1c22] border border-white/10 rounded-xl p-1.5 pr-4 pl-1.5 text-xs font-jetbrains text-white transition-all active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#F64302] outline-none shadow-sm"
        >
          <span className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center mr-3 transition-colors group-hover:bg-white/20">
            <ChevronRight className="w-4 h-4 text-white transition-transform duration-200 group-hover:translate-x-0.5" />
          </span>
          <span>Back to Home</span>
        </Link>
      </header>

      {/* Main Content: Two Column Editorial Grid */}
      <main className="relative z-20 w-full max-w-7xl mx-auto px-6 lg:px-12 py-10 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Left Column: Editorial Headline & Subtitle */}
        <div className="lg:col-span-6 flex flex-col justify-center">
          <h1 className="font-bubbledot text-4xl sm:text-6xl lg:text-7xl leading-[1.02] tracking-tight">
            <span className="block text-white">Map Your</span>
            <span className="block text-white">Codebase.</span>
            <span className="block text-[#808590]">
              Understand More<span className="text-[#F64302]">.</span>
            </span>
          </h1>

          <p className="font-jetbrains text-sm sm:text-base text-white/60 mt-8 leading-relaxed max-w-md">
            Sign in to explore interactive code maps, visualize dependencies, and uncover insights.
          </p>
        </div>

        {/* Right Column: Clerk Sign In Component */}
        <div className="lg:col-span-6 flex justify-center lg:justify-end">
          <div className="relative w-full max-w-[440px] flex flex-col items-center">
            {/* Crosshair Reticle above card */}
            <div className="absolute -top-3 left-8 z-30 pointer-events-none">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-[1px] bg-gradient-to-r from-transparent via-[#F64302] to-transparent" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-12 w-[1px] bg-gradient-to-b from-transparent via-[#F64302] to-transparent" />
              <div className="w-3.5 h-3.5 bg-[#F64302] rounded-[1px] shadow-[0_0_12px_#F64302]" />
            </div>

            <div className="w-full flex justify-center">
              <Suspense fallback={<div className="min-h-[460px] w-full flex items-center justify-center text-xs text-white/50">Loading sign in...</div>}>
                <SignInContent />
              </Suspense>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-20 py-4" />
    </div>
  );
}
