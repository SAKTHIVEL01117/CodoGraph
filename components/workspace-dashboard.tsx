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
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";

export interface AnalysisItem {
  id: string;
  org_id: string;
  repository: string;
  branch: string;
  state: "queued" | "parsing" | "complete" | "failed";
  errorMessage?: string | null;
  commit: string | null;
  started: string;
  finished: string;
}

// Exact seeded analyses catalog matching Phase 2 specifications and the reference design
const ANALYSES_BY_ORG: Record<string, AnalysisItem[]> = {
  // Primary User Organization (SAKTHIVEL's Organization) & Alpha Org
  "org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot": [
    {
      id: "1",
      org_id: "org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot",
      repository: "tailwindlabs/tailwindcss",
      branch: "main",
      state: "queued",
      commit: null,
      started: "2m ago",
      finished: "—",
    },
    {
      id: "2",
      org_id: "org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot",
      repository: "vercel/next.js",
      branch: "canary",
      state: "parsing",
      commit: "a93be01",
      started: "3m ago",
      finished: "—",
    },
    {
      id: "3",
      org_id: "org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot",
      repository: "shadcn-ui/ui",
      branch: "main",
      state: "failed",
      errorMessage: "Repository archive download timed out",
      commit: null,
      started: "5h ago",
      finished: "5h ago",
    },
    {
      id: "4",
      org_id: "org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot",
      repository: "shadcn-ui/ui",
      branch: "main",
      state: "complete",
      commit: "0c7d9e2",
      started: "24h ago",
      finished: "24h ago",
    },
    {
      id: "5",
      org_id: "org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot",
      repository: "vercel/next.js",
      branch: "canary",
      state: "complete",
      commit: "4f1c2a9",
      started: "3d ago",
      finished: "3d ago",
    },
  ],
  // Starlight Autonomous Core (2 analyses)
  "org_3Lmw76eq1UOXrjIxXVQCz2u4tQN": [
    {
      id: "6",
      org_id: "org_3Lmw76eq1UOXrjIxXVQCz2u4tQN",
      repository: "starlight/engine",
      branch: "release-2.4",
      state: "complete",
      commit: "7c82e01",
      started: "1h ago",
      finished: "1h ago",
    },
    {
      id: "7",
      org_id: "org_3Lmw76eq1UOXrjIxXVQCz2u4tQN",
      repository: "starlight/neural-planner",
      branch: "dev",
      state: "parsing",
      commit: "3e41b99",
      started: "2h ago",
      finished: "—",
    },
  ],
  // Zero Analyses Sandbox (0 analyses empty state)
  "org_3Lmw8FmXBEWmfYn2jEGFko161Oa": [],
};

// Aliases for test orgs
ANALYSES_BY_ORG["org_seed_alpha"] = ANALYSES_BY_ORG["org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot"];
ANALYSES_BY_ORG["org_seed_beta"] = ANALYSES_BY_ORG["org_3Lmw76eq1UOXrjIxXVQCz2u4tQN"];
ANALYSES_BY_ORG["org_seed_gamma_empty"] = [];

export function WorkspaceDashboard({ initialOrgId }: { initialOrgId?: string | null }) {
  const router = useRouter();
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { organization } = useOrganization();

  const [searchQuery, setSearchQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<"all" | "queued" | "parsing" | "complete" | "failed">("all");
  const [copiedCommit, setCopiedCommit] = useState<string | null>(null);

  // Redirect to sign in if auth finishes loading and user is signed out
  useEffect(() => {
    if (isAuthLoaded && !isSignedIn) {
      router.replace("/sign-in");
    }
  }, [isAuthLoaded, isSignedIn, router]);

  // Derive dynamic organization name from live user credentials
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

  // Look up analyses for the active org; default to primary 5 analyses
  const rawAnalyses =
    ANALYSES_BY_ORG[activeOrgId] !== undefined
      ? ANALYSES_BY_ORG[activeOrgId]
      : ANALYSES_BY_ORG["org_3Lm8dLnB8PvGRkr3BO5Wdz0g3Ot"];

  // Filtered analyses based on search and status tabs
  const filteredAnalyses = useMemo(() => {
    return rawAnalyses.filter((item) => {
      const matchesSearch =
        searchQuery.trim() === "" ||
        item.repository.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.commit && item.commit.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesState = stateFilter === "all" || item.state === stateFilter;

      return matchesSearch && matchesState;
    });
  }, [rawAnalyses, searchQuery, stateFilter]);

  const stats = useMemo(() => {
    const total = rawAnalyses.length;
    const completed = rawAnalyses.filter((a) => a.state === "complete").length;
    const inProgress = rawAnalyses.filter((a) => a.state === "parsing" || a.state === "queued").length;
    const failed = rawAnalyses.filter((a) => a.state === "failed").length;
    return { total, completed, inProgress, failed };
  }, [rawAnalyses]);

  const handleCopyCommit = (commit: string) => {
    if (!commit || commit === "—") return;
    navigator.clipboard.writeText(commit).then(() => {
      setCopiedCommit(commit);
      setTimeout(() => setCopiedCommit(null), 1800);
    });
  };

  return (
    <div className="min-h-screen bg-[#08090d] text-foreground flex flex-col font-jetbrains antialiased relative selection:bg-[#F64302] selection:text-white">
      {/* Background Atmosphere Glow inspired by CodoGraph landing page */}
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

      {/* Top Application Shell Header matching reference */}
      <header className="border-b border-white/10 bg-[#08090d]/85 backdrop-blur-xl sticky top-0 z-40 px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between transition-colors shadow-sm">
        {/* Left: Brand mark + slash + Organization */}
        <div className="flex items-center gap-3">
          <Link
            href="/workspace"
            className="flex items-center gap-2 group transition-opacity"
          >
            {/* CodoGraph abstract four-wing wind-rose SVG in vibrant orange */}
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
            <span className="font-jetbrains font-bold text-xs tracking-wider text-white hidden sm:inline">
              codograph
            </span>
          </Link>

          <span className="text-white/30 text-xs font-mono select-none">/</span>

          {/* Clerk Organization Switcher */}
          <OrganizationSwitcher
            hidePersonal={true}
            afterSelectOrganizationUrl="/workspace"
            afterCreateOrganizationUrl="/workspace"
            afterLeaveOrganizationUrl="/workspace"
            appearance={{
              elements: {
                rootBox: "flex items-center",
                organizationSwitcherTrigger:
                  "py-1 px-2.5 rounded-lg border border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06] text-xs font-jetbrains font-medium text-white transition-all gap-2 shadow-inner",
                organizationPreviewAvatarBox: "w-4 h-4 rounded text-[10px] bg-[#F64302]/20 border border-[#F64302]/40 text-[#F64302] font-bold flex items-center justify-center",
                organizationPreviewTextContainer: "text-xs text-white font-medium",
              },
            }}
          />
        </div>

        {/* Right: Security Status + Segmented Theme Toggle & User Button */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Security invariant badge */}
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
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight font-jetbrains">
                {activeOrgName}
              </h1>
              <Badge
                variant="outline"
                className="border-[#F64302]/30 bg-[#F64302]/10 text-[#F64302] font-mono text-[11px] px-2 py-0.5"
              >
                {stats.total} {stats.total === 1 ? "analysis" : "analyses"}
              </Badge>
            </div>
            <p className="text-xs text-white/50 font-mono">
              Live multi-tenant code intelligence workspace. Scoped by Clerk & PostgreSQL RLS.
            </p>
          </div>

          {/* Quick Stats Grid (Watermelon UI Style) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-[#0c0d14]/80 border border-white/10 rounded-xl px-3.5 py-2 backdrop-blur-md">
              <div className="text-[10px] text-white/40 uppercase tracking-wider font-mono">Total</div>
              <div className="text-base font-bold text-white font-mono">{stats.total}</div>
            </div>

            <div className="bg-[#0c0d14]/80 border border-white/10 rounded-xl px-3.5 py-2 backdrop-blur-md">
              <div className="text-[10px] text-cyan-400/70 uppercase tracking-wider font-mono flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                Active
              </div>
              <div className="text-base font-bold text-cyan-300 font-mono">{stats.inProgress}</div>
            </div>

            <div className="bg-[#0c0d14]/80 border border-white/10 rounded-xl px-3.5 py-2 backdrop-blur-md">
              <div className="text-[10px] text-emerald-400/70 uppercase tracking-wider font-mono flex items-center gap-1">
                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                Passed
              </div>
              <div className="text-base font-bold text-emerald-400 font-mono">{stats.completed}</div>
            </div>

            <div className="bg-[#0c0d14]/80 border border-white/10 rounded-xl px-3.5 py-2 backdrop-blur-md">
              <div className="text-[10px] text-rose-400/70 uppercase tracking-wider font-mono flex items-center gap-1">
                <AlertCircle className="w-2.5 h-2.5 text-rose-400" />
                Failed
              </div>
              <div className="text-base font-bold text-rose-400 font-mono">{stats.failed}</div>
            </div>
          </div>
        </div>

        {/* Controls Toolbar: Search & State Filter Tabs */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
          {/* State Filter Tabs (Shadcn segmented tabs) */}
          <div className="inline-flex items-center rounded-xl border border-white/10 bg-white/[0.02] p-1 text-xs font-mono">
            <button
              onClick={() => setStateFilter("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                stateFilter === "all"
                  ? "bg-white text-black font-semibold shadow-sm"
                  : "text-white/60 hover:text-white"
              }`}
            >
              All ({stats.total})
            </button>
            <button
              onClick={() => setStateFilter("parsing")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                stateFilter === "parsing"
                  ? "bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30"
                  : "text-white/60 hover:text-cyan-300"
              }`}
            >
              Parsing
            </button>
            <button
              onClick={() => setStateFilter("queued")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                stateFilter === "queued"
                  ? "bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30"
                  : "text-white/60 hover:text-amber-300"
              }`}
            >
              Queued
            </button>
            <button
              onClick={() => setStateFilter("complete")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                stateFilter === "complete"
                  ? "bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30"
                  : "text-white/60 hover:text-emerald-300"
              }`}
            >
              Complete
            </button>
            <button
              onClick={() => setStateFilter("failed")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                stateFilter === "failed"
                  ? "bg-rose-500/20 text-rose-300 font-semibold border border-rose-500/30"
                  : "text-white/60 hover:text-rose-300"
              }`}
            >
              Failed
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
              className="w-full bg-[#0c0d14]/90 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-white/30 font-mono focus:outline-none focus:border-[#F64302]/60 focus:ring-1 focus:ring-[#F64302]/40 transition-all"
            />
          </div>
        </div>

        {/* 5-Column Analyses Table Card Container (Watermelon / Shadcn Styling) */}
        <div className="rounded-2xl border border-white/10 bg-[#0c0d14]/80 backdrop-blur-xl shadow-2xl overflow-hidden transition-all">
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02] text-[11px] text-white/50 tracking-wider">
                  <th className="py-3 px-5 font-medium w-[36%]">
                    <span className="flex items-center gap-1.5">
                      <FolderGit2 className="w-3.5 h-3.5 text-white/40" />
                      Repository
                    </span>
                  </th>
                  <th className="py-3 px-5 font-medium w-[28%]">
                    <span className="flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-white/40" />
                      State
                    </span>
                  </th>
                  <th className="py-3 px-5 font-medium w-[12%]">
                    <span className="flex items-center gap-1.5">
                      <GitCommit className="w-3.5 h-3.5 text-white/40" />
                      Commit
                    </span>
                  </th>
                  <th className="py-3 px-5 font-medium w-[12%]">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-white/40" />
                      Started
                    </span>
                  </th>
                  <th className="py-3 px-5 font-medium w-[12%]">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-white/40" />
                      Finished
                    </span>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/[0.06]">
                {filteredAnalyses.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-16 text-center">
                      <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                        <div className="w-10 h-10 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-white/40 mb-3">
                          <Terminal className="w-5 h-5" />
                        </div>
                        <p className="text-sm font-semibold text-white mb-1">
                          No analyses match your criteria
                        </p>
                        <p className="text-xs text-white/40 font-mono">
                          {searchQuery || stateFilter !== "all"
                            ? "Try resetting the search query or status filter."
                            : `No analyses run yet for ${activeOrgName}.`}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredAnalyses.map((item) => {
                    const isQueued = item.state === "queued";
                    const isParsing = item.state === "parsing";
                    const isComplete = item.state === "complete";
                    const isFailed = item.state === "failed";

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-white/[0.03] transition-colors group"
                      >
                        {/* Repository Column */}
                        <td className="py-3.5 px-5 text-white font-mono">
                          <div className="flex items-center gap-2.5">
                            <Link
                              href={`/preview?id=${item.id}`}
                              className="font-semibold text-white hover:text-[#F64302] transition-colors text-xs tracking-tight underline decoration-dotted underline-offset-4"
                              title="Open interactive canvas preview"
                            >
                              {item.repository}
                            </Link>
                            <span className="inline-flex items-center gap-1 text-[10px] text-white/40 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/5">
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

                        {/* State Column with Watermelon Status Badges */}
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

                            {isParsing && (
                              <Badge
                                variant="info"
                                className="font-mono text-[11px] gap-1.5 px-2.5 py-0.5 shadow-sm animate-pulse"
                              >
                                <Loader2 className="w-3 h-3 text-cyan-400 animate-spin" />
                                parsing
                              </Badge>
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
                              <Badge
                                variant="destructive"
                                className="font-mono text-[11px] gap-1.5 px-2.5 py-0.5 shadow-sm bg-rose-500/10 text-rose-300 border border-rose-500/20"
                              >
                                <AlertCircle className="w-3 h-3 text-rose-400" />
                                failed
                              </Badge>
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
                        <td className="py-3.5 px-5 text-white/60 font-mono text-xs">
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3 text-white/30" />
                            {item.started}
                          </span>
                        </td>

                        {/* Finished Column */}
                        <td className="py-3.5 px-5 text-white/60 font-mono text-xs">
                          {item.finished === "—" ? (
                            <span className="text-white/30 font-mono">—</span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-white/60">
                              <CheckCircle2 className="w-3 h-3 text-white/30" />
                              {item.finished}
                            </span>
                          )}
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
        <div className="mt-4 flex items-center justify-between text-[11px] text-white/30 font-mono px-2">
          <span>Row Level Security: active org `{activeOrgId}`</span>
          <span>CodoGraph Core v0.2.0</span>
        </div>
      </main>
    </div>
  );
}
