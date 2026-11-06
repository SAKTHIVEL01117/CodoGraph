import React from 'react';
import { ChevronRight } from 'lucide-react';

interface HeroProps {
  onExplore?: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onExplore }) => {
  const handleScrollToAbout = () => {
    if (onExplore) {
      onExplore();
    } else {
      const el = document.getElementById('about');
      el?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section
      id="hero"
      className="relative w-full h-screen flex flex-col justify-between px-4 sm:px-6 lg:px-10 z-10 pointer-events-auto"
    >
      {/* Center top content */}
      <div className="max-w-7xl w-full mx-auto pt-40 sm:pt-52 flex flex-col items-start">
        {/* Eyebrow */}
        <p
          style={{ animationDelay: '300ms' }}
          className="opacity-0 animate-fade-up font-jetbrains text-xs sm:text-sm uppercase tracking-[0.3em] text-white/70 mb-10 sm:mb-16"
        >
          DEVELOPER INTELLIGENCE
        </p>

        {/* H1 Title */}
        <h1
          style={{ animationDelay: '500ms' }}
          className="opacity-0 animate-fade-up font-bubbledot text-3xl sm:text-5xl lg:text-7xl text-white leading-[0.95] tracking-tight max-w-4xl"
        >
          Understand the Code. See the Connections.
        </h1>
      </div>

      {/* Bottom row */}
      <div className="max-w-7xl w-full mx-auto pb-8 sm:pb-12 mt-auto flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        {/* Left copy */}
        <p
          style={{ animationDelay: '700ms' }}
          className="opacity-0 animate-fade-up font-jetbrains text-xs sm:text-sm text-white/60 max-w-sm leading-relaxed"
        >
          Trace code changes and file dependencies as they evolve — before complexity takes over.
        </p>

        {/* Right CTA */}
        <div style={{ animationDelay: '900ms' }} className="opacity-0 animate-fade-up">
          <button
            onClick={handleScrollToAbout}
            aria-label="Explore Your Codebase"
            className="group flex items-center bg-black text-white rounded-xl p-2 pr-5 text-xs sm:text-sm font-jetbrains hover:bg-black/80 active:scale-[0.98] transition-all focus-visible:ring-2 focus-visible:ring-[#F64302] outline-none shadow-lg"
          >
            <span className="w-11 h-11 rounded-lg bg-[#F64302] flex items-center justify-center mr-3 transition-colors">
              <ChevronRight className="w-5 h-5 text-white transition-transform duration-200 group-hover:translate-x-0.5" />
            </span>
            <span>Explore Your Codebase</span>
          </button>
        </div>
      </div>
    </section>
  );
};
