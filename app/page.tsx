"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { About } from "@/components/About";
import { Products } from "@/components/Products";
import { SplashScreen } from "@/components/SplashScreen";
import { WorkspaceDashboard } from "@/components/workspace-dashboard";

export default function RootPage() {
  const router = useRouter();
  const { isSignedIn, isLoaded: isAuthLoaded } = useAuth();
  const [showSplash, setShowSplash] = useState(false);

  useEffect(() => {
    // Safe client-only check after hydration has completed cleanly
    try {
      const alreadyShown = sessionStorage.getItem("codograph_splash_shown") === "1";
      if (!alreadyShown) {
        queueMicrotask(() => {
          setShowSplash(true);
        });
      }
    } catch {}

    router.prefetch("/sign-in");
    router.prefetch("/sign-up");
  }, [router]);

  // When signed in, http://localhost:3000 renders the workspace directly matching reference
  if (isAuthLoaded && isSignedIn) {
    return <WorkspaceDashboard />;
  }

  const handleGetStarted = () => {
    router.push("/sign-in");
  };

  const handleSplashComplete = () => {
    try {
      sessionStorage.setItem("codograph_splash_shown", "1");
    } catch {}
    setShowSplash(false);
  };

  return (
    <div className="relative min-h-screen selection:bg-[#F64302] selection:text-white">
      {/* Fixed Ambient Background Video */}
      <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          poster="/assets/aeris/aeris-hero-poster.webp"
          className="w-full h-full object-cover"
        >
          <source src="/assets/aeris/aeris-hero-atmosphere.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-black/30 pointer-events-none" />
      </div>

      {showSplash && <SplashScreen onComplete={handleSplashComplete} />}

      <Navbar onGetStarted={handleGetStarted} />

      <Hero
        onExplore={() => {
          document.getElementById("about")?.scrollIntoView({ behavior: "smooth" });
        }}
      />

      <About onGetStarted={handleGetStarted} />

      <Products
        onSignalAction={() => {
          document.getElementById("products")?.scrollIntoView({ behavior: "smooth" });
        }}
      />
    </div>
  );
}
