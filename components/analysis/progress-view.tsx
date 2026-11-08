"use client";

import React, { useEffect, useState, useMemo } from "react";
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
  const { getToken } = useAuth();

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

  const handleRetry = async () => {
    if (!analysis?.repository_url || isRetrying) return;
    setIsRetrying(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repositoryUrl: analysis.repository_url,
          branch: analysis.branch || "main",
        }),
      });
      const data = await res.json();
      if (data.analysisId) {
        if (data.analysisId === analysisId) {
          window.location.reload();
        } else {
          router.push(`/analysis/${data.analysisId}`);
        }
      } else {
        router.refresh();
      }
    } catch {
      router.refresh();
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

  // Navigate to map when complete
  useEffect(() => {
    if (status === "completed" || currentStage === "complete") {
      const timer = setTimeout(() => {
        router.push(`/preview?id=${analysisId}`);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [status, currentStage, analysisId, router]);

  // 1. Initial State Fetch & Fallback Poller (safety net if realtime socket disconnects)
  useEffect(() => {
    let mounted = true;

    async function fetchLatest() {
      try {
        const token = await getToken();
        const res = await fetch(`/api/analyses/${analysisId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.analysis && mounted) {
          setAnalysis(data.analysis);
          setStatus(data.analysis.status);
          setCurrentStage(data.analysis.stage || "fetching");
          if (data.analysis.commit_hash) {
            setCommitHash(data.analysis.commit_hash);
          }
          if (data.analysis.error_message) {
            setErrorMessage(data.analysis.error_message);
          }
        }
      } catch {
        // Handled by realtime
      }
    }

    fetchLatest();

    // Secondary interval only if not completed or failed
    const interval = setInterval(() => {
      if (status !== "completed" && status !== "failed") {
        fetchLatest();
      }
    }, 6000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [analysisId, status, getToken]);

  // 2. Realtime Subscription: Driven by database trigger on public.analyses
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const supabase = createSupabaseClient(session || getToken);

    async function setupRealtime() {
      try {
        // Authenticate WebSocket connection for private channel
        const token = await (session
          ? session.getToken({ template: "supabase" })
          : getToken());

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
              if (payload.error_message) {
                setErrorMessage(payload.error_message);
              }
              if (payload.commit_hash) {
                setCommitHash(payload.commit_hash);
              }
            }
          })
          .subscribe((subscribeStatus) => {
            if (subscribeStatus === "SUBSCRIBED") {
              setIsRealtimeConnected(true);
            } else if (
              subscribeStatus === "CLOSED" ||
              subscribeStatus === "CHANNEL_ERROR"
            ) {
              setIsRealtimeConnected(false);
            }
          });
      } catch {
        setIsRealtimeConnected(false);
      }
    }

    setupRealtime();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [analysisId, session, getToken]);

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

      {/* Top Application Header */}
      <header className="border-b border-white/10 bg-[#08090d]/85 backdrop-blur-xl sticky top-0 z-40 px-4 sm:px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/workspace"
            className="flex items-center gap-2 text-white/60 hover:text-white transition-colors text-xs font-mono group"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
            <span className="font-times text-xs">Workspace</span>
          </Link>
          <span className="text-white/20 text-xs font-mono">/</span>
          <span className="text-white font-times text-sm font-semibold">
            {repoName}
          </span>
        </div>

        {/* Realtime Socket Status Indicator */}
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] ${
              isRealtimeConnected
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                : "bg-amber-500/10 border-amber-500/20 text-amber-400"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isRealtimeConnected
                  ? "bg-emerald-400 animate-pulse"
                  : "bg-amber-400"
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
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/10 text-xs font-times text-white/70 mb-3">
            <Radio className="w-3.5 h-3.5 text-[#F64302]" />
            <span>Pipeline Ingestion</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-normal font-times mb-2">
            {repoName}
          </h1>

          <div className="flex flex-wrap items-center gap-3 text-xs text-white/50 font-mono">
            {analysis?.branch && (
              <span className="inline-flex items-center gap-1 bg-white/[0.04] px-2 py-0.5 rounded border border-white/10 text-white/70">
                <GitBranch className="w-3 h-3 text-white/40" />
                {analysis.branch}
              </span>
            )}
            {commitHash && (
              <span className="inline-flex items-center gap-1 bg-white/[0.04] px-2 py-0.5 rounded border border-white/10 text-white/70">
                <GitCommit className="w-3 h-3 text-[#F64302]" />
                {commitHash.slice(0, 7)}
              </span>
            )}
            {analysis?.repository_url && (
              <a
                href={analysis.repository_url}
                target="_blank"
                rel="noreferrer"
                className="hover:text-white transition-colors inline-flex items-center gap-1 underline underline-offset-2"
              >
                GitHub <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>

        {/* Stale Warning Alert */}
        {isStale && status !== "failed" && (
          <div className="mb-6 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 font-mono text-xs flex items-start gap-2.5 shadow-lg">
            <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-200">
                Analysis appears stale
              </p>
              <p className="text-amber-300/80 text-[11px] mt-0.5">
                This run has remained in the same stage for more than 3 minutes.
                The process may have stopped.
              </p>
            </div>
          </div>
        )}

        {/* Pipeline Stepper Container */}
        <div className="rounded-2xl border border-white/10 bg-[#0c0d14]/80 backdrop-blur-xl p-6 sm:p-8 shadow-2xl">
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
                        isPassed ? "bg-emerald-500/50" : "bg-white/10"
                      }`}
                    />
                  )}

                  {/* Stage Icon Node */}
                  <div className="relative z-10 shrink-0">
                    {isPassed ? (
                      <div className="w-7 h-7 rounded-full bg-emerald-500/15 border border-emerald-500/50 flex items-center justify-center text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)] transition-all">
                        <Check className="w-4 h-4 stroke-[2.5]" />
                      </div>
                    ) : isFailedStage ? (
                      <div className="w-7 h-7 rounded-full bg-rose-500/20 border border-rose-500/50 flex items-center justify-center text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.3)]">
                        <AlertCircle className="w-4 h-4" />
                      </div>
                    ) : isCurrent ? (
                      <div className="w-7 h-7 rounded-full bg-[#F64302]/20 border border-[#F64302]/60 flex items-center justify-center text-[#F64302] shadow-[0_0_14px_rgba(246,67,2,0.4)] animate-pulse">
                        <Loader2 className="w-4 h-4 animate-spin" />
                      </div>
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center text-white/30 text-xs font-mono">
                        {idx + 1}
                      </div>
                    )}
                  </div>

                  {/* Stage Labels */}
                  <div className="flex-1 pt-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-sm sm:text-base font-times font-semibold tracking-normal transition-colors ${
                          isPassed
                            ? "text-emerald-300"
                            : isFailedStage
                            ? "text-rose-400"
                            : isCurrent
                            ? "text-white"
                            : "text-white/40"
                        }`}
                      >
                        {stage.label}
                      </span>

                      {/* State Pills */}
                      {isPassed && (
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                          <span>Passed</span>
                        </span>
                      )}
                      {isCurrent && (
                        <span className="text-[10px] font-mono text-[#F64302] bg-[#F64302]/10 border border-[#F64302]/20 px-2 py-0.5 rounded-full animate-pulse">
                          Running
                        </span>
                      )}
                      {isFailedStage && (
                        <span className="text-[10px] font-mono text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full">
                          Failed
                        </span>
                      )}
                    </div>

                    <p
                      className={`text-xs font-times mt-0.5 transition-colors ${
                        isCurrent || isPassed
                          ? "text-white/60"
                          : "text-white/30"
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
            <div className="mt-8 pt-6 border-t border-white/10">
              <div className="rounded-xl bg-rose-950/30 border border-rose-500/30 p-4 text-rose-300 font-mono text-xs shadow-inner">
                <div className="flex items-center gap-2 font-semibold text-rose-200 mb-1">
                  <AlertCircle className="w-4 h-4 text-rose-400" />
                  <span>Pipeline failed in stage: `{currentStage}`</span>
                </div>
                <p className="text-rose-300/90 text-xs mt-1.5 leading-relaxed pl-6">
                  {errorMessage || "An unexpected error interrupted this run."}
                </p>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3 font-times">
                <Link
                  href="/workspace"
                  className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-white font-times text-xs transition-colors"
                >
                  Return to Dashboard
                </Link>
                <button
                  onClick={handleRetry}
                  disabled={isRetrying}
                  className="px-4 py-2 rounded-xl bg-[#F64302] hover:bg-[#F64302]/90 disabled:opacity-50 text-white font-times text-xs font-semibold transition-all shadow-md flex items-center gap-1.5"
                >
                  {isRetrying && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isRetrying ? "Retrying..." : "Retry Analysis"}</span>
                </button>
              </div>
            </div>
          )}

          {/* Success Redirect Notice */}
          {status === "completed" && (
            <div className="mt-8 pt-6 border-t border-white/10 flex items-center justify-between font-times">
              <span className="text-sm font-times text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Graph generated. Redirecting to map...
              </span>
              <Link
                href={`/preview?id=${analysisId}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-times text-xs font-semibold transition-all"
              >
                Open Map <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </div>

        {/* Monospace Footer Info */}
        <div className="mt-6 flex items-center justify-between text-[11px] text-white/30 font-mono px-2">
          <span>Analysis ID: `{analysisId}`</span>
          <span className="flex items-center gap-1">
            <Terminal className="w-3 h-3" />
            Phase 7 Engine
          </span>
        </div>
      </main>
    </div>
  );
}
