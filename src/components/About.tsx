import React from 'react';
import { ChevronRight } from 'lucide-react';
import { useReveal } from '@/hooks/useReveal';

interface AboutProps {
  onGetStarted?: () => void;
}

export const About: React.FC<AboutProps> = ({ onGetStarted }) => {
  const [sectionRef, isVisible] = useReveal(0.1);

  const handleGetStartedClick = () => {
    if (onGetStarted) {
      onGetStarted();
    } else {
      const el = document.getElementById('products');
      el?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section
      id="about"
      ref={sectionRef}
      className="relative w-full min-h-screen overflow-hidden bg-[#f0eded] z-10 pointer-events-auto"
    >
      {/* Background Cloud Video */}
      <video
        autoPlay
        loop
        muted
        playsInline
        poster="/assets/aeris/aeris-about-poster.webp"
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover pointer-events-none mix-blend-multiply opacity-85"
      >
        <source src="/assets/aeris/aeris-about-clouds.mp4" type="video/mp4" />
      </video>

      {/* Overlay Content */}
      <div className="relative min-h-screen max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pt-28 pb-10 sm:pb-16 flex flex-col justify-between">
        {/* Top-Left Content */}
        <div className="flex flex-col items-start max-w-xs sm:max-w-sm">
          <p
            style={{ animationDelay: '100ms' }}
            className={`font-jetbrains text-xs sm:text-sm text-black/80 leading-relaxed mb-6 transition-all ${
              isVisible ? 'animate-fade-up opacity-0' : 'opacity-0'
            }`}
          >
            CodoGraph translates a living codebase map into a shared picture of what is changing, where, and why it matters.
          </p>

          <div
            style={{ animationDelay: '250ms' }}
            className={`transition-all ${isVisible ? 'animate-fade-up opacity-0' : 'opacity-0'}`}
          >
            <button
              onClick={handleGetStartedClick}
              aria-label="Get Started"
              className="group flex items-center bg-white rounded-xl shadow-sm p-1.5 pr-4 pl-2 text-xs sm:text-sm font-jetbrains text-black hover:bg-white/95 active:scale-[0.98] transition-all focus-visible:ring-2 focus-visible:ring-[#F64302] outline-none"
            >
              <span className="w-11 h-11 rounded-lg bg-black flex items-center justify-center mr-3 transition-colors">
                <ChevronRight className="w-4 h-4 text-white transition-transform duration-200 group-hover:translate-x-0.5" />
              </span>
              <span className="font-medium">Get Started</span>
            </button>
          </div>
        </div>

        {/* Bottom Row */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 pt-12">
          {/* Left headline */}
          <div
            style={{ animationDelay: '400ms' }}
            className={`max-w-md font-jetbrains text-2xl sm:text-3xl md:text-4xl text-black font-medium leading-snug transition-all ${
              isVisible ? 'animate-fade-up opacity-0' : 'opacity-0'
            }`}
          >
            Meet CodoGraph. Built to <span className="text-black/40">read the atmosphere</span> and <span className="text-black">make change legible</span>.
          </div>

          {/* Right headline */}
          <div
            style={{ animationDelay: '550ms' }}
            className={`max-w-lg md:text-right text-left font-jetbrains text-xl sm:text-2xl md:text-3xl font-medium leading-snug text-black transition-all ${
              isVisible ? 'animate-fade-up opacity-0' : 'opacity-0'
            }`}
          >
            Follow dependency connections and understand how <span className="text-black/40">small shifts</span> become <span className="font-bold text-black">shared conditions</span>.
          </div>
        </div>
      </div>
    </section>
  );
};
