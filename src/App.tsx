/**
 * CodoGraph — Root application shell (Vite SPA, port 5173).
 *
 * Routing:
 *   'landing'   → /         Landing page with splash, navbar, hero, about, products
 *   'auth'      → /sign-in  Real Clerk sign-in/sign-up via AuthPage
 *   'workspace' → /workspace Real Clerk-authenticated workspace via WorkspaceView
 *
 * Authentication is handled entirely by Clerk inside AuthPage.
 * WorkspaceView uses Clerk hooks (useUser, useOrganization, etc.) for all data.
 * No fake identities, hardcoded emails, or simulated sessions.
 *
 * Note: The Next.js App Router (port 3000) handles the production server-side
 * routing, SSR, middleware protection, and real Clerk session management.
 * This Vite SPA is a development/preview environment only.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import { SplashScreen } from '@/components/SplashScreen';
import { Navbar } from '@/components/Navbar';
import { Hero } from '@/components/Hero';
import { About } from '@/components/About';
import { Products } from '@/components/Products';
import { AuthPage } from '@/components/AuthPage';
import { WorkspaceView } from '@/components/WorkspaceView';

type AppRoute = 'landing' | 'auth' | 'workspace';

const isAuthPath = (pathname: string, hash: string): boolean =>
  pathname.startsWith('/sign-in') ||
  pathname.startsWith('/sign-up') ||
  pathname.startsWith('/auth') ||
  hash === '#auth' ||
  hash === '#signin' ||
  hash === '#signup';

const isWorkspacePath = (pathname: string, hash: string): boolean =>
  pathname.startsWith('/workspace') || hash === '#workspace';

function deriveRoute(pathname: string, hash: string): AppRoute {
  if (isWorkspacePath(pathname, hash)) return 'workspace';
  if (isAuthPath(pathname, hash)) return 'auth';
  return 'landing';
}

interface AppProps {
  onNavigate?: (path: string) => void;
}

/**
 * Inner shell: reads the real Clerk auth state to decide whether to show
 * the workspace or redirect to auth.
 */
const AppShell: React.FC<AppProps> = ({ onNavigate }) => {
  const { isLoaded, isSignedIn } = useAuth();

  const [currentRoute, setCurrentRoute] = useState<AppRoute>(() => {
    if (typeof window !== 'undefined') {
      return deriveRoute(window.location.pathname, window.location.hash);
    }
    return 'landing';
  });

  const [splashFinished, setSplashFinished] = useState(false);

  const syncRoute = useCallback(() => {
    if (typeof window !== 'undefined') {
      setCurrentRoute(deriveRoute(window.location.pathname, window.location.hash));
    }
  }, []);

  useEffect(() => {
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
    };
  }, [syncRoute]);

  const navigateTo = useCallback(
    (route: AppRoute) => {
      const paths: Record<AppRoute, string> = {
        landing: '/',
        auth: '/sign-in',
        workspace: '/workspace',
      };
      const path = paths[route];

      if (onNavigate) {
        onNavigate(path);
      } else {
        setCurrentRoute(route);
        if (typeof window !== 'undefined') {
          window.history.pushState({}, '', path);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    },
    [onNavigate]
  );

  // Once Clerk loads: if signed in and on the auth route, bounce to workspace.
  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn && currentRoute === 'auth') {
      const timer = setTimeout(() => {
        navigateTo('workspace');
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isLoaded, isSignedIn, currentRoute, navigateTo]);

  const handleGetStarted = () => navigateTo('auth');
  const handleBackToHome = () => navigateTo('landing');

  // Workspace route: protected by Clerk — only shown to signed-in users.
  if (currentRoute === 'workspace') {
    if (isLoaded && !isSignedIn) {
      // Not authenticated: redirect to sign-in.
      navigateTo('auth');
      return null;
    }
    return <WorkspaceView onSignOut={handleBackToHome} />;
  }

  // Auth route: Clerk SignIn/SignUp via AuthPage.
  if (currentRoute === 'auth') {
    return <AuthPage onBackToHome={handleBackToHome} />;
  }

  // Landing page.
  return (
    <div className="relative min-h-screen selection:bg-[#F64302] selection:text-white">
      {/* Fixed Background Video */}
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
        <div className="absolute inset-0 bg-black/30 pointer-events-none" />
      </div>

      {!splashFinished && <SplashScreen onComplete={() => setSplashFinished(true)} />}

      <Navbar onGetStarted={handleGetStarted} />

      <Hero
        onExplore={() => {
          document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' });
        }}
      />

      <About onGetStarted={handleGetStarted} />

      <Products
        onSignalAction={() => {
          document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
        }}
      />
    </div>
  );
};

export const App: React.FC<AppProps> = (props) => {
  return <AppShell {...props} />;
};

export default App;
