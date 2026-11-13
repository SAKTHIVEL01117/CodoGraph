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
  Users,
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
  initialOrgName,
  initialRecords = [],
  initialError = null,
  isOrgActivating = false,
}: {
  initialOrgId?: string | null;
  initialOrgName?: string | null;
  initialRecords?: AnalysisRawRecord[];
  initialError?: string | null;
  isOrgActivating?: boolean;
}) {
  const router = useRouter();
  const { isLoaded: isAuthLoaded, isSignedIn, getToken } = useAuth({
    treatPendingAsSignedOut: false,
  });
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

  // Live Analyses State initialized from Server Component props (zero seed fallback)
  const [analyses, setAnalyses] = useState<AnalysisItem[]>(() =>
    initialRecords.map(transformRawToItem)
  );
  const [loadError, setLoadError] = useState<string | null>(initialError);
  const [prevInitialRecords, setPrevInitialRecords] = useState(initialRecords);
  const [prevInitialError, setPrevInitialError] = useState(initialError);

  if (prevInitialRecords !== initialRecords) {
    setPrevInitialRecords(initialRecords);
    setAnalyses(initialRecords.map(transformRawToItem));
  }

  if (prevInitialError !== initialError) {
    setPrevInitialError(initialError);
    setLoadError(initialError);
  }

  // Redirect to sign in if signed out
  useEffect(() => {
    if (isAuthLoaded && !isSignedIn) {
      router.replace("/sign-in");
    }
  }, [isAuthLoaded, isSignedIn, router]);

  const activeOrgId = organization?.id || initialOrgId || null;

  const defaultDisplayName =
    user?.fullName ||
    user?.firstName ||
    user?.username ||
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    "Workspace";

  const activeOrgName =
    organization?.name ||
    initialOrgName ||
    `${defaultDisplayName}'s Organization`;

  // Refresh analyses via RLS-enforced endpoint once client organization is active / switched
  useEffect(() => {
    if (!isAuthLoaded || !isSignedIn || !organization?.id) return;

    let isSubscribed = true;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch("/api/analyses", {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          if (isSubscribed) {
            setLoadError(data?.error || `Failed to load workspace analyses (HTTP ${res.status}).`);
          }
          return;
        }

        if (isSubscribed && data && Array.isArray(data.analyses) && !data.orgPending) {
          setLoadError(null);
          setAnalyses(data.analyses.map(transformRawToItem));
        }
      } catch (err) {
        if (isSubscribed) {
          setLoadError(err instanceof Error ? err.message : "Network error loading analyses.");
        }
      }
    })();

    return () => {
      isSubscribed = false;
    };
  }, [isAuthLoaded, isSignedIn, organization?.id, getToken]);

  // Realtime live update: listen to database broadcasts on org:<activeOrgId>
  useEffect(() => {
    const subOrgId = organization?.id || activeOrgId;
    if (!isAuthLoaded || !isSignedIn || !subOrgId) return;

    let isSubscribed = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const supabase = createSupabaseClient(session || getToken);

    async function subscribeOrg() {
      if (!subOrgId) return;

      try {
        const token = await (session ? session.getToken() : getToken());
        if (!isSubscribed) return;

        if (token && supabase.realtime) {
          await supabase.realtime.setAuth(token);
        }

        channel = supabase.channel(`org:${subOrgId}`, {
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
                  org_id: payload.org_id || subOrgId,
                  repository: extractRepoName(payload.repository_url || ""),
                  branch: payload.branch || "main",
                  state,
                  stage: payload.stage,
                  errorMessage: payload.error_message,
                  commit: payload.commit_hash ? payload.commit_hash.slice(0, 7) : null,
                  started: existingIdx >= 0 ? prev[existingIdx].started : "Just now",
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
      } catch (err) {
        console.warn("[CodoGraph Realtime] Organization channel subscription error:", err);
      }
    }

    subscribeOrg();

    return () => {
      isSubscribed = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [isAuthLoaded, isSignedIn, organization?.id, activeOrgId, session, getToken]);

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
    <div className="min-h-screen bg-background text-foreground flex flex-col font-jetbrains antialiased relative selection:bg-primary selection:text-primary-foreground">
      {/* Subtle monochrome grid backdrop */}
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-35 dark:opacity-25"
        style={{
          backgroundImage: `
            linear-gradient(to right, var(--border) 1px, transparent 1px),
            linear-gradient(to bottom, var(--border) 1px, transparent 1px)
          `,
          backgroundSize: "36px 36px",
        }}
      />

      {/* Top Application Shell Header */}
      <header className="border-b border-border bg-card/85 backdrop-blur-xl sticky top-0 z-40 px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between transition-colors shadow-sm">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <Link
            href="/workspace"
            className="flex items-center gap-2 group transition-opacity"
          >
            <div className="w-6 h-6 text-primary transition-transform group-hover:scale-105 duration-200">
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
            <span className="font-jetbrains font-bold text-sm tracking-tight text-foreground hidden sm:inline">
              codograph
            </span>
          </Link>

          <span className="text-muted-foreground/50 text-xs font-mono select-none">/</span>

          <OrganizationSwitcher
            hidePersonal={true}
            afterSelectOrganizationUrl="/workspace"
            afterCreateOrganizationUrl="/workspace"
            afterLeaveOrganizationUrl="/workspace"
            appearance={{
              elements: {
                rootBox: "flex items-center",
                organizationSwitcherTrigger:
                  "py-1 px-2.5 rounded-lg border border-border bg-secondary/50 hover:bg-secondary text-xs font-jetbrains font-medium text-foreground transition-all gap-2",
                organizationPreviewAvatarBox:
                  "w-4 h-4 rounded text-[10px] bg-primary/15 border border-primary/30 text-primary font-bold flex items-center justify-center",
                organizationPreviewTextContainer: "text-xs text-foreground font-medium",
              },
            }}
          />

          <Link
            href="/evals"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-secondary/40 hover:bg-secondary hover:border-primary/40 text-xs font-jetbrains text-muted-foreground hover:text-foreground transition-colors"
            title="Model evaluation benchmark, hallucination checks, and prompt versions"
          >
            <Activity className="w-3.5 h-3.5 text-primary" />
            <span className="hidden sm:inline">Evals</span>
          </Link>

          <Link
            href="/team"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-secondary/40 hover:bg-secondary hover:border-primary/40 text-xs font-jetbrains text-muted-foreground hover:text-foreground transition-colors"
            title="Manage team members and invitations"
          >
            <Users className="w-3.5 h-3.5 text-primary" />
            <span className="hidden sm:inline">Team</span>
          </Link>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3.5">
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[11px] font-mono text-emerald-700 dark:text-emerald-400">
            <span className="inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="text-[10px] font-medium tracking-tight">RLS ENFORCED</span>
          </div>

          <ThemeToggle />

          <UserButton
            appearance={{
              elements: {
                userButtonAvatarBox: "w-7 h-7 rounded-full border border-border shadow-sm",
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
              <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
                {activeOrgName}
              </h1>
              <Badge
                variant="outline"
                className="border-primary/30 bg-primary/10 text-primary font-mono text-[11px] px-2 py-0.5"
              >
                {stats.total} {stats.total === 1 ? "analysis" : "analyses"}
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Multi-tenant codebase architecture workspace scoped by Clerk &amp; PostgreSQL RLS.
            </p>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-card/90 border border-border rounded-xl px-3.5 py-2 backdrop-blur-md">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</div>
              <div className="text-lg font-bold text-foreground">{stats.total}</div>
            </div>

            <div className="bg-card/90 border border-border rounded-xl px-3.5 py-2 backdrop-blur-md">
              <div className="text-[10px] text-sky-700 dark:text-sky-400 uppercase tracking-wider flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                Active
              </div>
              <div className="text-lg font-bold text-sky-700 dark:text-sky-300">{stats.inProgress}</div>
            </div>

            <div className="bg-card/90 border border-border rounded-xl px-3.5 py-2 backdrop-blur-md">
              <div className="text-[10px] text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                <CheckCircle2 className="w-2.5 h-2.5" />
                Complete
              </div>
              <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{stats.completed}</div>
            </div>

            <div className="bg-card/90 border border-border rounded-xl px-3.5 py-2 backdrop-blur-md">
              <div className="text-[10px] text-rose-700 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1">
                <AlertCircle className="w-2.5 h-2.5" />
                Failed
              </div>
              <div className="text-lg font-bold text-rose-700 dark:text-rose-400">{stats.failed}</div>
            </div>
          </div>
        </div>

        {/* Repository Ingestion Form */}
        <form onSubmit={handleAnalyzeSubmit} className="mb-8">
          <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl p-4 sm:p-5 shadow-sm dark:shadow-xl">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative flex-1">
                <FolderGit2 className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={repoInput}
                  onChange={(e) => {
                    setRepoInput(e.target.value);
                    setFormError(null);
                  }}
                  placeholder="Paste a public GitHub repo URL (e.g. https://github.com/facebook/react)"
                  disabled={isSubmitting}
                  className="w-full bg-background border border-input rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground/70 font-jetbrains focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/40 transition-all disabled:opacity-50"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !repoInput.trim()}
                className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:hover:bg-primary text-primary-foreground font-jetbrains text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-sm shrink-0 cursor-pointer disabled:cursor-not-allowed"
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
              <div className="mt-3 text-xs text-rose-700 dark:text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-1.5 flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{formError}</span>
              </div>
            )}
          </div>
        </form>

        {/* Controls Toolbar: Search & State Filter Tabs */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
          <div className="inline-flex items-center rounded-xl border border-border bg-secondary/50 p-1 text-xs">
            <button
              type="button"
              onClick={() => setStateFilter("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                stateFilter === "all"
                  ? "bg-foreground text-background font-semibold shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All ({stats.total})
            </button>
            <button
              type="button"
              onClick={() => setStateFilter("active")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                stateFilter === "active"
                  ? "bg-sky-500/15 text-sky-700 dark:text-sky-300 font-semibold border border-sky-500/30"
                  : "text-muted-foreground hover:text-sky-700 dark:hover:text-sky-300"
              }`}
            >
              Active ({stats.inProgress})
            </button>
            <button
              type="button"
              onClick={() => setStateFilter("complete")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                stateFilter === "complete"
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold border border-emerald-500/30"
                  : "text-muted-foreground hover:text-emerald-700 dark:hover:text-emerald-300"
              }`}
            >
              Complete ({stats.completed})
            </button>
            <button
              type="button"
              onClick={() => setStateFilter("failed")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                stateFilter === "failed"
                  ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 font-semibold border border-rose-500/30"
                  : "text-muted-foreground hover:text-rose-700 dark:hover:text-rose-300"
              }`}
            >
              Failed ({stats.failed})
            </button>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filter repository or commit..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-card border border-input rounded-xl pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/40 transition-all"
            />
          </div>
        </div>

        {/* Database / RLS Load Diagnostic Banner */}
        {loadError && (
          <div className="mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 px-4 py-3 text-xs font-mono text-rose-700 dark:text-rose-300 flex items-start gap-2.5 shadow-sm">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">
                Could not load repository analyses
              </div>
              <div className="opacity-90 mt-0.5">{loadError}</div>
            </div>
          </div>
        )}

        {/* Analyses Table Card Container */}
        <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-sm dark:shadow-xl overflow-hidden transition-all">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-secondary/40 text-xs text-muted-foreground tracking-normal">
                  <th className="py-3 px-5 font-semibold w-[36%]">
                    <span className="flex items-center gap-1.5">
                      <FolderGit2 className="w-3.5 h-3.5 text-muted-foreground/70" />
                      Repository
                    </span>
                  </th>
                  <th className="py-3 px-5 font-semibold w-[28%]">
                    <span className="flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-muted-foreground/70" />
                      State
                    </span>
                  </th>
                  <th className="py-3 px-5 font-semibold w-[12%]">
                    <span className="flex items-center gap-1.5">
                      <GitCommit className="w-3.5 h-3.5 text-muted-foreground/70" />
                      Commit
                    </span>
                  </th>
                  <th className="py-3 px-5 font-semibold w-[12%]">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground/70" />
                      Started
                    </span>
                  </th>
                  <th className="py-3 px-5 font-semibold w-[12%]">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground/70" />
                      Finished
                    </span>
                  </th>
                  <th className="py-3 px-4 font-semibold text-right w-[6%]">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-border/60">
                {filteredAnalyses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center">
                      <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                        <div className="w-10 h-10 rounded-2xl bg-secondary border border-border flex items-center justify-center text-muted-foreground mb-3">
                          <Terminal className="w-5 h-5" />
                        </div>
                        <p className="text-sm font-semibold text-foreground mb-1">
                          {isOrgActivating && !organization?.id
                            ? "Activating organization workspace..."
                            : "No analyses match your criteria"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {isOrgActivating && !organization?.id
                            ? "Syncing your Clerk organization session with PostgreSQL RLS."
                            : searchQuery || stateFilter !== "all"
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
                    const targetLink = `/analysis/${item.id}`;

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-secondary/40 transition-colors group"
                      >
                        {/* Repository Column */}
                        <td className="py-3.5 px-5 text-foreground">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <Link
                              href={targetLink}
                              className="font-semibold text-foreground hover:text-primary transition-colors text-xs sm:text-sm tracking-tight underline decoration-dotted underline-offset-4"
                              title="View analysis details"
                            >
                              {item.repository}
                            </Link>
                            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded border border-border font-mono">
                              <GitBranch className="w-2.5 h-2.5 opacity-70" />
                              {item.branch}
                            </span>
                            <a
                              href={`https://github.com/${item.repository}`}
                              target="_blank"
                              rel="noreferrer"
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
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
                              <Link href={`/analysis/${item.id}`}>
                                <Badge
                                  variant="warning"
                                  className="font-mono text-[11px] gap-1.5 px-2.5 py-0.5 shadow-xs cursor-pointer"
                                >
                                  <Clock className="w-3 h-3" />
                                  <span>queued</span>
                                  {item.isStale && (
                                    <span className="text-[10px] text-amber-800 dark:text-amber-300 ml-1">
                                      · stale
                                    </span>
                                  )}
                                </Badge>
                              </Link>
                            )}

                            {isActive && (
                              <Link href={`/analysis/${item.id}`}>
                                <Badge
                                  variant="info"
                                  className="font-mono text-[11px] gap-1.5 px-2.5 py-0.5 shadow-xs cursor-pointer"
                                >
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  <span>{stageLabel}</span>
                                  {item.isStale && (
                                    <span className="text-[10px] text-amber-700 dark:text-amber-300 ml-1">
                                      · stale
                                    </span>
                                  )}
                                </Badge>
                              </Link>
                            )}

                            {isComplete && (
                              <Link href={`/analysis/${item.id}`} title="Open repository architecture map">
                                <Badge
                                  variant="success"
                                  className="font-mono text-[11px] gap-1.5 px-2.5 py-0.5 shadow-xs hover:ring-1 hover:ring-emerald-500/40 cursor-pointer"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  complete
                                </Badge>
                              </Link>
                            )}

                            {isFailed && (
                              <Link href={`/analysis/${item.id}`}>
                                <Badge
                                  variant="destructive"
                                  className="font-mono text-[11px] gap-1.5 px-2.5 py-0.5 shadow-xs bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/25 cursor-pointer"
                                >
                                  <AlertCircle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                                  failed
                                </Badge>
                              </Link>
                            )}

                            {/* Multiline error diagnostic underneath failed status */}
                            {isFailed && item.errorMessage && (
                              <div className="bg-rose-500/10 border border-rose-500/25 text-rose-700 dark:text-rose-300 font-mono text-[11px] rounded-lg p-2 mt-2 leading-relaxed flex items-start gap-2">
                                <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                                <span>{item.errorMessage}</span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Commit Column */}
                        <td className="py-3.5 px-5 text-muted-foreground font-mono">
                          {item.commit ? (
                            <button
                              type="button"
                              onClick={() => handleCopyCommit(item.commit!)}
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-secondary/60 hover:bg-secondary border border-border text-[11px] text-foreground transition-all active:scale-95 group/commit cursor-pointer"
                              title="Click to copy commit hash"
                            >
                              <GitCommit className="w-3 h-3 text-muted-foreground group-hover/commit:text-primary transition-colors" />
                              <span>{item.commit}</span>
                              {copiedCommit === item.commit ? (
                                <Check className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                              ) : (
                                <Copy className="w-2.5 h-2.5 text-muted-foreground opacity-0 group-hover/commit:opacity-100 transition-opacity" />
                              )}
                            </button>
                          ) : (
                            <span className="text-muted-foreground/50 font-mono">—</span>
                          )}
                        </td>

                        {/* Started Column */}
                        <td className="py-3.5 px-5 text-muted-foreground text-xs">
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3 opacity-60" />
                            {item.started}
                          </span>
                        </td>

                        {/* Finished Column */}
                        <td className="py-3.5 px-5 text-muted-foreground text-xs">
                          {item.finished === "—" ? (
                            <span className="text-muted-foreground/50">—</span>
                          ) : (
                            <span className="flex items-center gap-1.5">
                              <CheckCircle2 className="w-3 h-3 opacity-60" />
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
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground/60 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all opacity-80 group-hover:opacity-100 disabled:opacity-50 cursor-pointer"
                            title={`Delete analysis for ${item.repository}`}
                            aria-label={`Delete ${item.repository}`}
                          >
                            {deletingId === item.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-500" />
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
        <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground px-2">
          <span>
            {activeOrgId
              ? `Row Level Security: active org ${activeOrgId}`
              : "Row Level Security: activating organization session..."}
          </span>
          <span>CodoGraph Workspace</span>
        </div>
      </main>
    </div>
  );
}
