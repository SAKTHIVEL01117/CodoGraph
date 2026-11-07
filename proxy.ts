/**
 * CodoGraph — Next.js 16 proxy (replaces deprecated middleware.ts convention).
 *
 * Uses @clerk/nextjs clerkMiddleware to enforce edge authentication.
 * Public routes: landing page ('/'), auth routes ('/sign-in', '/sign-up'), and webhooks ('/api/webhook').
 * Protected routes: '/workspace', '/team', '/settings', '/projects', and private API endpoints.
 *
 * Automatically detects and cleanses stale/expired session cookies from previous Clerk instances
 * to prevent infinite handshake redirect loops when keys change in .env.local.
 */
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhook(.*)',
  '/assets(.*)',
  '/fonts(.*)',
]);

function isStaleSession(cookieValue: string | undefined): boolean {
  if (!cookieValue) return false;
  try {
    const parts = cookieValue.split('.');
    if (parts.length < 2) return false;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));

    // Check token expiration
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return true;
    }

    // Check if token was issued by a different Clerk instance
    const pubKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    if (pubKey) {
      const rawB64 = pubKey.replace('pk_test_', '').replace('pk_live_', '');
      const expectedHost = Buffer.from(rawB64, 'base64').toString('utf8').replace('$', '');
      if (payload.iss && !payload.iss.includes(expectedHost)) {
        return true;
      }
    }
  } catch {
    return true;
  }
  return false;
}

const baseHandler = clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

const proxyHandler = async (request: NextRequest, event: any) => {
  const { pathname } = request.nextUrl;

  // Immediate fast-path: completely bypass auth overhead for static assets and media streams
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/assets') ||
    pathname.startsWith('/fonts') ||
    pathname.endsWith('.mp4') ||
    pathname.endsWith('.webm') ||
    pathname.endsWith('.webp') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.jpeg') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.woff2') ||
    pathname.endsWith('.woff')
  ) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get('__session')?.value;
  const isStale = isStaleSession(sessionCookie);

  if (isStale) {
    // Strip the stale cookie so Clerk does not enter a refresh redirect loop
    request.cookies.delete('__session');
    request.cookies.delete('__client_uat');
  }

  const response = await baseHandler(request, event);

  // If stale, ensure the browser also drops the cookie
  if (isStale && response instanceof NextResponse) {
    response.cookies.delete('__session');
    response.cookies.delete('__client_uat');
  }

  return response;
};

// Next.js 16 supports either default export or named `proxy` export
export default proxyHandler;
export const proxy = proxyHandler;

export const config = {
  matcher: [
    // Skip Next.js internals, static assets, and media files to eliminate streaming bottlenecks
    '/((?!_next|assets|fonts|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|otf|eot|ico|csv|docx?|xlsx?|zip|webmanifest|mp4|webm|ogv|avif)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
