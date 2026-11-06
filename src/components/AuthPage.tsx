import React, { useState } from 'react';
import { Mail, ChevronRight, Lock } from 'lucide-react';

interface AuthPageProps {
  onBackToHome: () => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onBackToHome }) => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // UI only - no real authentication
  };

  return (
    <div className="relative min-h-screen w-full bg-[#050507] text-white font-jetbrains overflow-hidden flex flex-col justify-between selection:bg-[#F64302] selection:text-white">
      {/* Background Video */}
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
        {/* Dark vignette overlay */}
        <div className="absolute inset-0 bg-black/60 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/60 pointer-events-none" />
      </div>

      {/* Decorative SVG Topographic contours in bottom-left */}
      <div className="absolute -bottom-10 -left-10 w-[600px] h-[450px] pointer-events-none z-10 opacity-35" aria-hidden="true">
        <svg viewBox="0 0 600 450" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
          <path d="M-50 400C120 380 220 320 320 380C420 440 500 350 650 390" stroke="#505560" strokeWidth="1" strokeOpacity="0.5" />
          <path d="M-50 350C100 320 200 280 290 320C380 360 480 300 650 340" stroke="#505560" strokeWidth="1" strokeOpacity="0.4" />
          <path d="M-50 300C80 270 180 230 260 270C340 310 440 250 650 290" stroke="#505560" strokeWidth="1" strokeOpacity="0.3" />
          <path d="M-50 250C60 220 150 190 230 220C310 250 400 200 650 240" stroke="#505560" strokeWidth="1" strokeOpacity="0.25" />
        </svg>
      </div>

      {/* Scattered Ambient Glowing Orange Sensor Nodes matching the reference */}
      <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden" aria-hidden="true">
        {/* Bottom Left crosshair node */}
        <div className="absolute bottom-28 left-20">
          {/* Crosshair reticle lines */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-[1px] bg-gradient-to-r from-transparent via-[#F64302]/70 to-transparent" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-16 w-[1px] bg-gradient-to-b from-transparent via-[#F64302]/70 to-transparent" />
          <div className="w-4 h-4 bg-[#F64302] rounded-[2px] shadow-[0_0_16px_#F64302]" />
        </div>

        {/* Scattered small glowing orange blocks */}
        <div className="absolute top-44 left-[18%] w-2 h-2 bg-[#F64302] rounded-[1px] shadow-[0_0_8px_#F64302] opacity-80" />
        <div className="absolute top-36 left-[30%] w-2.5 h-2.5 bg-[#F64302] rounded-[1px] shadow-[0_0_10px_#F64302]" />
        <div className="absolute top-60 left-[32%] w-1.5 h-1.5 bg-[#F64302]/70 rounded-[1px]" />
        <div className="absolute top-80 left-[52%] w-2.5 h-2.5 bg-[#F64302] rounded-[1px] shadow-[0_0_10px_#F64302]" />
        <div className="absolute bottom-40 left-[49%] w-2 h-2 bg-[#F64302] rounded-[1px] shadow-[0_0_8px_#F64302]" />
        <div className="absolute bottom-32 left-[55%] w-2.5 h-2.5 bg-[#F64302] rounded-[1px] shadow-[0_0_10px_#F64302]" />
        <div className="absolute top-1/2 right-12 w-2.5 h-2.5 bg-[#F64302] rounded-[1px] shadow-[0_0_10px_#F64302]" />
        <div className="absolute bottom-24 right-20 w-1.5 h-1.5 bg-[#F64302]/60 rounded-[1px]" />
      </div>

      {/* Top Header Row */}
      <header className="relative z-20 w-full max-w-7xl mx-auto px-6 lg:px-12 pt-8 flex items-center justify-between">
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-3.5">
          <div className="w-8 h-8 text-white">
            <svg
              width="32"
              height="32"
              viewBox="0 0 32 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-full h-full"
              aria-hidden="true"
            >
              <path d="M16 2L19 13.5L16 16L13 13.5L16 2Z" fill="currentColor" fillOpacity="0.95" />
              <path d="M16 30L13 18.5L16 16L19 18.5L16 30Z" fill="currentColor" fillOpacity="0.75" />
              <path d="M2 16L13.5 13L16 16L13.5 19L2 16Z" fill="currentColor" fillOpacity="0.85" />
              <path d="M30 16L18.5 19L16 16L18.5 13L30 16Z" fill="currentColor" fillOpacity="0.65" />
              <circle cx="16" cy="16" r="2.2" fill="currentColor" />
            </svg>
          </div>
          <span className="font-jetbrains font-bold tracking-widest text-sm text-white">
            CodoGraph
          </span>
        </div>

        {/* Top-Right: Back to Home Button */}
        <button
          onClick={onBackToHome}
          className="group flex items-center bg-[#111216]/80 hover:bg-[#1a1c22] border border-white/10 rounded-xl p-1.5 pr-4 pl-1.5 text-xs font-jetbrains text-white transition-all active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#F64302] outline-none shadow-sm"
        >
          <span className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center mr-3 transition-colors group-hover:bg-white/20">
            <ChevronRight className="w-4 h-4 text-white transition-transform duration-200 group-hover:translate-x-0.5" />
          </span>
          <span>Back to Home</span>
        </button>
      </header>

      {/* Main Content: Two Column Editorial Grid */}
      <main className="relative z-20 w-full max-w-7xl mx-auto px-6 lg:px-12 py-10 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Left Column: Editorial Headline & Subtitle */}
        <div className="lg:col-span-6 flex flex-col justify-center">
          <h1 className="font-bubbledot text-4xl sm:text-6xl lg:text-7xl leading-[1.02] tracking-tight">
            <span className="block text-white">Map Your</span>
            <span className="block text-white">Codebase.</span>
            <span className="block text-[#808590]">
              Understand More<span className="text-[#F64302]">.</span>
            </span>
          </h1>

          <p className="font-jetbrains text-sm sm:text-base text-white/60 mt-8 leading-relaxed max-w-md">
            Sign in to explore interactive code maps, visualize dependencies, and uncover insights.
          </p>
        </div>

        {/* Right Column: Card Container */}
        <div className="lg:col-span-6 flex justify-center lg:justify-end">
          <div className="w-full max-w-[480px] bg-[#0c0d11]/85 backdrop-blur-xl border border-white/10 rounded-3xl p-8 sm:p-10 shadow-2xl relative">
            {/* Card Header with Crosshair Accent */}
            <div className="flex items-start gap-4 mb-8">
              {/* Reticle glowing square */}
              <div className="relative mt-1 shrink-0">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-[1px] bg-gradient-to-r from-transparent via-[#F64302] to-transparent" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-12 w-[1px] bg-gradient-to-b from-transparent via-[#F64302] to-transparent" />
                <div className="w-3.5 h-3.5 bg-[#F64302] rounded-[1px] shadow-[0_0_12px_#F64302]" />
              </div>

              <div>
                <h2 className="font-bubbledot text-2xl sm:text-3xl text-white tracking-tight">
                  {mode === 'signin' ? 'Welcome Back' : 'Create Account'}
                </h2>
                <p className="font-jetbrains text-xs sm:text-sm text-white/60 mt-1">
                  {mode === 'signin'
                    ? 'Sign in to continue to CodoGraph'
                    : 'Sign up to continue to CodoGraph'}
                </p>
              </div>
            </div>

            {/* Social Authentication Providers Row */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              {/* GitHub */}
              <button
                type="button"
                className="flex items-center justify-center py-3 px-4 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 rounded-xl transition-all focus-visible:ring-2 focus-visible:ring-[#F64302] outline-none active:scale-[0.98]"
                aria-label="Continue with GitHub"
              >
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
              </button>

              {/* Google */}
              <button
                type="button"
                className="flex items-center justify-center py-3 px-4 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 rounded-xl transition-all focus-visible:ring-2 focus-visible:ring-[#F64302] outline-none active:scale-[0.98]"
                aria-label="Continue with Google"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z" />
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z" />
                  <path fill="#FBBC05" d="M5.28 14.27a7.22 7.22 0 010-4.54V6.58H1.25a11.98 11.98 0 000 10.84l4.03-3.15z" />
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
                </svg>
              </button>

              {/* Microsoft */}
              <button
                type="button"
                className="flex items-center justify-center py-3 px-4 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 rounded-xl transition-all focus-visible:ring-2 focus-visible:ring-[#F64302] outline-none active:scale-[0.98]"
                aria-label="Continue with Microsoft"
              >
                <div className="grid grid-cols-2 gap-1 w-4 h-4">
                  <div className="bg-[#F25022] w-full h-full rounded-[1px]" />
                  <div className="bg-[#7FBA00] w-full h-full rounded-[1px]" />
                  <div className="bg-[#00A4EF] w-full h-full rounded-[1px]" />
                  <div className="bg-[#FFB900] w-full h-full rounded-[1px]" />
                </div>
              </button>
            </div>

            {/* Divider */}
            <div className="relative flex items-center justify-center my-6">
              <div className="w-full border-t border-white/10" />
              <span className="absolute bg-[#0c0d11] px-3 font-jetbrains text-xs text-white/40">
                or
              </span>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-jetbrains font-medium text-white/90 mb-2">
                  Email address
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-3.5 text-white/40 pointer-events-none">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email address"
                    className="w-full pl-10 pr-4 py-3 bg-[#13151b]/70 border border-white/10 rounded-xl text-xs sm:text-sm font-jetbrains text-white placeholder:text-white/30 focus:border-white/30 focus-visible:ring-1 focus-visible:ring-[#F64302] outline-none transition-all"
                  />
                </div>
              </div>

              {/* Submit CTA */}
              <button
                type="submit"
                className="w-full mt-2 py-3.5 bg-white text-black font-jetbrains font-semibold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-2 hover:bg-white/90 active:scale-[0.98] transition-all focus-visible:ring-2 focus-visible:ring-[#F64302] outline-none shadow-lg cursor-pointer"
              >
                <span>Continue</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              {/* Toggle Sign In / Sign Up */}
              <div className="mt-4 text-center">
                <span className="font-jetbrains text-xs text-white/60">
                  {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
                </span>
                <button
                  type="button"
                  onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
                  className="font-jetbrains text-xs text-[#F64302] hover:underline font-medium focus-visible:ring-1 focus-visible:ring-[#F64302] outline-none"
                >
                  {mode === 'signin' ? 'Sign up' : 'Sign in'}
                </button>
              </div>

              {/* Bottom Security Badge */}
              <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-center gap-2 text-white/40 font-jetbrains text-xs">
                <Lock className="w-3.5 h-3.5" />
                <span>Secured by Clerk</span>
              </div>
            </form>
          </div>
        </div>
      </main>

      {/* Footer spacer */}
      <footer className="relative z-20 py-4" />
    </div>
  );
};

export default AuthPage;
