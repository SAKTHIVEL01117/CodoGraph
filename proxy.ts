/**
 * CodoGraph — Next.js 16 proxy (replaces deprecated middleware.ts convention).
 *
 * Uses @clerk/nextjs clerkMiddleware to enforce authentication.
 * Public routes: landing page ('/'), auth routes ('/sign-in', '/sign-up'), and webhooks ('/api/webhook').
 * Protected routes: '/workspace', '/team', '/settings', '/projects', and private API endpoints.
 */
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/preview(.*)',
  '/api/webhook(.*)',
  '/assets(.*)',
  '/fonts(.*)',
]);

const handler = clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    // For protected routes, inspect auth state
    const session = await auth();
    // In production or when session exists, protect route; in development, allow client
    // useAuth() fallback to resolve browser cookies without causing a localhost redirect loop
    if (!session.userId && process.env.NODE_ENV === 'production') {
      await auth.protect();
    }
  }
});

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
