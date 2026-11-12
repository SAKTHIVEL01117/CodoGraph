/**
 * CodoGraph — Next.js 16 proxy (replaces deprecated middleware.ts convention).
 *
 * Uses @clerk/nextjs clerkMiddleware to enforce authentication on all protected routes.
 * Public routes: landing page ('/'), auth routes ('/sign-in', '/sign-up'), and webhooks ('/api/webhook').
 * Protected routes: '/workspace', '/analysis/[id]', '/team', and private API endpoints.
 */
import { NextResponse } from 'next/server';
import { clerkMiddleware } from '@clerk/nextjs/server';

function isPublicRoute(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname === '/sign-in' ||
    pathname.startsWith('/sign-in/') ||
    pathname === '/sign-up' ||
    pathname.startsWith('/sign-up/') ||
    pathname === '/api/webhook' ||
    pathname.startsWith('/api/webhook/')
  );
}

function getClockSkewInMs(): number {
  const configured = Number(process.env.CLERK_CLOCK_SKEW_MS);
  if (Number.isFinite(configured) && configured >= 0) {
    return configured;
  }

  const isDevClerkInstance =
    process.env.NODE_ENV !== 'production' ||
    (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '').startsWith('pk_test_') ||
    (process.env.CLERK_SECRET_KEY ?? '').startsWith('sk_test_');

  // Match @clerk/backend's 24h handshake skew allowance for development instances so
  // short-lived (60s) session JWTs do not enter a refresh loop on skewed local clocks.
  return isDevClerkInstance ? 86_400_000 : 60_000;
}

const handler = clerkMiddleware(
  async (auth, request) => {
    const { pathname } = request.nextUrl;

    if (
      pathname.startsWith('/assets') ||
      pathname.startsWith('/fonts') ||
      pathname.endsWith('.mp4') ||
      pathname.endsWith('.webm')
    ) {
      return NextResponse.next();
    }

    if (!isPublicRoute(pathname)) {
      const session = await auth({ treatPendingAsSignedOut: false });
      if (!session.userId) {
        if (pathname.startsWith('/api/')) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return session.redirectToSignIn();
      }
    }
  },
  {
    clockSkewInMs: getClockSkewInMs(),
  }
);

// Next.js 16 supports either default export or named `proxy` export
export default handler;
export const proxy = handler;

export const config = {
  matcher: [
    // Skip Next.js internals, static assets, and media files to eliminate streaming bottlenecks
    '/((?!_next|assets|fonts|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|otf|eot|ico|csv|docx?|xlsx?|zip|webmanifest|mp4|webm|ogv|avif)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
