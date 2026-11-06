import React, { useState, useEffect } from 'react';
import { ChevronRight, Menu, X } from 'lucide-react';

interface NavbarProps {
  onGetStarted?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onGetStarted }) => {
  const [isScrolledPastHero, setIsScrolledPastHero] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('Overview');

  useEffect(() => {
    const handleScroll = () => {
      const heroThreshold = window.innerHeight * 0.7;
      setIsScrolledPastHero(window.scrollY > heroThreshold);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Lock body overflow when mobile menu is open
  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileOpen]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileOpen) {
        setIsMobileOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileOpen]);

  const navItems = [
    { label: 'Overview', targetId: 'hero' },
    { label: 'Codebase Explorer', targetId: 'about' },
    { label: 'Insights', targetId: 'products' },
  ];

  const handleNavClick = (label: string, targetId: string) => {
    setActiveTab(label);
    setIsMobileOpen(false);

    const elem = document.getElementById(targetId);
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleGetStartedClick = () => {
    setIsMobileOpen(false);
    if (onGetStarted) {
      onGetStarted();
    } else {
      const el = document.getElementById('products');
      el?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-50 px-4 sm:px-6 lg:px-10 py-4 transition-colors duration-300"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Left Mark: CodoGraph abstract four-wing wind-rose SVG */}
          <a
            href="#hero"
            aria-label="CodoGraph Home"
            onClick={(e) => {
              e.preventDefault();
              handleNavClick('Overview', 'hero');
            }}
            className="flex items-center gap-3.5 focus-visible:ring-2 focus-visible:ring-[#F64302] rounded-lg p-1 outline-none transition-colors"
          >
            <div
              className={`w-8 h-8 transition-colors duration-300 ${
                isScrolledPastHero ? 'text-black' : 'text-white'
              }`}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 32 32"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-full h-full"
                aria-hidden="true"
              >
                {/* Original aerodynamic 4-wing wind-rose */}
                <path
                  d="M16 2L19 13.5L16 16L13 13.5L16 2Z"
                  fill="currentColor"
                  fillOpacity="0.95"
                />
                <path
                  d="M16 30L13 18.5L16 16L19 18.5L16 30Z"
                  fill="currentColor"
                  fillOpacity="0.75"
                />
                <path
                  d="M2 16L13.5 13L16 16L13.5 19L2 16Z"
                  fill="currentColor"
                  fillOpacity="0.85"
                />
                <path
                  d="M30 16L18.5 19L16 16L18.5 13L30 16Z"
                  fill="currentColor"
                  fillOpacity="0.65"
                />
                <circle cx="16" cy="16" r="2.2" fill="currentColor" />
              </svg>
            </div>
            <span
              className={`font-jetbrains font-bold tracking-widest text-sm transition-colors duration-300 ${
                isScrolledPastHero ? 'text-black' : 'text-white'
              }`}
            >
              CodoGraph
            </span>
          </a>

          {/* Center Desktop Navigation: Pill hidden below lg */}
          <nav
            aria-label="Main Navigation"
            className="hidden lg:flex items-center bg-white rounded-lg p-1 shadow-md border border-black/5"
          >
            {navItems.map((item) => {
              const isActive = activeTab === item.label;
              return (
                <button
                  key={item.label}
                  onClick={() => handleNavClick(item.label, item.targetId)}
                  className={`px-4 py-1.5 text-xs font-jetbrains font-medium rounded-md transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[#F64302] outline-none ${
                    isActive
                      ? 'bg-black text-white shadow-sm'
                      : 'text-black/70 hover:text-black hover:bg-black/5'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Right Desktop CTA: Get Started */}
          <div className="hidden lg:flex items-center">
            <button
              onClick={handleGetStartedClick}
              className="group flex items-center bg-black text-white rounded-lg p-1.5 pr-4 pl-2 text-xs font-jetbrains hover:bg-black/90 active:scale-[0.98] transition-all focus-visible:ring-2 focus-visible:ring-[#F64302] outline-none shadow-sm"
            >
              <span className="w-9 h-9 rounded bg-white/10 flex items-center justify-center mr-3 transition-colors group-hover:bg-white/20">
                <ChevronRight className="w-4 h-4 text-white transition-transform duration-200 group-hover:translate-x-0.5" />
              </span>
              <span>Get Started</span>
            </button>
          </div>

          {/* Mobile Hamburger Button */}
          <div className="flex lg:hidden items-center">
            <button
              type="button"
              onClick={() => setIsMobileOpen((prev) => !prev)}
              aria-label={isMobileOpen ? 'Close Menu' : 'Open Menu'}
              aria-expanded={isMobileOpen}
              aria-controls="mobile-menu"
              className={`w-10 h-10 rounded-lg flex items-center justify-center backdrop-blur-md border transition-all duration-300 focus-visible:ring-2 focus-visible:ring-[#F64302] outline-none ${
                isScrolledPastHero && !isMobileOpen
                  ? 'bg-black/5 text-black border-black/10'
                  : 'bg-white/15 text-white border-white/20'
              }`}
            >
              <div className="relative w-5 h-5 flex items-center justify-center">
                <Menu
                  className={`w-5 h-5 absolute transition-all duration-300 transform ${
                    isMobileOpen ? 'opacity-0 rotate-90 scale-75' : 'opacity-100 rotate-0 scale-100'
                  }`}
                />
                <X
                  className={`w-5 h-5 absolute transition-all duration-300 transform ${
                    isMobileOpen ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-75'
                  }`}
                />
              </div>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <div
        id="mobile-menu"
        aria-hidden={!isMobileOpen}
        className={`fixed inset-0 z-40 bg-black/95 backdrop-blur-lg flex flex-col justify-between px-6 pt-24 pb-8 transition-opacity duration-700 cubic-bezier(0.16,1,0.3,1) lg:hidden ${
          isMobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex flex-col gap-2 mt-4">
          {navItems.map((item, i) => {
            const isActive = activeTab === item.label;
            const staggerDelay = isMobileOpen ? 150 + i * 70 : (navItems.length - i) * 30;
            return (
              <button
                key={item.label}
                onClick={() => handleNavClick(item.label, item.targetId)}
                style={{
                  transitionDelay: `${staggerDelay}ms`,
                }}
                className={`w-full flex items-center justify-between p-4 text-2xl font-jetbrains text-left rounded-xl transition-all duration-300 focus-visible:ring-2 focus-visible:ring-[#F64302] outline-none ${
                  isActive
                    ? 'text-white bg-white/10'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <span>{item.label}</span>
                {isActive && <ChevronRight className="w-5 h-5 text-white" />}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col items-center gap-4 mt-auto">
          <button
            onClick={handleGetStartedClick}
            className="w-full py-4 bg-white text-black font-jetbrains font-medium text-sm rounded-xl active:scale-[0.98] transition-transform hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-[#F64302] outline-none shadow-lg text-center"
          >
            Get Started
          </button>
          <p className="text-white/30 text-xs font-jetbrains text-center">
            Developer intelligence for the places people build.
          </p>
        </div>
      </div>
    </>
  );
};
