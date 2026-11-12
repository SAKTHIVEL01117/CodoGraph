"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth, useSession } from "@clerk/nextjs";
import {
  Check,
  CheckCircle2,
  AlertCircle,
  Loader2,
  GitBranch,
  GitCommit,
  Radio,
  ExternalLink,
  ChevronRight,
  ArrowLeft,
  Clock,
  Terminal,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { createSupabaseClient } from "@/lib/supabase/client";
import type { PipelineStage, AnalysisRecord } from "@/lib/pipeline/storage";

interface StageConfig {
  key: PipelineStage;
  label: string;
  description: string;
}

const STAGES: StageConfig[] = [
  {
    key: "fetching",
    label: "Fetching repository",
    description: "Downloading public archive and extracting commit SHA",
  },
  {
    key: "selecting",
    label: "Selecting files",
    description: "Cataloging source code and filtering non-source files",
  },
  {
    key: "parsing",
    label: "Parsing AST",
    description: "Resolving module specifiers, cycles, and pure graph metrics",
  },
  {
    key: "storing",
    label: "Storing graph",
    description: "Persisting files, edges, insights, and roles into database",
  },
  {
    key: "complete",
    label: "Complete",
    description: "Graph persisted; ready to explore",
  },
];

const STAGE_ORDER: PipelineStage[] = [
  "fetching",
  "selecting",
  "parsing",
  "storing",
  "complete",
];

export interface AnalysisProgressViewProps {
  analysisId: string;
  initialAnalysis?: AnalysisRecord | null;
}

export function AnalysisProgressView({
  analysisId,
  initialAnalysis,
}: AnalysisProgressViewProps) {
  const router = useRouter();
  const { session } = useSession();
  const { getToken } = useAuth({ treatPendingAsSignedOut: false });

  const [analysis, setAnalysis] = useState<AnalysisRecord | null>(
    initialAnalysis || null
  );
  const [currentStage, setCurrentStage] = useState<PipelineStage | string>(
    initialAnalysis?.stage || "fetching"
  );
  const [status, setStatus] = useState<string>(
    initialAnalysis?.status || "pending"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialAnalysis?.error_message || null
  );
  const [commitHash, setCommitHash] = useState<string | null>(
    initialAnalysis?.commit_hash || null
  );
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const fetchLatest = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`/api/analyses/${analysisId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.analysis) {
        setAnalysis(data.analysis);
        setStatus(data.analysis.status);
        setCurrentStage(data.analysis.stage || "fetching");
        setCommitHash(data.analysis.commit_hash || null);
        setErrorMessage(data.analysis.error_message || null);
      }
    } catch {
      // Handled by realtime
    }
  }, [analysisId, getToken]);

  const handleRetry = async () => {
    if (isRetrying) return;
    setIsRetrying(true);
    setRetryError(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          rerunAnalysisId: analysisId,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setRetryError(data?.error || `Retry failed (HTTP ${res.status}).`);
        return;
      }
      setStatus("pending");
      setCurrentStage("fetching");
      setErrorMessage(null);
      setAnalysis((prev) =>
        prev
          ? {
              ...prev,
              status: "pending",
              stage: "fetching",
              error_message: null,
              updated_at: new Date().toISOString(),
            }
          : prev
      );
      router.refresh();
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "Network error retrying analysis.");
    } finally {
      setIsRetrying(false);
    }
  };

  // Parse repository name from URL (e.g. "tailwindlabs/tailwindcss")
  const repoName = (() => {
    if (!analysis?.repository_url) return "Repository";
    const parts = analysis.repository_url.replace(/\/+$/, "").split("/");
    if (parts.length >= 2) {
      return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
    }
    return parts[parts.length - 1] || "Repository";
  })();

  // Determine stage progression index
  const activeStageIndex = useMemo(() => {
    if (status === "completed" || currentStage === "complete") {
      return STAGE_ORDER.length - 1;
    }
    const idx = STAGE_ORDER.indexOf(currentStage as PipelineStage);
    return idx >= 0 ? idx : 0;
  }, [currentStage, status]);

  // Periodic clock tick for stale detection
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  // Stale detection: run without update for > 3 minutes
  const isStale =
    status !== "completed" &&
    status !== "failed" &&
    !!analysis?.updated_at &&
    now - new Date(analysis.updated_at).getTime() > 3 * 60 * 1000;

  // Transition to canvas view cleanly when complete (on the same /analysis/[id] route)
  useEffect(() => {
    if (status === "completed" || currentStage === "complete") {
      const timer = setTimeout(() => {
        router.refresh();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [status, currentStage, router]);

  // 1. One-shot initial state reconciliation on mount (no polling interval)
  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const token = await getToken();
        if (!active) return;
        const res = await fetch(`/api/analyses/${analysisId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok || !active) return;
        const data = await res.json();
        if (active && data.analysis) {
          setAnalysis(data.analysis);
          setStatus(data.analysis.status);
          setCurrentStage(data.analysis.stage || "fetching");
          setCommitHash(data.analysis.commit_hash || null);
          setErrorMessage(data.analysis.error_message || null);
        }
      } catch {
        // Handled by realtime
      }
    })();

    return () => {
      active = false;
    };
  }, [analysisId, getToken]);

  // 2. Realtime Subscription: Driven by database trigger on public.analyses
  useEffect(() => {
    let isSubscribed = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const supabase = createSupabaseClient(session || getToken);

    async function setupRealtime() {
      try {
        // Authenticate WebSocket connection for private channel
        const token = await (session ? session.getToken() : getToken());
        if (!isSubscribed) return;

        if (token && supabase.realtime) {
          await supabase.realtime.setAuth(token);
        }

        channel = supabase.channel(`analysis:${analysisId}`, {
          config: { private: true },
        });

        channel
          .on("broadcast", { event: "stage_change" }, (msg) => {
            const payload = msg.payload || msg;
            if (payload) {
              if (payload.stage) {
                setCurrentStage(payload.stage);
              }
              if (payload.status) {
                setStatus(payload.status);
              }
              if ("error_message" in payload) {
                setErrorMessage(payload.error_message || null);
              }
              if (payload.commit_hash) {
                setCommitHash(payload.commit_hash);
              }
              if (payload.updated_at) {
                setAnalysis((prev) =>
                  prev ? { ...prev, updated_at: payload.updated_at } : prev
                );
              }
            }
          })
          .subscribe((subscribeStatus) => {
            if (!isSubscribed) return;
            if (subscribeStatus === "SUBSCRIBED") {
              setIsRealtimeConnected(true);
              void fetchLatest();
            } else if (
              subscribeStatus === "CLOSED" ||
              subscribeStatus === "CHANNEL_ERROR"
            ) {
              setIsRealtimeConnected(false);
            }
          });
      } catch {
        if (isSubscribed) {
          setIsRealtimeConnected(false);
        }
      }
    }

    setupRealtime();

    return () => {
      isSubscribed = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [analysisId, session, getToken, fetchLatest]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-jetbrains antialiased relative selection:bg-primary selection:text-primary-foreground">
      {/* Subtle monochrome grid */}
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

      {/* Top Application Header */}
      <header className="border-b border-border bg-card/85 backdrop-blur-xl sticky top-0 z-40 px-4 sm:px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/workspace"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-xs font-mono group"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
            <span>Workspace</span>
          </Link>
          <span className="text-muted-foreground/40 text-xs font-mono">/</span>
          <span className="text-foreground text-xs sm:text-sm font-semibold">
            {repoName}
          </span>
        </div>

        {/* Realtime Socket Status Indicator & Theme Switcher */}
        <div className="flex items-center gap-2.5 font-mono text-[11px]">
          <ThemeToggle />
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] ${
              isRealtimeConnected
                ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-400"
                : "bg-amber-500/10 border-amber-500/25 text-amber-700 dark:text-amber-400"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isRealtimeConnected ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
            {isRealtimeConnected ? "REALTIME LIVE" : "CONNECTING"}
          </span>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-12 z-10 flex flex-col justify-center">
        {/* Repository Header Box */}
        <div className="mb-8 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-secondary/60 border border-border text-xs text-muted-foreground mb-3">
            <Radio className="w-3.5 h-3.5 text-primary" />
            <span>Pipeline Ingestion</span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight mb-2">
            {repoName}
          </h1>

          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 text-xs text-muted-foreground font-mono">
            {analysis?.branch && (
              <span className="inline-flex items-center gap-1 bg-secondary px-2 py-0.5 rounded border border-border text-foreground">
                <GitBranch className="w-3 h-3 text-muted-foreground" />
                {analysis.branch}
              </span>
            )}
            {commitHash && (
              <span className="inline-flex items-center gap-1 bg-secondary px-2 py-0.5 rounded border border-border text-foreground">
                <GitCommit className="w-3 h-3 text-primary" />
                {commitHash.slice(0, 7)}
              </span>
            )}
            {analysis?.repository_url && (
              <a
                href={analysis.repository_url}
                target="_blank"
                rel="noreferrer"
                className="hover:text-primary transition-colors inline-flex items-center gap-1 underline underline-offset-2"
              >
                GitHub <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>

        {/* Stale Warning Alert */}
        {isStale && status !== "failed" && (
          <div className="mb-6 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-800 dark:text-amber-300 font-mono text-xs flex items-start gap-2.5 shadow-sm">
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">
                Analysis appears stale
              </p>
              <p className="opacity-85 text-[11px] mt-0.5">
                This run has remained in the same stage for more than 3 minutes.
                The process may have stopped.
              </p>
            </div>
          </div>
        )}

        {/* Pipeline Stepper Container */}
        <div className="rounded-2xl border border-border bg-card/90 backdrop-blur-xl p-6 sm:p-8 shadow-sm dark:shadow-xl">
          <div className="space-y-6">
            {STAGES.map((stage, idx) => {
              const isCurrent =
                idx === activeStageIndex &&
                status !== "completed" &&
                status !== "failed";
              const isPassed =
                status === "completed" ||
                currentStage === "complete" ||
                (idx < activeStageIndex && status !== "failed");
              const isFailedStage =
                status === "failed" && idx === activeStageIndex;

              return (
                <div key={stage.key} className="relative flex items-start gap-4">
                  {/* Vertical connecting line */}
                  {idx < STAGES.length - 1 && (
                    <div
                      className={`absolute left-3.5 top-8 w-0.5 h-10 transition-colors ${
                        isPassed ? "bg-emerald-500/50" : "bg-border"
                      }`}
                    />
                  )}

                  {/* Stage Icon Node */}
                  <div className="relative z-10 shrink-0">
                    {isPassed ? (
                      <div className="w-7 h-7 rounded-full bg-emerald-500/15 border border-emerald-500/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 transition-all">
                        <Check className="w-4 h-4 stroke-[2.5]" />
                      </div>
                    ) : isFailedStage ? (
                      <div className="w-7 h-7 rounded-full bg-rose-500/20 border border-rose-500/50 flex items-center justify-center text-rose-600 dark:text-rose-400">
                        <AlertCircle className="w-4 h-4" />
                      </div>
                    ) : isCurrent ? (
                      <div className="w-7 h-7 rounded-full bg-primary/15 border border-primary/60 flex items-center justify-center text-primary">
                        <Loader2 className="w-4 h-4 animate-spin" />
                      </div>
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center text-muted-foreground text-xs font-mono">
                        {idx + 1}
                      </div>
                    )}
                  </div>

                  {/* Stage Labels */}
                  <div className="flex-1 pt-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-sm font-semibold tracking-tight transition-colors ${
                          isPassed
                            ? "text-emerald-700 dark:text-emerald-300"
                            : isFailedStage
                            ? "text-rose-700 dark:text-rose-400"
                            : isCurrent
                            ? "text-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        {stage.label}
                      </span>

                      {/* State Pills */}
                      {isPassed && (
                        <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                          <span>Passed</span>
                        </span>
                      )}
                      {isCurrent && (
                        <span className="text-[10px] font-mono text-primary bg-primary/10 border border-primary/25 px-2 py-0.5 rounded-full">
                          Running
                        </span>
                      )}
                      {isFailedStage && (
                        <span className="text-[10px] font-mono text-rose-700 dark:text-rose-400 bg-rose-500/10 border border-rose-500/25 px-2 py-0.5 rounded-full">
                          Failed
                        </span>
                      )}
                    </div>

                    <p
                      className={`text-xs mt-0.5 transition-colors ${
                        isCurrent || isPassed
                          ? "text-muted-foreground"
                          : "text-muted-foreground/60"
                      }`}
                    >
                      {stage.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Failure Diagnostic Box */}
          {status === "failed" && (
            <div className="mt-8 pt-6 border-t border-border">
              <div className="rounded-xl bg-rose-500/10 border border-rose-500/25 p-4 text-rose-800 dark:text-rose-300 font-mono text-xs">
                <div className="flex items-center gap-2 font-semibold mb-1">
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  <span>Pipeline failed in stage: {currentStage}</span>
                </div>
                <p className="opacity-90 text-xs mt-1.5 leading-relaxed pl-6">
                  {errorMessage || "An unexpected error interrupted this run."}
                </p>
              </div>

              {retryError && (
                <div className="mt-3 rounded-lg bg-rose-500/10 border border-rose-500/25 px-3 py-2 text-xs font-mono text-rose-700 dark:text-rose-300">
                  {retryError}
                </div>
              )}

              <div className="mt-5 flex items-center justify-between gap-3">
                <Link
                  href="/workspace"
                  className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 border border-border text-foreground text-xs transition-colors"
                >
                  Return to Dashboard
                </Link>
                <button
                  type="button"
                  onClick={handleRetry}
                  disabled={isRetrying}
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-xs font-semibold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  {isRetrying && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isRetrying ? "Retrying..." : "Retry Analysis"}</span>
                </button>
              </div>
            </div>
          )}

          {/* Success Redirect Notice */}
          {status === "completed" && (
            <div className="mt-8 pt-6 border-t border-border flex items-center justify-between">
              <span className="text-xs sm:text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Graph generated. Opening map...
              </span>
              <button
                type="button"
                onClick={() => router.refresh()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-xs font-semibold transition-all cursor-pointer"
              >
                Open Map <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Monospace Footer Info */}
        <div className="mt-6 flex items-center justify-between text-[11px] text-muted-foreground font-mono px-2">
          <span>Analysis ID: {analysisId}</span>
          <span className="flex items-center gap-1">
            <Terminal className="w-3 h-3" />
            CodoGraph Pipeline
          </span>
        </div>
      </main>
    </div>
  );
}
