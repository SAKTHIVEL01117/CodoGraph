"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { About } from "@/components/About";
import { Products } from "@/components/Products";
import { SplashScreen } from "@/components/SplashScreen";

export default function LandingPage() {
  const router = useRouter();
  // Server and initial client render must match identically to prevent hydration errors
  const [showSplash, setShowSplash] = useState(false);

  useEffect(() => {
    // Safe client-only check after hydration has completed cleanly
    try {
      const alreadyShown = sessionStorage.getItem("codograph_splash_shown") === "1";
      if (!alreadyShown) {
        setShowSplash(true);
      }
    } catch {}

    router.prefetch("/sign-in");
    router.prefetch("/sign-up");
  }, [router]);

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
