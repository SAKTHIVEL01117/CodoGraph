/**
/**
 * CodoGraph — Migration Runner
 *
 * Runs tracked SQL migrations in supabase/migrations/ against PostgreSQL.
 * Ensures migrations run sequentially and idempotently.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

// Parse .env.local if not already in process.env
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('[FATAL] DATABASE_URL environment variable is required to execute SQL migrations.');
  console.error('Alternatively, paste each SQL file in supabase/migrations/ into the Supabase Dashboard -> SQL Editor.');
  process.exit(1);
}

async function applyMigrations() {
  console.log('Connecting to database...');
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('Connected to PostgreSQL successfully.');

  const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.error('No migrations directory found at', migrationsDir);
    process.exit(1);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  console.log(`Found ${files.length} migration file(s) in supabase/migrations:\n`);

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    console.log(`Executing migration: ${file}...`);
    const sql = fs.readFileSync(filePath, 'utf8');

    const startTime = Date.now();
    try {
      await client.query(sql);
      const elapsed = Date.now() - startTime;
      console.log(`✓ [SUCCESS] ${file} (${elapsed}ms)`);
    } catch (err) {
      console.error(`✗ [ERROR] Failed executing ${file}:`, err);
      await client.end();
      process.exit(1);
    }
  }

  console.log('\nAll migrations executed successfully!');
  await client.end();
}

applyMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

