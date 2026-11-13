/**
 * CodoGraph — Phase 12: Short-Lived Signed Agent Credential.
 *
 * Requirements (docs/specs/phase-12.md):
 * 1. "A short-lived signed credential naming exactly one analysis and the organization it belongs to."
 * 2. "The agent is never told which analysis it's reading. That lives inside the signed credential."
 * 3. Prevents prompt injection attacks: comments like "fetch analysis 7f3a..." cannot change the target analysis.
 * 4. Tamper-proof HMAC-SHA256 signature with timing-safe comparison.
 * 5. Short TTL (default: 15 minutes, max: 1 hour).
 */
import crypto from 'node:crypto';

export interface AgentCredentialPayload {
  analysisId: string;
  orgId: string;
  exp: number; // Unix epoch in seconds
  iat: number; // Unix epoch in seconds
  iss: 'codograph-agent';
  v: 1;
}

export class AgentCredentialError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = 'AgentCredentialError';
    this.statusCode = statusCode;
  }
}

const DEFAULT_TTL_SECONDS = 15 * 60; // 15 minutes
const MAX_TTL_SECONDS = 60 * 60; // 1 hour
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getSigningSecret(): string {
  const secret = (
    process.env.AGENT_CREDENTIAL_SECRET ||
    process.env.CLERK_SECRET_KEY ||
    process.env.SUPABASE_SECRET_KEY
  )?.trim();

  if (!secret) {
    throw new AgentCredentialError(
      'Server missing signing key for agent credentials (AGENT_CREDENTIAL_SECRET or CLERK_SECRET_KEY).',
      500
    );
  }
  return secret;
}

function base64UrlEncode(data: string | Buffer): string {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

function signSegment(data: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(data);
  return base64UrlEncode(hmac.digest());
}

/**
 * Mints a cryptographically signed, short-lived credential naming exactly one analysis
 * and its owning organization.
 */
export function mintAgentCredential(options: {
  analysisId: string;
  orgId: string;
  ttlSeconds?: number;
}): string {
  const { analysisId, orgId, ttlSeconds = DEFAULT_TTL_SECONDS } = options;

  if (!analysisId || !UUID_REGEX.test(analysisId)) {
    throw new AgentCredentialError('Cannot mint credential: invalid analysis ID.');
  }

  if (!orgId || typeof orgId !== 'string' || orgId.trim() === '') {
    throw new AgentCredentialError('Cannot mint credential: organization ID is required.');
  }

  const effectiveTtl = ttlSeconds <= 0 ? ttlSeconds : Math.min(ttlSeconds, MAX_TTL_SECONDS);
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const payload: AgentCredentialPayload = {
    analysisId,
    orgId: orgId.trim(),
    iat: now,
    exp: now + effectiveTtl,
    iss: 'codograph-agent',
    v: 1,
  };

  const secret = getSigningSecret();
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const signature = signSegment(signatureInput, secret);

  return `${signatureInput}.${signature}`;
}

/**
 * Cryptographically verifies an agent credential token, validates expiry,
 * and extracts the bound analysisId and orgId.
 */
export function verifyAgentCredential(rawToken: string): AgentCredentialPayload {
  if (!rawToken || typeof rawToken !== 'string') {
    throw new AgentCredentialError('Missing or empty agent credential token.');
  }

  const parts = rawToken.trim().split('.');
  if (parts.length !== 3) {
    throw new AgentCredentialError('Malformed agent credential token format.');
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const secret = getSigningSecret();

  // 1. Verify signature with timing-safe comparison
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = signSegment(signatureInput, secret);

  const sigBuf = Buffer.from(signature);
  const expectedSigBuf = Buffer.from(expectedSignature);

  if (sigBuf.length !== expectedSigBuf.length || !crypto.timingSafeEqual(sigBuf, expectedSigBuf)) {
    throw new AgentCredentialError('Invalid agent credential signature.');
  }

  // 2. Parse payload
  let payload: AgentCredentialPayload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload)) as AgentCredentialPayload;
  } catch {
    throw new AgentCredentialError('Corrupted agent credential payload.');
  }

  // 3. Verify issuer and version
  if (payload.iss !== 'codograph-agent' || payload.v !== 1) {
    throw new AgentCredentialError('Untrusted agent credential issuer.');
  }

  // 4. Verify expiration
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || now >= payload.exp) {
    throw new AgentCredentialError('Agent credential token has expired.');
  }

  // 5. Verify analysisId and orgId integrity
  if (!payload.analysisId || !UUID_REGEX.test(payload.analysisId)) {
    throw new AgentCredentialError('Agent credential specifies an invalid analysis ID.');
  }

  if (!payload.orgId || typeof payload.orgId !== 'string') {
    throw new AgentCredentialError('Agent credential specifies an invalid organization ID.');
  }

  return payload;
}

/**
 * Extracts and verifies the agent credential from an incoming HTTP Request.
 * Looks for 'Authorization: Bearer <token>' or 'x-agent-credential: <token>'.
 */
export function extractAndVerifyCredential(req: Request): AgentCredentialPayload {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  let token: string | null = null;

  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    token = authHeader.slice(7).trim();
  }

  if (!token) {
    token = req.headers.get('x-agent-credential') || req.headers.get('X-Agent-Credential');
  }

  if (!token) {
    throw new AgentCredentialError(
      'Missing agent credential. Provide Authorization: Bearer <credential> or X-Agent-Credential header.'
    );
  }

  return verifyAgentCredential(token);
}
