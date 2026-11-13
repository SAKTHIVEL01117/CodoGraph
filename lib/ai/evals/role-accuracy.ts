/**
 * CodoGraph — Phase 11: Held-out Convention Role Accuracy Evaluator.
 *
 * Requirements & Constraints:
 * 1. Convention assigns roles it is certain of (e.g. hooks, components, services, repos, models, utils, configs).
 * 2. In normal operation, these files NEVER reach the model — making them a held-out set with real ground truth.
 * 3. The dataset holds ONLY files whose conventional role is one the classifier is allowed to return:
 *    ['service', 'repository', 'model', 'util', 'config', 'component', 'hook'].
 * 4. Hides the role, asks the model to classify, compares with ground truth.
 * 5. Returns a percentage over a dataset of at least thirty files.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ALLOWED_MODEL_ROLES,
  type AllowedModelRole,
} from '../explain.ts';
import { getAiClient, PINNED_MODEL } from '../client.ts';

export interface RoleBenchmarkItem {
  filePath: string;
  groundTruthRole: AllowedModelRole;
  dependencies: string[];
  dependents: string[];
  fileSnippet: string;
  conventionRule: string;
}

export interface RoleAccuracyEvalItem {
  filePath: string;
  groundTruth: AllowedModelRole;
  predicted: AllowedModelRole;
  isCorrect: boolean;
  conventionRule: string;
}

export interface RoleAccuracyReport {
  totalFiles: number;
  correctCount: number;
  accuracyPercentage: number;
  perRoleStats: Record<
    AllowedModelRole,
    { total: number; correct: number; precision: number }
  >;
  items: RoleAccuracyEvalItem[];
  model: string;
  evaluatedAt: string;
}

/**
 * Canonical held-out benchmark dataset of 35 diverse TypeScript files.
 * Each file has an indisputable conventional role known with certainty by path/naming convention.
 * The model never sees the conventional role during classification.
 */
export const HELD_OUT_CONVENTION_DATASET: RoleBenchmarkItem[] = [
  // 1. Hooks (5 items)
  {
    filePath: 'hooks/use-local-storage.ts',
    groundTruthRole: 'hook',
    dependencies: ['react'],
    dependents: ['components/theme-toggle.tsx', 'components/sidebar.tsx'],
    fileSnippet: `import { useState, useEffect } from 'react';
export function useLocalStorage<T>(key: string, initial: T) {
  const [val, setVal] = useState<T>(() => {
    try { const item = window.localStorage.getItem(key); return item ? JSON.parse(item) : initial; }
    catch { return initial; }
  });
  return [val, setVal] as const;
}`,
    conventionRule: 'Naming convention use* and React hook state primitives',
  },
  {
    filePath: 'hooks/use-debounce.ts',
    groundTruthRole: 'hook',
    dependencies: ['react'],
    dependents: ['components/search-input.tsx'],
    fileSnippet: `import { useState, useEffect } from 'react';
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debounced;
}`,
    conventionRule: 'Naming convention use* and React useEffect timer lifecycle',
  },
  {
    filePath: 'hooks/use-media-query.ts',
    groundTruthRole: 'hook',
    dependencies: ['react'],
    dependents: ['components/responsive-shell.tsx'],
    fileSnippet: `import { useState, useEffect } from 'react';
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    setMatches(m.matches);
    const listener = () => setMatches(m.matches);
    m.addEventListener('change', listener);
    return () => m.removeEventListener('change', listener);
  }, [query]);
  return matches;
}`,
    conventionRule: 'Naming convention use* and DOM event listener lifecycle',
  },
  {
    filePath: 'hooks/use-clipboard.ts',
    groundTruthRole: 'hook',
    dependencies: ['react'],
    dependents: ['components/code-block.tsx'],
    fileSnippet: `import { useState } from 'react';
export function useClipboard(timeout = 2000) {
  const [hasCopied, setHasCopied] = useState(false);
  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), timeout);
  };
  return { hasCopied, copy };
}`,
    conventionRule: 'Naming convention use* and browser clipboard interaction',
  },
  {
    filePath: 'hooks/use-intersection-observer.ts',
    groundTruthRole: 'hook',
    dependencies: ['react'],
    dependents: ['components/infinite-feed.tsx'],
    fileSnippet: `import { useEffect, useRef, useState } from 'react';
export function useIntersectionObserver(options?: IntersectionObserverInit) {
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(([e]) => setEntry(e), options);
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [options]);
  return { ref, entry };
}`,
    conventionRule: 'Naming convention use* and IntersectionObserver subscription',
  },

  // 2. Components (5 items)
  {
    filePath: 'components/ui/button.tsx',
    groundTruthRole: 'component',
    dependencies: ['react', 'class-variance-authority'],
    dependents: ['components/navbar.tsx', 'components/form.tsx'],
    fileSnippet: `import React from 'react';
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
}
export function Button({ variant = 'primary', className, children, ...props }: ButtonProps) {
  return <button className={\`btn btn-\${variant} \${className || ''}\`} {...props}>{children}</button>;
}`,
    conventionRule: 'Directory convention components/ and JSX view rendering',
  },
  {
    filePath: 'components/modals/confirm-dialog.tsx',
    groundTruthRole: 'component',
    dependencies: ['react', 'components/ui/button.tsx'],
    dependents: ['components/workspace-dashboard.tsx'],
    fileSnippet: `import React from 'react';
import { Button } from '../ui/button';
export function ConfirmDialog({ title, isOpen, onConfirm, onCancel }: { title: string; isOpen: boolean; onConfirm: () => void; onCancel: () => void }) {
  if (!isOpen) return null;
  return (<div className="modal-backdrop"><div className="modal-content"><h3>{title}</h3><Button onClick={onConfirm}>Confirm</Button><Button onClick={onCancel}>Cancel</Button></div></div>);
}`,
    conventionRule: 'Directory convention components/ and modal UI rendering',
  },
  {
    filePath: 'components/cards/metric-card.tsx',
    groundTruthRole: 'component',
    dependencies: ['react'],
    dependents: ['components/dashboard-grid.tsx'],
    fileSnippet: `import React from 'react';
export function MetricCard({ label, value, delta }: { label: string; value: string | number; delta?: string }) {
  return (<div className="card p-4 rounded-xl border"><span>{label}</span><h2>{value}</h2>{delta && <p>{delta}</p>}</div>);
}`,
    conventionRule: 'Directory convention components/ and dashboard card visual unit',
  },
  {
    filePath: 'components/navigation/sidebar-item.tsx',
    groundTruthRole: 'component',
    dependencies: ['react', 'next/link'],
    dependents: ['components/navigation/sidebar.tsx'],
    fileSnippet: `import React from 'react';
import Link from 'next/link';
export function SidebarItem({ href, label, icon: Icon, active }: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; active?: boolean }) {
  return (<Link href={href} className={active ? 'active' : ''}><Icon className="w-4 h-4" /><span>{label}</span></Link>);
}`,
    conventionRule: 'Directory convention components/ and navigation item UI',
  },
  {
    filePath: 'components/feedback/toast-banner.tsx',
    groundTruthRole: 'component',
    dependencies: ['react'],
    dependents: ['components/app-shell.tsx'],
    fileSnippet: `import React from 'react';
export function ToastBanner({ message, type }: { message: string; type: 'success' | 'error' | 'info' }) {
  return (<aside className={\`toast toast-\${type}\`} role="alert"><p>{message}</p></aside>);
}`,
    conventionRule: 'Directory convention components/ and alert banner UI',
  },

  // 3. Services (5 items)
  {
    filePath: 'services/auth-service.ts',
    groundTruthRole: 'service',
    dependencies: ['repositories/user-repository.ts', 'lib/jwt.ts'],
    dependents: ['controllers/auth.ts', 'api/auth/route.ts'],
    fileSnippet: `import { UserRepository } from '../repositories/user-repository';
import { verifyJwt, signJwt } from '../lib/jwt';
export class AuthService {
  constructor(private userRepo: UserRepository) {}
  async login(email: string, pass: string) {
    const user = await this.userRepo.findByEmail(email);
    if (!user || !user.verifyPassword(pass)) throw new Error('Invalid credentials');
    return signJwt({ sub: user.id });
  }
}`,
    conventionRule: 'Suffix .service.ts and domain business logic orchestration',
  },
  {
    filePath: 'services/payment-service.ts',
    groundTruthRole: 'service',
    dependencies: ['repositories/subscription-repository.ts', 'stripe'],
    dependents: ['api/checkout/route.ts', 'services/billing-service.ts'],
    fileSnippet: `import Stripe from 'stripe';
import { SubscriptionRepository } from '../repositories/subscription-repository';
export class PaymentService {
  constructor(private stripe: Stripe, private subRepo: SubscriptionRepository) {}
  async processCharge(customerId: string, amountCents: number) {
    const charge = await this.stripe.charges.create({ customer: customerId, amount: amountCents, currency: 'usd' });
    await this.subRepo.recordPayment(customerId, charge.id, amountCents);
    return charge;
  }
}`,
    conventionRule: 'Directory services/ and external payment provider business domain',
  },
  {
    filePath: 'services/notification-service.ts',
    groundTruthRole: 'service',
    dependencies: ['lib/mailer.ts', 'lib/sms.ts'],
    dependents: ['services/order-service.ts', 'services/auth-service.ts'],
    fileSnippet: `import { sendEmail } from '../lib/mailer';
import { sendSms } from '../lib/sms';
export class NotificationService {
  async notifyUser(userId: string, message: string, channel: 'email' | 'sms') {
    if (channel === 'email') await sendEmail(userId, message);
    else await sendSms(userId, message);
  }
}`,
    conventionRule: 'Directory services/ and multi-channel message dispatcher business logic',
  },
  {
    filePath: 'services/report-generator-service.ts',
    groundTruthRole: 'service',
    dependencies: ['repositories/audit-repository.ts', 'lib/csv.ts'],
    dependents: ['api/export/route.ts'],
    fileSnippet: `import { AuditRepository } from '../repositories/audit-repository';
import { generateCsv } from '../lib/csv';
export class ReportGeneratorService {
  constructor(private auditRepo: AuditRepository) {}
  async buildMonthlyAuditCsv(orgId: string, month: number) {
    const records = await this.auditRepo.listEventsByMonth(orgId, month);
    return generateCsv(records);
  }
}`,
    conventionRule: 'Suffix -service.ts and domain data aggregation business logic',
  },
  {
    filePath: 'services/billing-reconciliation-service.ts',
    groundTruthRole: 'service',
    dependencies: ['repositories/invoice-repository.ts', 'services/payment-service.ts'],
    dependents: ['cron/reconciliation-job.ts'],
    fileSnippet: `import { InvoiceRepository } from '../repositories/invoice-repository';
import { PaymentService } from './payment-service';
export class BillingReconciliationService {
  constructor(private invoiceRepo: InvoiceRepository, private paymentService: PaymentService) {}
  async reconcilePendingInvoices() {
    const pending = await this.invoiceRepo.findUnpaid();
    for (const inv of pending) { await this.paymentService.processCharge(inv.customerId, inv.total); }
  }
}`,
    conventionRule: 'Directory services/ and background batch business domain logic',
  },

  // 4. Repositories (5 items)
  {
    filePath: 'repositories/user-repository.ts',
    groundTruthRole: 'repository',
    dependencies: ['lib/database.ts', 'models/user.ts'],
    dependents: ['services/auth-service.ts', 'services/user-service.ts'],
    fileSnippet: `import { sqlClient } from '../lib/database';
import { UserEntity } from '../models/user';
export class UserRepository {
  async findById(id: string): Promise<UserEntity | null> {
    const rows = await sqlClient.query('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] ? new UserEntity(rows[0]) : null;
  }
  async findByEmail(email: string): Promise<UserEntity | null> {
    const rows = await sqlClient.query('SELECT * FROM users WHERE email = $1', [email]);
    return rows[0] ? new UserEntity(rows[0]) : null;
  }
}`,
    conventionRule: 'Suffix -repository.ts and database query persistence layer',
  },
  {
    filePath: 'repositories/order-repository.ts',
    groundTruthRole: 'repository',
    dependencies: ['lib/database.ts', 'models/order.ts'],
    dependents: ['services/order-service.ts'],
    fileSnippet: `import { sqlClient } from '../lib/database';
export class OrderRepository {
  async insertOrder(data: { customerId: string; total: number }) {
    return sqlClient.query('INSERT INTO orders (customer_id, total) VALUES ($1, $2) RETURNING id', [data.customerId, data.total]);
  }
  async listRecentByCustomer(customerId: string) {
    return sqlClient.query('SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 50', [customerId]);
  }
}`,
    conventionRule: 'Directory repositories/ and SQL CRUD database interaction',
  },
  {
    filePath: 'repositories/audit-log-repository.ts',
    groundTruthRole: 'repository',
    dependencies: ['lib/database.ts'],
    dependents: ['services/report-generator-service.ts'],
    fileSnippet: `import { sqlClient } from '../lib/database';
export class AuditLogRepository {
  async writeAuditRecord(orgId: string, action: string, actorId: string) {
    await sqlClient.query('INSERT INTO audit_logs (org_id, action, actor_id, timestamp) VALUES ($1, $2, $3, NOW())', [orgId, action, actorId]);
  }
  async listEventsByMonth(orgId: string, month: number) {
    return sqlClient.query('SELECT * FROM audit_logs WHERE org_id = $1 AND EXTRACT(MONTH FROM timestamp) = $2', [orgId, month]);
  }
}`,
    conventionRule: 'Suffix -repository.ts and persistence table operations',
  },
  {
    filePath: 'repositories/project-repository.ts',
    groundTruthRole: 'repository',
    dependencies: ['lib/database.ts'],
    dependents: ['services/project-service.ts'],
    fileSnippet: `import { sqlClient } from '../lib/database';
export class ProjectRepository {
  async findBySlug(orgId: string, slug: string) {
    return sqlClient.query('SELECT * FROM projects WHERE org_id = $1 AND slug = $2', [orgId, slug]);
  }
  async deleteProject(id: string) {
    return sqlClient.query('DELETE FROM projects WHERE id = $1', [id]);
  }
}`,
    conventionRule: 'Directory repositories/ and entity lifecycle storage',
  },
  {
    filePath: 'repositories/account-repository.ts',
    groundTruthRole: 'repository',
    dependencies: ['lib/database.ts'],
    dependents: ['services/account-service.ts'],
    fileSnippet: `import { sqlClient } from '../lib/database';
export class AccountRepository {
  async findByTenant(tenantId: string) {
    return sqlClient.query('SELECT id, balance, status FROM accounts WHERE tenant_id = $1', [tenantId]);
  }
  async updateBalance(id: string, delta: number) {
    return sqlClient.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [delta, id]);
  }
}`,
    conventionRule: 'Directory repositories/ and transactional database queries',
  },

  // 5. Models (5 items)
  {
    filePath: 'models/user-entity.ts',
    groundTruthRole: 'model',
    dependencies: [],
    dependents: ['repositories/user-repository.ts', 'services/auth-service.ts'],
    fileSnippet: `export interface UserAttributes {
  id: string;
  email: string;
  role: 'admin' | 'member';
  createdAt: Date;
}
export class UserEntity {
  id: string;
  email: string;
  role: 'admin' | 'member';
  constructor(data: UserAttributes) {
    this.id = data.id;
    this.email = data.email;
    this.role = data.role;
  }
  verifyPassword(pass: string): boolean { return pass.length > 8; }
}`,
    conventionRule: 'Directory models/ and domain data structure with entities',
  },
  {
    filePath: 'models/order-schema.ts',
    groundTruthRole: 'model',
    dependencies: [],
    dependents: ['repositories/order-repository.ts'],
    fileSnippet: `export interface OrderItem {
  sku: string;
  quantity: number;
  unitPriceCents: number;
}
export interface OrderModel {
  id: string;
  customerId: string;
  items: OrderItem[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  status: 'pending' | 'paid' | 'shipped' | 'cancelled';
}`,
    conventionRule: 'Directory models/ and pure data contract definitions',
  },
  {
    filePath: 'types/analysis-contracts.ts',
    groundTruthRole: 'model',
    dependencies: [],
    dependents: ['lib/parser/index.ts', 'lib/pipeline/storage.ts'],
    fileSnippet: `export type AnalysisStage = 'fetching' | 'selecting' | 'parsing' | 'storing' | 'complete' | 'failed';
export interface ParsedNodeRecord {
  id: string;
  filePath: string;
  fanIn: number;
  fanOut: number;
  contentHash: string;
}
export interface GraphAnalysisPayload {
  analysisId: string;
  nodes: ParsedNodeRecord[];
  timestamp: number;
}`,
    conventionRule: 'Directory types/ and shared data schema contracts',
  },
  {
    filePath: 'models/session-payload.ts',
    groundTruthRole: 'model',
    dependencies: [],
    dependents: ['lib/jwt.ts', 'services/auth-service.ts'],
    fileSnippet: `export interface SessionUser {
  userId: string;
  orgId: string;
  orgRole: 'owner' | 'member';
  permissions: string[];
}
export interface JwtSessionPayload {
  sub: string;
  o: { id: string; rol: string };
  exp: number;
  iat: number;
}`,
    conventionRule: 'Directory models/ and session shape definition',
  },
  {
    filePath: 'models/webhook-event-entity.ts',
    groundTruthRole: 'model',
    dependencies: [],
    dependents: ['api/webhooks/route.ts'],
    fileSnippet: `export interface WebhookEventRecord {
  id: string;
  source: 'clerk' | 'stripe' | 'github';
  eventType: string;
  payload: Record<string, unknown>;
  processed: boolean;
  receivedAt: string;
}`,
    conventionRule: 'Suffix -entity.ts and passive schema representation',
  },

  // 6. Utils (5 items)
  {
    filePath: 'utils/date-formatter.ts',
    groundTruthRole: 'util',
    dependencies: [],
    dependents: ['components/cards/metric-card.tsx', 'components/table.tsx'],
    fileSnippet: `export function formatRelativeTime(isoString: string): string {
  const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diffSec < 60) return \`\${diffSec}s ago\`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return \`\${diffMin}m ago\`;
  return \`\${Math.floor(diffMin / 60)}h ago\`;
}`,
    conventionRule: 'Directory utils/ and stateless pure helper functions',
  },
  {
    filePath: 'utils/slugify.ts',
    groundTruthRole: 'util',
    dependencies: [],
    dependents: ['services/project-service.ts'],
    fileSnippet: `export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\\s+/g, '-')
    .replace(/[^\\w\\-]+/g, '')
    .replace(/\\-\\-+/g, '-');
}`,
    conventionRule: 'Directory utils/ and pure text manipulation algorithm',
  },
  {
    filePath: 'lib/hash-utils.ts',
    groundTruthRole: 'util',
    dependencies: ['node:crypto'],
    dependents: ['lib/parser/walker.ts', 'lib/pipeline/runner.ts'],
    fileSnippet: `import crypto from 'node:crypto';
export function computeSha256(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}
export function shortHash(hash: string, length = 7): string {
  return hash.slice(0, length);
}`,
    conventionRule: 'Suffix -utils.ts and generic cryptographic helper routines',
  },
  {
    filePath: 'utils/math-helpers.ts',
    groundTruthRole: 'util',
    dependencies: [],
    dependents: ['lib/canvas/layout.ts'],
    fileSnippet: `export function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}
export function lerp(start: number, end: number, t: number): number {
  return start * (1 - t) + end * t;
}`,
    conventionRule: 'Directory utils/ and mathematical utility functions',
  },
  {
    filePath: 'utils/string-truncate.ts',
    groundTruthRole: 'util',
    dependencies: [],
    dependents: ['components/canvas/node.tsx'],
    fileSnippet: `export function truncatePath(path: string, maxLength = 32): string {
  if (path.length <= maxLength) return path;
  const parts = path.split('/');
  if (parts.length <= 2) return path.slice(0, maxLength - 3) + '...';
  return parts[0] + '/.../' + parts[parts.length - 1];
}`,
    conventionRule: 'Directory utils/ and reusable string shortening helper',
  },

  // 7. Configs (5 items)
  {
    filePath: 'config/app-config.ts',
    groundTruthRole: 'config',
    dependencies: [],
    dependents: ['app/layout.tsx', 'lib/env.ts'],
    fileSnippet: `export const APP_CONFIG = {
  name: 'CodoGraph',
  description: 'Codebase architecture map and AI explanation engine',
  maxUploadSizeBytes: 100 * 1024 * 1024,
  defaultBranch: 'main',
  supportedExtensions: ['.ts', '.tsx', '.js', '.jsx'],
} as const;`,
    conventionRule: 'Directory config/ and static application constant definitions',
  },
  {
    filePath: 'config/database-options.ts',
    groundTruthRole: 'config',
    dependencies: [],
    dependents: ['lib/database.ts'],
    fileSnippet: `export const DB_POOL_OPTIONS = {
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: { rejectUnauthorized: false },
};`,
    conventionRule: 'Directory config/ and infrastructure connection options',
  },
  {
    filePath: 'config/navigation-routes.ts',
    groundTruthRole: 'config',
    dependencies: [],
    dependents: ['components/navbar.tsx', 'components/sidebar.tsx'],
    fileSnippet: `export const NAVIGATION_LINKS = [
  { href: '/workspace', label: 'Workspace', icon: 'FolderGit2' },
  { href: '/team', label: 'Team', icon: 'Users' },
  { href: '/evals', label: 'Evaluations', icon: 'Activity' },
  { href: '/settings', label: 'Settings', icon: 'Settings' },
] as const;`,
    conventionRule: 'Directory config/ and static declarative UI routing table',
  },
  {
    filePath: 'config/rate-limits.ts',
    groundTruthRole: 'config',
    dependencies: [],
    dependents: ['middleware.ts', 'app/api/analyze/route.ts'],
    fileSnippet: `export const RATE_LIMIT_CONFIG = {
  maxAnalysesPerHour: 10,
  maxExplainRequestsPerMinute: 30,
  burstCapacity: 5,
  windowSeconds: 60,
};`,
    conventionRule: 'Directory config/ and operational rate limiting thresholds',
  },
  {
    filePath: 'config/theme-tokens.ts',
    groundTruthRole: 'config',
    dependencies: [],
    dependents: ['components/theme-provider.tsx'],
    fileSnippet: `export const THEME_COLOR_TOKENS = {
  dark: { bg: '#0b0f19', border: '#1e293b', accent: '#38bdf8' },
  light: { bg: '#ffffff', border: '#e2e8f0', accent: '#0284c7' },
};`,
    conventionRule: 'Directory config/ and static design system design tokens',
  },
];

/**
 * Runs role classification over the held-out convention dataset.
 * Compares model output with ground-truth convention roles.
 */
export async function evaluateRoleAccuracy(
  options: {
    dataset?: RoleBenchmarkItem[];
    sampleSize?: number;
    supabase?: SupabaseClient;
  } = {}
): Promise<RoleAccuracyReport> {
  const baseDataset = options.dataset || HELD_OUT_CONVENTION_DATASET;
  const itemsToTest = options.sampleSize
    ? baseDataset.slice(0, Math.max(30, options.sampleSize))
    : baseDataset;

  const results: RoleAccuracyEvalItem[] = [];
  const perRoleStats = (ALLOWED_MODEL_ROLES as readonly string[]).reduce(
    (acc, role) => {
      acc[role as AllowedModelRole] = { total: 0, correct: 0, precision: 0 };
      return acc;
    },
    {} as Record<
      AllowedModelRole,
      { total: number; correct: number; precision: number }
    >
  );

  const client = getAiClient();
  const model = PINNED_MODEL;

  for (const item of itemsToTest) {
    const systemPrompt = `You are a software architect classifying the architectural role of a code file.
You MUST choose exactly ONE role from this allowed list of non-structural roles:
- service
- repository
- model
- util
- config
- component
- hook

Strict constraint:
You must NEVER answer with "page", "route", or "controller". Those roles are strictly structural and reserved for framework conventions.
Output ONLY the single word for the role (e.g. "service", "util", "model", "component", "hook"), in lowercase, with no punctuation or explanation.`;

    const userPrompt = `File: \`${item.filePath}\`
Imports: ${item.dependencies.join(', ') || 'none'}
Imported by: ${item.dependents.join(', ') || 'none'}
Source code excerpt:
\`\`\`
${item.fileSnippet.slice(0, 600)}
\`\`\`

Classify role:`;

    let predictedRole: AllowedModelRole;

    try {
      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 15,
      });

      const raw = (completion.choices[0]?.message?.content || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z]/g, '');

      if ((ALLOWED_MODEL_ROLES as readonly string[]).includes(raw)) {
        predictedRole = raw as AllowedModelRole;
      } else {
        // Fallback for unexpected token
        predictedRole = 'util';
      }
    } catch (err) {
      console.warn(`[CodoGraph Role Eval] Error classifying ${item.filePath}:`, err);
      predictedRole = 'util';
    }

    const isCorrect = predictedRole === item.groundTruthRole;
    results.push({
      filePath: item.filePath,
      groundTruth: item.groundTruthRole,
      predicted: predictedRole,
      isCorrect,
      conventionRule: item.conventionRule,
    });

    const roleStat = perRoleStats[item.groundTruthRole];
    if (roleStat) {
      roleStat.total++;
      if (isCorrect) roleStat.correct++;
    }
  }

  // Calculate precisions
  for (const role of ALLOWED_MODEL_ROLES) {
    const stat = perRoleStats[role];
    stat.precision =
      stat.total > 0 ? Number(((stat.correct / stat.total) * 100).toFixed(1)) : 100;
  }

  const correctCount = results.filter((r) => r.isCorrect).length;
  const accuracyPercentage = Number(
    ((correctCount / results.length) * 100).toFixed(1)
  );

  return {
    totalFiles: results.length,
    correctCount,
    accuracyPercentage,
    perRoleStats,
    items: results,
    model,
    evaluatedAt: new Date().toISOString(),
  };
}

