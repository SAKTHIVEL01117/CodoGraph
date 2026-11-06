import React, { useState, useEffect } from 'react';
import { SplashScreen } from '@/components/SplashScreen';
import { Navbar } from '@/components/Navbar';
import { Hero } from '@/components/Hero';
import { About } from '@/components/About';
import { Products } from '@/components/Products';
import { AuthPage } from '@/components/AuthPage';

export const App: React.FC = () => {
  const [currentRoute, setCurrentRoute] = useState<'landing' | 'auth'>('landing');
  const [splashFinished, setSplashFinished] = useState(false);

  useEffect(() => {
    // Check initial hash route
    if (typeof window !== 'undefined') {
      if (window.location.hash === '#auth' || window.location.hash === '#signup' || window.location.hash === '#signin') {
        setCurrentRoute('auth');
      }

      const handleHashChange = () => {
        if (window.location.hash === '#auth' || window.location.hash === '#signup' || window.location.hash === '#signin') {
          setCurrentRoute('auth');
        } else {
          setCurrentRoute('landing');
        }
      };

      window.addEventListener('hashchange', handleHashChange);
      return () => window.removeEventListener('hashchange', handleHashChange);
    }
  }, []);

  const handleGetStarted = () => {
    setCurrentRoute('auth');
    if (typeof window !== 'undefined') {
      window.location.hash = '#auth';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBackToHome = () => {
    setCurrentRoute('landing');
    if (typeof window !== 'undefined') {
      window.location.hash = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (currentRoute === 'auth') {
    return <AuthPage onBackToHome={handleBackToHome} />;
  }

  return (
    <div className="relative min-h-screen selection:bg-[#F64302] selection:text-white">
      {/* 1. Fixed Background Video Layer */}
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
        {/* Absolute black overlay at 30% opacity */}
        <div className="absolute inset-0 bg-black/30 pointer-events-none" />
      </div>

      {/* 2. Conditional Splash Screen */}
      {!splashFinished && (
        <SplashScreen onComplete={() => setSplashFinished(true)} />
      )}

      {/* 3. Navbar */}
      <Navbar onGetStarted={handleGetStarted} />

      {/* 4. Hero */}
      <Hero
        onExplore={() => {
          const el = document.getElementById('about');
          el?.scrollIntoView({ behavior: 'smooth' });
        }}
      />

      {/* 5. About */}
      <About onGetStarted={handleGetStarted} />

      {/* 6. Products */}
      <Products
        onSignalAction={() => {
          const el = document.getElementById('products');
          el?.scrollIntoView({ behavior: 'smooth' });
        }}
      />
    </div>
  );
};

export default App;
