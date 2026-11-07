/**
 * CodoGraph — Startup environment validator.
 *
 * Fails loudly at boot if required configuration is absent.
 * Never prints secret values in logs — only variable names.
 *
 * Required variables:
 *  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY   — Clerk frontend key (browser-safe)
 *  CLERK_SECRET_KEY                    — Clerk server key (never expose to browser)
 *  NEXT_PUBLIC_SUPABASE_URL            — Supabase project REST endpoint
 *  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * Optional but recommended:
 *  NEXT_PUBLIC_CLERK_SIGN_IN_URL       — /sign-in
 *  NEXT_PUBLIC_CLERK_SIGN_UP_URL       — /sign-up
 *  NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL — /workspace
 *  NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL — /workspace
 */

const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
] as const;

export function validateEnv(): void {
  const missing: string[] = [];

  for (const envVar of REQUIRED_ENV_VARS) {
    const val = process.env[envVar];
    if (!val || val.trim() === '') {
      missing.push(envVar);
    }
  }

  // Supabase key: either new or legacy name is acceptable
  const hasSupabaseKey =
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '') !== '' ||
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '') !== '';

  if (!hasSupabaseKey) {
    missing.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)');
  }

  if (missing.length > 0) {
    const lines = missing.map((v) => `  - ${v}`).join('\n');
    throw new Error(
      `[FATAL] CodoGraph is missing required environment configuration.\n` +
        `Add the following variables to .env.local and restart the server:\n${lines}`
    );
  }

  // Warn (don't fail) about recommended redirect vars
  const recommended = [
    'NEXT_PUBLIC_CLERK_SIGN_IN_URL',
    'NEXT_PUBLIC_CLERK_SIGN_UP_URL',
    'NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL',
    'NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL',
  ];
  const missingRecommended = recommended.filter(
    (v) => !(process.env[v]?.trim())
  );
  if (missingRecommended.length > 0 && process.env.NODE_ENV !== 'production') {
    console.warn(
      `[CodoGraph] Recommended Clerk redirect variables are not set:\n` +
        missingRecommended.map((v) => `  ${v}`).join('\n') +
        `\nClerk will use its dashboard defaults for redirect URLs.`
    );
  }
}

// Run validation when this module is imported — fail loudly in dev/runtime.
// During production build (phase-production-build) the env may be absent;
// this is intentional — Vercel/Fly inject them at runtime, not build time.
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
  if (process.env.NEXT_PHASE !== 'phase-production-build') {
    try {
      validateEnv();
    } catch (err) {
      // Print to stderr but do not crash the module loader in dev HMR contexts.
      // The app will fail naturally when it tries to use the missing config.
      console.error(err instanceof Error ? err.message : String(err));
    }
  }
}
