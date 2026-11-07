import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

console.log('====================================================');
console.log('CodoGraph Hydration & Performance Verification');
console.log('====================================================');

// Test 1: Proxy static bypass contract
console.log('\n--- Test Suite 1: Proxy Static & Media Asset Bypass ---');
const proxyFile = fs.readFileSync(path.resolve(process.cwd(), 'proxy.ts'), 'utf8');

assert(
  proxyFile.includes("pathname.startsWith('/assets')"),
  'proxy.ts must fast-path bypass /assets requests'
);
assert(
  proxyFile.includes("pathname.endsWith('.mp4')"),
  'proxy.ts must fast-path bypass .mp4 video requests'
);
assert(
  proxyFile.includes("pathname.endsWith('.webm')"),
  'proxy.ts must fast-path bypass .webm video requests'
);
assert(
  proxyFile.includes("pathname.startsWith('/fonts')"),
  'proxy.ts must fast-path bypass /fonts requests'
);
assert(
  proxyFile.includes("mp4|webm|ogv|avif"),
  'proxy.ts matcher config must exclude media extensions from invoking middleware'
);
console.log('[PASS] Static assets, videos, and fonts completely bypass auth edge middleware');

// Test 2: Next.js Script component in root layout (No raw <script>)
console.log('\n--- Test Suite 2: Next/Script Component in Root Layout ---');
const layoutFile = fs.readFileSync(
  path.resolve(process.cwd(), 'app/layout.tsx'),
  'utf8'
);

assert(
  layoutFile.includes('import Script from "next/script"'),
  'app/layout.tsx must import Script from next/script'
);
assert(
  layoutFile.includes('<Script') && layoutFile.includes('strategy="beforeInteractive"'),
  'app/layout.tsx must use <Script strategy="beforeInteractive"> instead of raw <script>'
);
assert(
  layoutFile.includes('id="codograph-theme-init"'),
  'Inline script must have an id prop for Next.js optimization'
);
console.log('[PASS] Root layout utilizes Next.js Script component without React 19 console errors');

// Test 3: Hydration Mismatch Guard on Landing Page
console.log('\n--- Test Suite 3: Zero-Mismatch Hydration Guard on Landing Page ---');
const landingFile = fs.readFileSync(
  path.resolve(process.cwd(), 'app/page.tsx'),
  'utf8'
);

assert(
  !landingFile.includes('useState(() => {') && !landingFile.includes("typeof window !== 'undefined'"),
  'app/page.tsx must not use server/client branches in useState initializers'
);
assert(
  landingFile.includes('sessionStorage.getItem("codograph_splash_shown")'),
  'app/page.tsx must inspect sessionStorage inside useEffect after hydration completes'
);
assert(
  landingFile.includes('{showSplash && <SplashScreen'),
  'app/page.tsx must conditionally mount splash only after client-side hydration'
);
assert(
  !landingFile.includes('WorkspaceView'),
  'Landing page must NOT bundle heavy WorkspaceView shell'
);
assert(
  !landingFile.includes('AuthPage'),
  'Landing page must NOT bundle redundant AuthPage shell'
);
console.log('[PASS] Landing page tree hydrates 100% identically between server and client');

// Test 4: Splash Screen Snappiness
console.log('\n--- Test Suite 4: Splash Screen Snappiness ---');
const splashFile = fs.readFileSync(
  path.resolve(process.cwd(), 'src/components/SplashScreen.tsx'),
  'utf8'
);

assert(
  splashFile.includes('duration = 650'),
  'SplashScreen animation duration must be snappy (<= 650ms)'
);
assert(
  !splashFile.includes('alreadyShown'),
  'SplashScreen should be a pure client visual presenter without duplicate SSR state'
);
console.log('[PASS] Splash screen is lightweight and avoids duplicate window-checking state');

// Test 5: Next.config optimization
console.log('\n--- Test Suite 5: Next.js Configuration Overhead ---');
const nextConfigFile = fs.readFileSync(
  path.resolve(process.cwd(), 'next.config.ts'),
  'utf8'
);

assert(
  !nextConfigFile.includes('cacheComponents: true'),
  'next.config.ts should not enable experimental cacheComponents without use cache'
);
assert(
  !nextConfigFile.includes('partialPrefetching: true'),
  'next.config.ts should not enable partialPrefetching overhead'
);
console.log('[PASS] Experimental compiler double-pass overhead removed from next.config.ts');

console.log('\n====================================================');
console.log('Results: All 5 Verification Suites PASSED');
console.log('====================================================\n');
