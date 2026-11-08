"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  OrganizationSwitcher,
  UserButton,
  useUser,
  useOrganization,
  useAuth,
  useSession,
} from "@clerk/nextjs";
import {
  Activity,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  GitCommit,
  GitBranch,
  Search,
  ExternalLink,
  Copy,
  Check,
  FolderGit2,
  ShieldCheck,
  Terminal,
  ArrowRight,
  Trash2,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { createSupabaseClient } from "@/lib/supabase/client";

export interface AnalysisItem {
  id: string;
  org_id: string;
  repository: string;
  branch: string;
  state: "queued" | "fetching" | "selecting" | "parsing" | "storing" | "complete" | "failed";
  stage?: string | null;
  errorMessage?: string | null;
  commit: string | null;
  started: string;
  finished: string;
  updatedAt?: string;
  isStale?: boolean;
}

// Seed catalog for development fallback
const SEED_CATALOG: Record<string, AnalysisItem[]> = {
  "org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot": [
    {
      id: "a1111111-0000-0000-0000-000000000001",
      org_id: "org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot",
      repository: "tailwindlabs/tailwindcss",
      branch: "main",
      state: "queued",
      stage: "queued",
      commit: null,
      started: "2m ago",
      finished: "—",
      updatedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    },
    {
      id: "a1111111-0000-0000-0000-000000000002",
      org_id: "org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot",
      repository: "vercel/next.js",
      branch: "canary",
      state: "parsing",
      stage: "parsing",
      commit: "a93be01",
      started: "3m ago",
      finished: "—",
      updatedAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    },
    {
      id: "a1111111-0000-0000-0000-000000000003",
      org_id: "org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot",
      repository: "shadcn-ui/ui",
      branch: "main",
      state: "failed",
      stage: "fetching",
      errorMessage: "Repository archive download timed out",
      commit: null,
      started: "5h ago",
      finished: "5h ago",
      updatedAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    },
    {
      id: "a1111111-0000-0000-0000-000000000004",
      org_id: "org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot",
      repository: "shadcn-ui/ui",
      branch: "main",
      state: "complete",
      stage: "complete",
      commit: "0c7d9e2",
      started: "24h ago",
      finished: "24h ago",
      updatedAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    },
    {
      id: "a1111111-0000-0000-0000-000000000005",
      org_id: "org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot",
      repository: "vercel/next.js",
      branch: "canary",
      state: "complete",
      stage: "complete",
      commit: "4f1c2a9",
      started: "3d ago",
      finished: "3d ago",
      updatedAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    },
  ],
  "org_3Lmw76eq1UOXrjIxXVQCz2u4tQN": [
    {
      id: "b1111111-0000-0000-0000-000000000001",
      org_id: "org_3Lmw76eq1UOXrjIxXVQCz2u4tQN",
      repository: "starlight/engine",
      branch: "release-2.4",
      state: "complete",
      stage: "complete",
      commit: "7c82e01",
      started: "1h ago",
      finished: "1h ago",
      updatedAt: new Date(Date.now() - 3600 * 1000).toISOString(),
    },
    {
      id: "b1111111-0000-0000-0000-000000000002",
      org_id: "org_3Lmw76eq1UOXrjIxXVQCz2u4tQN",
      repository: "starlight/neural-planner",
      branch: "dev",
      state: "parsing",
      stage: "parsing",
      commit: "3e41b99",
      started: "2h ago",
      finished: "—",
      updatedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    },
  ],
  "org_3Lmw8FmXBEWmfYn2jEGFko161Oa": [],
};

SEED_CATALOG["org_seed_alpha"] = SEED_CATALOG["org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot"];
SEED_CATALOG["org_seed_beta"] = SEED_CATALOG["org_3Lmw76eq1UOXrjIxXVQCz2u4tQN"];
SEED_CATALOG["org_seed_gamma_empty"] = [];

function formatRelativeTime(isoString?: string | null): string {
  if (!isoString) return "—";
  try {
    const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (diffSec < 60) return `${Math.max(1, diffSec)}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return "—";
  }
}

function extractRepoName(url: string): string {
  if (!url) return "repository";
  const cleaned = url.replace(/\/+$/, "").replace(/\.git$/, "");
  const parts = cleaned.split("/");
  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
  }
  return parts[parts.length - 1] || "repository";
}

function mapStatusToState(
  status: string,
  stage?: string | null
): "queued" | "fetching" | "selecting" | "parsing" | "storing" | "complete" | "failed" {
  if (status === "completed" || stage === "complete") return "complete";
  if (status === "failed") return "failed";
  if (stage === "fetching") return "fetching";
  if (stage === "selecting") return "selecting";
  if (stage === "storing") return "storing";
  if (stage === "queued" || status === "pending") return "queued";
  return "parsing";
}

interface AnalysisRawRecord {
  id: string;
  org_id: string;
  repository_url: string;
  branch: string;
  status: string;
  stage: string | null;
  error_message: string | null;
  commit_hash: string | null;
  created_at: string;
  updated_at: string;
}

function transformRawToItem(r: AnalysisRawRecord): AnalysisItem {
  const state = mapStatusToState(r.status, r.stage);
  const isStale =
    state !== "complete" &&
    state !== "failed" &&
    Date.now() - new Date(r.updated_at).getTime() > 3 * 60 * 1000;

  return {
    id: r.id,
    org_id: r.org_id,
    repository: extractRepoName(r.repository_url),
    branch: r.branch || "main",
    state,
    stage: r.stage,
    errorMessage: r.error_message,
    commit: r.commit_hash ? r.commit_hash.slice(0, 7) : null,
    started: formatRelativeTime(r.created_at),
    finished:
      state === "complete" || state === "failed"
        ? formatRelativeTime(r.updated_at)
        : "—",
    updatedAt: r.updated_at,
    isStale,
  };
}

export function WorkspaceDashboard({
  initialOrgId,
  initialRecords,
}: {
  initialOrgId?: string | null;
  initialRecords?: AnalysisRawRecord[];
}) {
  const router = useRouter();
  const { isLoaded: isAuthLoaded, isSignedIn, getToken } = useAuth();
  const { session } = useSession();
  const { user } = useUser();
  const { organization } = useOrganization();

  const [searchQuery, setSearchQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<"all" | "active" | "complete" | "failed">("all");
  const [copiedCommit, setCopiedCommit] = useState<string | null>(null);

  // Ingestion Form State
  const [repoInput, setRepoInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Live Analyses State initialized from Server Component props
  const [analyses, setAnalyses] = useState<AnalysisItem[]>(() => {
    if (initialRecords !== undefined) {
      return initialRecords.map(transformRawToItem);
    }
    const org = initialOrgId || "org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot";
    return SEED_CATALOG[org] || SEED_CATALOG["org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot"] || [];
  });

  // Redirect to sign in if signed out
  useEffect(() => {
    if (isAuthLoaded && !isSignedIn) {
      router.replace("/sign-in");
    }
  }, [isAuthLoaded, isSignedIn, router]);

  const activeOrgId =
    organization?.id ||
    initialOrgId ||
    "org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot";

  const defaultDisplayName =
    user?.fullName ||
    user?.firstName ||
    user?.username ||
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    "SAKTHIVEL";

  const activeOrgName =
    organization?.name ||
    `${defaultDisplayName}'s Organization`;

  // Asynchronous background refresh on org switch
  useEffect(() => {
    let isSubscribed = true;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`/api/analyses?orgId=${encodeURIComponent(activeOrgId)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (res.ok) {
          const data = await res.json();
          if (isSubscribed && data && Array.isArray(data.analyses)) {
            setAnalyses(data.analyses.map(transformRawToItem));
          }
        }
      } catch {
        // Handled silently
      }
    })();

    return () => {
      isSubscribed = false;
    };
  }, [activeOrgId, getToken]);

  // Realtime live update: listen to database broadcasts on org:<activeOrgId>
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const supabase = createSupabaseClient(session || getToken);

    async function subscribeOrg() {
      if (!activeOrgId) return;

      try {
        const token = await (session
          ? session.getToken({ template: "supabase" })
          : getToken());

        if (token && supabase.realtime) {
          await supabase.realtime.setAuth(token);
        }

        channel = supabase.channel(`org:${activeOrgId}`, {
          config: { private: true },
        });

        channel
          .on("broadcast", { event: "analysis_updated" }, (msg) => {
            const payload = msg.payload || msg;
            if (payload && payload.analysis_id) {
              setAnalyses((prev) => {
                const existingIdx = prev.findIndex((a) => a.id === payload.analysis_id);
                const state = mapStatusToState(payload.status, payload.stage);
                const isStale =
                  state !== "complete" &&
                  state !== "failed" &&
                  Date.now() - new Date(payload.updated_at || Date.now()).getTime() > 3 * 60 * 1000;

                const updatedItem: AnalysisItem = {
                  id: payload.analysis_id,
                  org_id: payload.org_id || activeOrgId,
                  repository: extractRepoName(payload.repository_url || ""),
                  branch: payload.branch || "main",
                  state,
                  stage: payload.stage,
                  errorMessage: payload.error_message,
                  commit: payload.commit_hash ? payload.commit_hash.slice(0, 7) : null,
                  started: "Just now",
                  finished:
                    state === "complete" || state === "failed"
                      ? "Just now"
                      : "—",
                  updatedAt: payload.updated_at || new Date().toISOString(),
                  isStale,
                };

                if (existingIdx >= 0) {
                  const next = [...prev];
                  next[existingIdx] = { ...next[existingIdx], ...updatedItem };
                  return next;
                } else {
                  return [updatedItem, ...prev];
                }
              });
            }
          })
          .subscribe();
      } catch {
        // Handled silently
      }
    }

    subscribeOrg();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [activeOrgId, session, getToken]);

  // Handle repository ingestion form submission
  const handleAnalyzeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = repoInput.trim();
    if (!url) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      const token = await getToken();
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          repositoryUrl: url,
          orgId: activeOrgId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || "Failed to initiate analysis.");
        setIsSubmitting(false);
        return;
      }

      if (data.redirectTo) {
        router.push(data.redirectTo);
      } else if (data.analysisId) {
        router.push(`/analysis/${data.analysisId}`);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Network error. Try again.");
      setIsSubmitting(false);
    }
  };

  // Handle repository analysis deletion
  const handleDeleteAnalysis = async (id: string, repoName: string) => {
    const confirmDelete = window.confirm(
      `Delete analysis for "${repoName}"? This will permanently remove its parsed graph, files, and metrics.`
    );
    if (!confirmDelete) return;

    setDeletingId(id);
    try {
      const token = await getToken();
      const res = await fetch(`/api/analyses/${id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (res.ok) {
        setAnalyses((prev) => prev.filter((item) => item.id !== id));
      } else {
        const errData = await res.json().catch(() => null);
        alert(errData?.error || "Failed to delete analysis.");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error deleting analysis.");
    } finally {
      setDeletingId(null);
    }
  };

  // Filtered analyses based on search and status tabs
  const filteredAnalyses = useMemo(() => {
    return analyses.filter((item) => {
      const matchesSearch =
        searchQuery.trim() === "" ||
        item.repository.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.commit && item.commit.toLowerCase().includes(searchQuery.toLowerCase()));

      let matchesState = true;
      if (stateFilter === "active") {
        matchesState = item.state !== "complete" && item.state !== "failed";
      } else if (stateFilter === "complete") {
        matchesState = item.state === "complete";
      } else if (stateFilter === "failed") {
        matchesState = item.state === "failed";
      }

      return matchesSearch && matchesState;
    });
  }, [analyses, searchQuery, stateFilter]);

  const stats = useMemo(() => {
    const total = analyses.length;
    const completed = analyses.filter((a) => a.state === "complete").length;
    const inProgress = analyses.filter((a) => a.state !== "complete" && a.state !== "failed").length;
    const failed = analyses.filter((a) => a.state === "failed").length;
    return { total, completed, inProgress, failed };
  }, [analyses]);

  const handleCopyCommit = (commit: string) => {
    if (!commit || commit === "—") return;
    navigator.clipboard.writeText(commit).then(() => {
      setCopiedCommit(commit);
      setTimeout(() => setCopiedCommit(null), 1800);
    });
  };

  return (
    <div className="min-h-screen bg-[#08090d] text-foreground flex flex-col font-times antialiased relative selection:bg-[#F64302] selection:text-white">
      {/* Background Atmosphere Glow */}
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-40"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 80% 50% at 50% -20%, rgba(246, 67, 2, 0.18), transparent 70%),
            radial-gradient(circle at 100% 100%, rgba(246, 67, 2, 0.08), transparent 50%),
            linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: "100% 100%, 100% 100%, 36px 36px, 36px 36px",
        }}
      />

      {/* Top Application Shell Header */}
      <header className="border-b border-white/10 bg-[#08090d]/85 backdrop-blur-xl sticky top-0 z-40 px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between transition-colors shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/workspace"
            className="flex items-center gap-2 group transition-opacity"
          >
            <div className="w-6 h-6 text-[#F64302] transition-transform group-hover:scale-105 duration-200">
              <svg
                width="24"
                height="24"
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
            <span className="font-times font-bold text-sm tracking-wide text-white hidden sm:inline">
              codograph
            </span>
          </Link>

          <span className="text-white/30 text-xs font-mono select-none">/</span>

          <OrganizationSwitcher
            hidePersonal={true}
            afterSelectOrganizationUrl="/workspace"
            afterCreateOrganizationUrl="/workspace"
            afterLeaveOrganizationUrl="/workspace"
            appearance={{
              elements: {
                rootBox: "flex items-center",
                organizationSwitcherTrigger:
                  "py-1 px-2.5 rounded-lg border border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06] text-xs font-times font-medium text-white transition-all gap-2 shadow-inner",
                organizationPreviewAvatarBox: "w-4 h-4 rounded text-[10px] bg-[#F64302]/20 border border-[#F64302]/40 text-[#F64302] font-bold flex items-center justify-center",
                organizationPreviewTextContainer: "text-xs text-white font-medium",
              },
            }}
          />
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-mono text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[10px] font-medium tracking-tight">RLS ENFORCED</span>
          </div>

          <ThemeToggle />

          <UserButton
            appearance={{
              elements: {
                userButtonAvatarBox: "w-7 h-7 rounded-full border border-white/20 shadow-sm",
              },
            }}
          />
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 z-10">
        {/* Workspace Title & Stats Row */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-normal font-times">
                {activeOrgName}
              </h1>
              <Badge
                variant="outline"
                className="border-[#F64302]/30 bg-[#F64302]/10 text-[#F64302] font-mono text-[11px] px-2 py-0.5"
              >
                {stats.total} {stats.total === 1 ? "analysis" : "analyses"}
              </Badge>
            </div>
            <p className="text-sm text-white/60 font-times italic">
              Live multi-tenant code intelligence workspace. Scoped by Clerk & PostgreSQL RLS.
            </p>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-[#0c0d14]/80 border border-white/10 rounded-xl px-3.5 py-2 backdrop-blur-md">
              <div className="text-[11px] text-white/50 uppercase tracking-wider font-times">Total</div>
              <div className="text-lg font-bold text-white font-times">{stats.total}</div>
            </div>

            <div className="bg-[#0c0d14]/80 border border-white/10 rounded-xl px-3.5 py-2 backdrop-blur-md">
              <div className="text-[11px] text-cyan-400/80 uppercase tracking-wider font-times flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                Active
              </div>
              <div className="text-lg font-bold text-cyan-300 font-times">{stats.inProgress}</div>
            </div>

            <div className="bg-[#0c0d14]/80 border border-white/10 rounded-xl px-3.5 py-2 backdrop-blur-md">
              <div className="text-[11px] text-emerald-400/80 uppercase tracking-wider font-times flex items-center gap-1">
                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                Passed
              </div>
              <div className="text-lg font-bold text-emerald-400 font-times">{stats.completed}</div>
            </div>

            <div className="bg-[#0c0d14]/80 border border-white/10 rounded-xl px-3.5 py-2 backdrop-blur-md">
              <div className="text-[11px] text-rose-400/80 uppercase tracking-wider font-times flex items-center gap-1">
                <AlertCircle className="w-2.5 h-2.5 text-rose-400" />
                Failed
              </div>
              <div className="text-lg font-bold text-rose-400 font-times">{stats.failed}</div>
            </div>
          </div>
        </div>

        {/* Phase 7: Repository Ingestion Form */}
        <form onSubmit={handleAnalyzeSubmit} className="mb-8">
          <div className="rounded-2xl border border-white/10 bg-[#0c0d14]/80 backdrop-blur-xl p-4 sm:p-5 shadow-2xl">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative flex-1">
                <FolderGit2 className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  type="text"
                  value={repoInput}
                  onChange={(e) => {
                    setRepoInput(e.target.value);
                    setFormError(null);
                  }}
                  placeholder="Paste a public GitHub repo URL (e.g. https://github.com/facebook/react)"
                  disabled={isSubmitting}
                  className="w-full bg-white/[0.03] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-white/30 font-times focus:outline-none focus:border-[#F64302]/60 focus:ring-1 focus:ring-[#F64302]/40 transition-all disabled:opacity-50"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !repoInput.trim()}
                className="px-5 py-2.5 rounded-xl bg-[#F64302] hover:bg-[#F64302]/90 disabled:opacity-40 disabled:hover:bg-[#F64302] text-white font-times text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-md shrink-0 cursor-pointer disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <span>Analyze</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>

            {formError && (
              <div className="mt-3 text-xs font-times text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-1.5 flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{formError}</span>
              </div>
            )}
          </div>
        </form>

        {/* Controls Toolbar: Search & State Filter Tabs */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
          <div className="inline-flex items-center rounded-xl border border-white/10 bg-white/[0.02] p-1 text-xs font-times">
            <button
              onClick={() => setStateFilter("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium font-times transition-all ${
                stateFilter === "all"
                  ? "bg-white text-black font-semibold shadow-sm"
                  : "text-white/60 hover:text-white"
              }`}
            >
              All ({stats.total})
            </button>
            <button
              onClick={() => setStateFilter("active")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium font-times transition-all ${
                stateFilter === "active"
                  ? "bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30"
                  : "text-white/60 hover:text-cyan-300"
              }`}
            >
              Active ({stats.inProgress})
            </button>
            <button
              onClick={() => setStateFilter("complete")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium font-times transition-all ${
                stateFilter === "complete"
                  ? "bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30"
                  : "text-white/60 hover:text-emerald-300"
              }`}
            >
              Complete ({stats.completed})
            </button>
            <button
              onClick={() => setStateFilter("failed")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium font-times transition-all ${
                stateFilter === "failed"
                  ? "bg-rose-500/20 text-rose-300 font-semibold border border-rose-500/30"
                  : "text-white/60 hover:text-rose-300"
              }`}
            >
              Failed ({stats.failed})
            </button>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              placeholder="Filter repository or commit..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0c0d14]/90 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-white/30 font-times focus:outline-none focus:border-[#F64302]/60 focus:ring-1 focus:ring-[#F64302]/40 transition-all"
            />
          </div>
        </div>

        {/* Analyses Table Card Container */}
        <div className="rounded-2xl border border-white/10 bg-[#0c0d14]/80 backdrop-blur-xl shadow-2xl overflow-hidden transition-all">
          <div className="overflow-x-auto">
            <table className="w-full text-left font-times text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02] text-xs font-times text-white/60 tracking-normal">
                  <th className="py-3 px-5 font-semibold w-[36%] font-times">
                    <span className="flex items-center gap-1.5">
                      <FolderGit2 className="w-3.5 h-3.5 text-white/40" />
                      Repository
                    </span>
                  </th>
                  <th className="py-3 px-5 font-semibold w-[28%] font-times">
                    <span className="flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-white/40" />
                      State
                    </span>
                  </th>
                  <th className="py-3 px-5 font-semibold w-[12%] font-times">
                    <span className="flex items-center gap-1.5">
                      <GitCommit className="w-3.5 h-3.5 text-white/40" />
                      Commit
                    </span>
                  </th>
                  <th className="py-3 px-5 font-semibold w-[12%] font-times">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-white/40" />
                      Started
                    </span>
                  </th>
                  <th className="py-3 px-5 font-semibold w-[12%] font-times">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-white/40" />
                      Finished
                    </span>
                  </th>
                  <th className="py-3 px-4 font-semibold text-right w-[6%] font-times">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/[0.06]">
                {filteredAnalyses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center">
                      <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                        <div className="w-10 h-10 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-white/40 mb-3">
                          <Terminal className="w-5 h-5" />
                        </div>
                        <p className="text-base font-semibold text-white mb-1 font-times">
                          No analyses match your criteria
                        </p>
                        <p className="text-xs text-white/50 font-times">
                          {searchQuery || stateFilter !== "all"
                            ? "Try resetting the search query or status filter."
                            : `Paste a repository URL above to start an analysis for ${activeOrgName}.`}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredAnalyses.map((item) => {
                    const isQueued = item.state === "queued";
                    const isComplete = item.state === "complete";
                    const isFailed = item.state === "failed";
                    const isActive = !isComplete && !isFailed && !isQueued;
                    const stageLabel = item.stage || item.state;

                    // Link target: completed goes to preview/map, active/failed goes to progress page
                    const targetLink = isComplete
                      ? `/preview?id=${item.id}`
                      : `/analysis/${item.id}`;

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-white/[0.03] transition-colors group"
                      >
                        {/* Repository Column */}
                        <td className="py-3.5 px-5 text-white font-times">
                          <div className="flex items-center gap-2.5">
                            <Link
                              href={targetLink}
                              className="font-semibold text-white hover:text-[#F64302] transition-colors text-sm font-times tracking-normal underline decoration-dotted underline-offset-4"
                              title="View analysis details"
                            >
                              {item.repository}
                            </Link>
                            <span className="inline-flex items-center gap-1 text-[10px] text-white/40 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/5 font-mono">
                              <GitBranch className="w-2.5 h-2.5 text-white/30" />
                              {item.branch}
                            </span>
                            <a
                              href={`https://github.com/${item.repository}`}
                              target="_blank"
                              rel="noreferrer"
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-white/40 hover:text-white"
                              title="Open GitHub repository"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </td>

                        {/* State Column with Badges */}
                        <td className="py-3.5 px-5 font-mono">
                          <div>
                            {isQueued && (
                              <Badge
                                variant="warning"
                                className="font-mono text-[11px] gap-1.5 px-2.5 py-0.5 shadow-sm"
                              >
                                <Clock className="w-3 h-3 text-amber-400" />
                                queued
                              </Badge>
                            )}

                            {isActive && (
                              <Link href={`/analysis/${item.id}`}>
                                <Badge
                                  variant="info"
                                  className="font-mono text-[11px] gap-1.5 px-2.5 py-0.5 shadow-sm animate-pulse cursor-pointer"
                                >
                                  <Loader2 className="w-3 h-3 text-cyan-400 animate-spin" />
                                  <span>{stageLabel}</span>
                                  {item.isStale && (
                                    <span className="text-[10px] text-amber-300 ml-1">
                                      · stale
                                    </span>
                                  )}
                                </Badge>
                              </Link>
                            )}

                            {isComplete && (
                              <Link href={`/preview?id=${item.id}`} title="Open canvas map preview">
                                <Badge
                                  variant="success"
                                  className="font-mono text-[11px] gap-1.5 px-2.5 py-0.5 shadow-sm hover:ring-1 hover:ring-emerald-400/50 cursor-pointer"
                                >
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                  complete
                                </Badge>
                              </Link>
                            )}

                            {isFailed && (
                              <Link href={`/analysis/${item.id}`}>
                                <Badge
                                  variant="destructive"
                                  className="font-mono text-[11px] gap-1.5 px-2.5 py-0.5 shadow-sm bg-rose-500/10 text-rose-300 border border-rose-500/20 cursor-pointer"
                                >
                                  <AlertCircle className="w-3 h-3 text-rose-400" />
                                  failed
                                </Badge>
                              </Link>
                            )}

                            {/* Multiline error diagnostic underneath failed status */}
                            {isFailed && item.errorMessage && (
                              <div className="bg-rose-950/30 border border-rose-500/20 text-rose-300/90 font-mono text-[11px] rounded-lg p-2 mt-2 leading-relaxed flex items-start gap-2 shadow-inner">
                                <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                                <span>{item.errorMessage}</span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Commit Column */}
                        <td className="py-3.5 px-5 text-white/60 font-mono">
                          {item.commit ? (
                            <button
                              onClick={() => handleCopyCommit(item.commit!)}
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 text-[11px] text-white/70 hover:text-white transition-all active:scale-95 group/commit"
                              title="Click to copy commit hash"
                            >
                              <GitCommit className="w-3 h-3 text-white/40 group-hover/commit:text-[#F64302] transition-colors" />
                              <span>{item.commit}</span>
                              {copiedCommit === item.commit ? (
                                <Check className="w-2.5 h-2.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-2.5 h-2.5 text-white/30 opacity-0 group-hover/commit:opacity-100 transition-opacity" />
                              )}
                            </button>
                          ) : (
                            <span className="text-white/30 font-mono">—</span>
                          )}
                        </td>

                        {/* Started Column */}
                        <td className="py-3.5 px-5 text-white/70 font-times text-xs">
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3 text-white/30" />
                            {item.started}
                          </span>
                        </td>

                        {/* Finished Column */}
                        <td className="py-3.5 px-5 text-white/70 font-times text-xs">
                          {item.finished === "—" ? (
                            <span className="text-white/30 font-times">—</span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-white/70">
                              <CheckCircle2 className="w-3 h-3 text-white/30" />
                              {item.finished}
                            </span>
                          )}
                        </td>

                        {/* Actions Column */}
                        <td className="py-3.5 px-4 text-right font-mono text-xs">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteAnalysis(item.id, item.repository);
                            }}
                            disabled={deletingId === item.id}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-white/30 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all opacity-80 group-hover:opacity-100 disabled:opacity-50"
                            title={`Delete analysis for ${item.repository}`}
                            aria-label={`Delete ${item.repository}`}
                          >
                            {deletingId === item.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer info note */}
        <div className="mt-4 flex items-center justify-between text-xs text-white/40 font-times px-2">
          <span>Row Level Security: active org `{activeOrgId}`</span>
          <span>CodoGraph Core v0.2.0</span>
        </div>
      </main>
    </div>
  );
}
