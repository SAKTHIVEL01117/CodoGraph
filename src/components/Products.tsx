import React from 'react';
import { ChevronRight } from 'lucide-react';
import { useReveal } from '@/hooks/useReveal';

interface ProductsProps {
  onSignalAction?: () => void;
}

export const Products: React.FC<ProductsProps> = ({ onSignalAction }) => {
  const [sectionRef, isVisible] = useReveal(0.1);

  const handleAction = () => {
    if (onSignalAction) {
      onSignalAction();
    } else {
      const el = document.getElementById('products');
      el?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section
      id="products"
      ref={sectionRef}
      className="w-full min-h-screen md:h-screen bg-[#E8E5E9] p-2 sm:p-3 relative z-10 pointer-events-auto flex flex-col justify-center"
    >
      <div className="w-full h-full max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-3 flex-1">
        {/* COLUMN 1: Architecture / Image card */}
        <div
          style={{ animationDelay: '100ms' }}
          className={`relative rounded-2xl overflow-hidden min-h-[500px] md:min-h-0 md:h-full flex flex-col justify-between p-5 sm:p-6 transition-all ${
            isVisible ? 'animate-scale-in opacity-0' : 'opacity-0'
          }`}
        >
          {/* Absolute Background Topography Image */}
          <img
            src="/assets/aeris/aeris-trace-topography.webp"
            alt="Monochrome topographic field with layered dependency contours"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          />

          {/* Top content */}
          <div
            style={{ animationDelay: '300ms' }}
            className={`relative z-10 flex flex-col items-start transition-all ${
              isVisible ? 'animate-fade-up opacity-0' : 'opacity-0'
            }`}
          >
            <span className="font-bubbledot text-5xl sm:text-6xl text-black/80">01</span>
            <p className="font-jetbrains text-xs sm:text-sm text-black/70 mt-4 leading-relaxed max-w-xs">
              A field layer for uncovering code patterns and connections across complex repositories.
            </p>
          </div>

          {/* Bottom stack */}
          <div className="relative z-10 flex flex-col gap-2 mt-auto">
            {/* Pale bar card */}
            <div
              style={{ animationDelay: '450ms' }}
              className={`bg-[#EBE8EB] rounded-xl pl-4 py-2 pr-2 flex items-center justify-between transition-all ${
                isVisible ? 'animate-fade-up opacity-0' : 'opacity-0'
              }`}
            >
              <span className="font-jetbrains text-[12px] sm:text-sm text-black font-medium pr-2">
                From scattered files to one connected codebase map.
              </span>
              <button
                type="button"
                onClick={handleAction}
                aria-label="Navigate connected codebase map"
                className="w-11 h-11 bg-black rounded-lg flex items-center justify-center shrink-0 group hover:bg-black/85 active:scale-[0.98] transition-all focus-visible:ring-2 focus-visible:ring-[#F64302] outline-none"
              >
                <ChevronRight className="w-4 h-4 text-white transition-transform duration-200 group-hover:translate-x-0.5" />
              </button>
            </div>

            {/* 5-column row */}
            <div className="grid grid-cols-5 gap-2">
              {/* Left col-span-3 */}
              <div
                style={{ animationDelay: '550ms' }}
                className={`col-span-3 bg-[#EBE8EB] rounded-xl p-4 flex flex-col justify-between transition-all ${
                  isVisible ? 'animate-fade-up opacity-0' : 'opacity-0'
                }`}
              >
                <p className="font-jetbrains text-[11px] sm:text-xs text-black/80 leading-relaxed">
                  The question is not what changed first, but what the whole field is becoming.
                </p>
                <div className="font-bubbledot text-4xl sm:text-5xl lg:text-6xl text-black mt-3">
                  Architecture
                </div>
              </div>

              {/* Right col-span-2 */}
              <div
                style={{ animationDelay: '650ms' }}
                className={`col-span-2 bg-[#EBE8EB] rounded-xl p-4 flex flex-col justify-end items-end transition-all ${
                  isVisible ? 'animate-fade-up opacity-0' : 'opacity-0'
                }`}
              >
                <span className="font-bubbledot text-4xl sm:text-5xl lg:text-6xl text-black">
                  W/04
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* COLUMN 2: Current / Video card */}
        <div
          style={{ animationDelay: '250ms' }}
          className={`relative rounded-2xl overflow-hidden min-h-[500px] md:min-h-0 md:h-full flex flex-col justify-between p-6 sm:p-8 transition-all ${
            isVisible ? 'animate-scale-in opacity-0' : 'opacity-0'
          }`}
        >
          {/* Absolute Background Video */}
          <video
            autoPlay
            loop
            muted
            playsInline
            poster="/assets/aeris/aeris-sensor-poster.webp"
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          >
            <source src="/assets/aeris/aeris-sensor-field.mp4" type="video/mp4" />
          </video>

          {/* Dark overlay for legibility */}
          <div className="absolute inset-0 bg-black/55 pointer-events-none" aria-hidden="true" />

          {/* Top content */}
          <div
            style={{ animationDelay: '450ms' }}
            className={`relative z-10 flex flex-col items-start transition-all ${
              isVisible ? 'animate-fade-up opacity-0' : 'opacity-0'
            }`}
          >
            <p className="font-jetbrains text-xs sm:text-sm text-white/70 leading-relaxed">
              CodoGraph analyzes repository structure, file dependencies, and code relationships together — helping developers understand the system, not just individual files.
            </p>
            <p className="font-jetbrains text-xs sm:text-sm text-white/70 mt-4 leading-relaxed">
              Live codebase insights become a shared language for developers, teams, and architects.
            </p>
            <span className="font-bubbledot text-5xl sm:text-6xl text-white mt-8">
              C/01
            </span>
          </div>

          {/* Bottom 48px orange rounded-xl square */}
          <div
            style={{ animationDelay: '600ms' }}
            className={`relative z-10 flex items-center justify-start mt-auto transition-all ${
              isVisible ? 'animate-fade-up opacity-0' : 'opacity-0'
            }`}
          >
            <button
              type="button"
              onClick={handleAction}
              aria-label="Explore live insights"
              className="w-12 h-12 bg-[#F64302] rounded-xl flex items-center justify-center group active:scale-[0.98] transition-all hover:bg-[#ff4e0d] focus-visible:ring-2 focus-visible:ring-white outline-none shadow-md"
            >
              <ChevronRight className="w-5 h-5 text-white transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>

        {/* COLUMN 3: Lens / White container */}
        <div
          style={{ animationDelay: '400ms' }}
          className={`bg-white rounded-2xl p-2 sm:p-3 flex flex-col gap-2 sm:gap-3 min-h-[500px] md:min-h-0 md:h-full transition-all ${
            isVisible ? 'animate-scale-in opacity-0' : 'opacity-0'
          }`}
        >
          {/* Top block */}
          <div className="flex-1 flex flex-col gap-2 min-h-0">
            {/* Video tile */}
            <div
              style={{ animationDelay: '550ms' }}
              className={`relative rounded-xl overflow-hidden flex-1 min-h-[160px] transition-all ${
                isVisible ? 'animate-fade-in opacity-0' : 'opacity-0'
              }`}
            >
              <video
                autoPlay
                loop
                muted
                playsInline
                poster="/assets/aeris/aeris-radar-poster.webp"
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              >
                <source src="/assets/aeris/aeris-radar-close.mp4" type="video/mp4" />
              </video>
            </div>

            {/* Same pale bar treatment as Column 1 */}
            <div
              style={{ animationDelay: '650ms' }}
              className={`bg-[#EBE8EB] rounded-xl pl-4 py-2 pr-2 flex items-center justify-between transition-all ${
                isVisible ? 'animate-fade-up opacity-0' : 'opacity-0'
              }`}
            >
              <span className="font-jetbrains text-[12px] sm:text-sm text-black font-medium pr-2">
                From scattered files to one connected codebase.
              </span>
              <button
                type="button"
                onClick={handleAction}
                aria-label="View connected codebase"
                className="w-11 h-11 bg-black rounded-lg flex items-center justify-center shrink-0 group hover:bg-black/85 active:scale-[0.98] transition-all focus-visible:ring-2 focus-visible:ring-[#F64302] outline-none"
              >
                <ChevronRight className="w-4 h-4 text-white transition-transform duration-200 group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>

          {/* Bottom row */}
          <div
            style={{ animationDelay: '750ms' }}
            className={`flex-1 bg-[#EBE8EB] rounded-xl p-5 sm:p-6 flex flex-col justify-end transition-all ${
              isVisible ? 'animate-fade-up opacity-0' : 'opacity-0'
            }`}
          >
            <span className="font-bubbledot text-5xl sm:text-6xl text-black">
              L/01
            </span>
            <p className="font-jetbrains text-xl sm:text-2xl text-black font-medium leading-snug mt-3">
              See what individual files cannot reveal.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
