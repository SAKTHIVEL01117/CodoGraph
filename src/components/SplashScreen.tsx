import React, { useEffect, useRef, useState } from 'react';

interface SplashScreenProps {
  onComplete: () => void;
}

interface Block {
  angle: number;
  offset: number;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    // Check user preference for reduced motion on mount
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      queueMicrotask(() => {
        setIsFading(true);
      });
      const timer = setTimeout(onComplete, 100);
      return () => clearTimeout(timer);
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Click to dismiss immediately
    const handleDismiss = () => {
      setIsFading(true);
      setTimeout(onComplete, 150);
    };
    window.addEventListener('click', handleDismiss, { once: true });
    window.addEventListener('keydown', handleDismiss, { once: true });

    const blockSize = 12;
    const duration = 650; // Snappy 650ms intro animation
    const ring1: Block[] = Array.from({ length: 120 }, (_, i) => ({
      angle: (2 * Math.PI * i) / 120 + (Math.random() - 0.5) * 0.04,
      offset: 0.85 + Math.random() * 0.25,
    }));

    const ring2: Block[] = Array.from({ length: 60 }, (_, i) => ({
      angle: (2 * Math.PI * i) / 60 + (Math.random() - 0.5) * 0.04,
      offset: 0.92 + Math.random() * 0.1,
    }));

    let animationFrameId: number;
    let startTime: number | null = null;
    let completed = false;

    const render = (now: number) => {
      if (startTime === null) startTime = now;
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      // ease-out cubic
      const ease = 1 - Math.pow(1 - t, 3);

      const maxRadius = Math.sqrt(width * width + height * height) / 2;
      const currentRadius = ease * maxRadius;
      const cx = width / 2;
      const cy = height / 2;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';

      // Punched inner circle
      const innerRadius = Math.max(0, currentRadius - blockSize * 2);
      if (innerRadius > 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#000000';
        ctx.fill();
      }

      // Punch lightweight block rings
      for (let i = 0; i < ring1.length; i++) {
        const b = ring1[i];
        const r = currentRadius * b.offset;
        const bx = cx + Math.cos(b.angle) * r - blockSize / 2;
        const by = cy + Math.sin(b.angle) * r - blockSize / 2;
        ctx.fillRect(bx, by, blockSize, blockSize);
      }

      const sz = blockSize * 0.8;
      for (let i = 0; i < ring2.length; i++) {
        const b = ring2[i];
        const r2 = currentRadius * b.offset;
        const bx2 = cx + Math.cos(b.angle) * r2 - sz / 2;
        const by2 = cy + Math.sin(b.angle) * r2 - sz / 2;
        ctx.fillRect(bx2, by2, sz, sz);
      }

      ctx.restore();

      if (t < 1) {
        animationFrameId = requestAnimationFrame(render);
      } else if (!completed) {
        completed = true;
        setIsFading(true);
        setTimeout(() => {
          onComplete();
        }, 200);
      }
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('click', handleDismiss);
      window.removeEventListener('keydown', handleDismiss);
    };
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 z-[9999] transition-opacity duration-200 ease-out ${
        isFading ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'
      }`}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
};
