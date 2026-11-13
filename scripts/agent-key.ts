/**
 * CodoGraph — Phase 12: Agent Key & Credential Generator / Inspector.
 *
 * Runs via: pnpm agent-key
 *
 * Capabilities:
 * 1. Inspects active signing key configuration (AGENT_CREDENTIAL_SECRET vs fallback).
 * 2. Generates a fresh 256-bit cryptographically secure key for .env.local if unconfigured.
 * 3. Mints an active short-lived signed credential token bound to the latest completed analysis.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// 1. Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

import { mintAgentCredential, verifyAgentCredential } from '../lib/auth/agent-credential.ts';
import { createSupabaseAdminClient } from '../lib/supabase/admin.ts';

async function main() {
  console.log('====================================================');
  console.log('CodoGraph Phase 12 — Agent Key & Credential Tool');
  console.log('====================================================\n');

  const hasDedicated = Boolean(process.env.AGENT_CREDENTIAL_SECRET?.trim());
  const hasClerkFallback = Boolean(process.env.CLERK_SECRET_KEY?.trim());
  const hasSupabaseFallback = Boolean(process.env.SUPABASE_SECRET_KEY?.trim());

  console.log('--- Signing Secret Status ---');
  if (hasDedicated) {
    console.log('[OK] AGENT_CREDENTIAL_SECRET is configured in .env.local (dedicated key active).');
  } else if (hasClerkFallback) {
    console.log('[OK] Using CLERK_SECRET_KEY as server signing fallback.');
  } else if (hasSupabaseFallback) {
    console.log('[OK] Using SUPABASE_SECRET_KEY as server signing fallback.');
  } else {
    console.error('[WARN] No signing secret found in .env.local.');
  }

  // Generate a standby 256-bit hex secret for reference
  const freshSecret = crypto.randomBytes(32).toString('hex');
  console.log(`\nStandby 256-bit Key (copyable for AGENT_CREDENTIAL_SECRET):\n  ${freshSecret}\n`);

  // Query latest completed analysis to mint a live test credential
  try {
    const supabase = createSupabaseAdminClient();
    const { data: analysis } = await supabase
      .from('analyses')
      .select('id, org_id, repository_url, status')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (analysis) {
      console.log('--- Minting Live Short-Lived Credential ---');
      console.log(`Bound Analysis ID:      ${analysis.id}`);
      console.log(`Bound Organization ID:  ${analysis.org_id}`);
      console.log(`Target Repository:      ${analysis.repository_url}`);

      const token = mintAgentCredential({
        analysisId: analysis.id,
        orgId: analysis.org_id,
        ttlSeconds: 900,
      });

      const parsed = verifyAgentCredential(token);
      const expiresDate = new Date(parsed.exp * 1000).toISOString();

      console.log(`Expires At:             ${expiresDate} (15 min TTL)`);
      console.log(`\nSigned Credential Token:\n${token}\n`);
      console.log('Authorization Header for Tool Calls:');
      console.log(`  Authorization: Bearer ${token}`);
    } else {
      console.log('[INFO] No completed analysis found in database. Using sample UUID.');
      const sampleId = '11111111-1111-1111-1111-111111111111';
      const sampleOrg = 'org_sample_workspace';
      const token = mintAgentCredential({
        analysisId: sampleId,
        orgId: sampleOrg,
        ttlSeconds: 900,
      });
      console.log(`Sample Token:\n${token}`);
    }
  } catch (err) {
    console.error('[ERROR] Failed to mint live credential:', err instanceof Error ? err.message : err);
  }

  console.log('\n====================================================');
}

main().catch((err) => {
  console.error('[FATAL]:', err);
  process.exit(1);
});

