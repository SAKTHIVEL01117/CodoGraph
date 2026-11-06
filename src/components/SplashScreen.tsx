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
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const isReduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReducedMotion(isReduced);

    if (isReduced) {
      const timer = setTimeout(() => {
        setIsFading(true);
        setTimeout(onComplete, 200);
      }, 50);
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

    const blockSize = 10;
    const duration = 1800; // 1800ms
    const ring1: Block[] = Array.from({ length: 360 }, (_, i) => ({
      angle: (2 * Math.PI * i) / 360 + (Math.random() - 0.5) * 0.02,
      offset: 0.85 + Math.random() * 0.3,
    }));

    const ring2: Block[] = Array.from({ length: 180 }, (_, i) => ({
      angle: (2 * Math.PI * i) / 180 + (Math.random() - 0.5) * 0.02,
      offset: 0.92 + Math.random() * 0.12,
    }));

    let animationFrameId: number;
    let startTime: number | null = null;
    let completed = false;

    const render = (now: number) => {
      if (startTime === null) startTime = now;
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      // ease-out cubic: 1 - (1 - t)^3
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

      // Punch 360 square blocks
      for (let i = 0; i < 360; i++) {
        const b = ring1[i];
        const r = currentRadius * b.offset;
        const bx = cx + Math.cos(b.angle) * r - blockSize / 2;
        const by = cy + Math.sin(b.angle) * r - blockSize / 2;
        ctx.fillRect(bx, by, blockSize, blockSize);
      }

      // Punch second ring of 180 blocks at 80% size
      const sz = blockSize * 0.8;
      for (let i = 0; i < 180; i++) {
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
        }, 400);
      }
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 z-[9999] transition-opacity ${
        reducedMotion ? 'duration-200' : 'duration-[400ms]'
      } ease-out ${
        isFading ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'
      }`}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
};
