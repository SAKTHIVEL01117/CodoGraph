/**
 * CodoGraph — Phase 10: Single AI Client & Tracing Gateway.
 *
 * Rules & Constraints:
 * 1. ONE place in the entire codebase that constructs the AI client.
 *    Anywhere else silently skips tracing.
 * 2. Wrapped with LangSmith so every model call through it is traced.
 * 3. Model version is pinned exactly (never a moving alias); model name is part of cache key.
 * 4. If tracing is unconfigured, calls still succeed. Tracing state is surfaced visibly.
 * 5. Uses OpenAI SDK configured with NVIDIA NIM API credentials (or OpenAI fallback).
 */
import { OpenAI } from 'openai';
import { wrapOpenAI } from 'langsmith/wrappers';
import { Client as LangSmithClient } from 'langsmith';

// Pinned exact model name — never a moving alias
export const PINNED_MODEL =
  process.env.NVIDIA_MODEL?.trim() ||
  'nvidia/nemotron-3.5-bolt-e4b';

export interface TracingStatus {
  enabled: boolean;
  project: string;
  endpoint: string;
  reason?: string;
}

/**
 * Normalizes LangSmith endpoint.
 * Note: LangSmith tracing keys (starting with 'lsv2_tr_') generally target
 * the global/US endpoint 'https://api.smith.langchain.com'. If eu endpoint returns 403,
 * fallback to the default endpoint.
 */
function getNormalizedLangSmithEndpoint(): string {
  const raw = process.env.LANGSMITH_ENDPOINT?.trim();
  if (!raw) return 'https://api.smith.langchain.com';
  return raw.replace(/\/+$/, '');
}

/**
 * Returns current tracing configuration state.
 * Safe to call from anywhere (server or client via API).
 */
export function getTracingStatus(): TracingStatus {
  const apiKey = process.env.LANGSMITH_API_KEY?.trim() || '';
  const tracingFlag = process.env.LANGSMITH_TRACING?.trim()?.toLowerCase();
  const isExplicitlyDisabled = tracingFlag === 'false' || tracingFlag === '0';
  const project = process.env.LANGSMITH_PROJECT?.trim() || 'CodoGraph';
  const endpoint = getNormalizedLangSmithEndpoint();

  if (!apiKey) {
    return {
      enabled: false,
      project,
      endpoint,
      reason: 'LANGSMITH_API_KEY is not set. AI calls succeed without tracing.',
    };
  }

  if (isExplicitlyDisabled) {
    return {
      enabled: false,
      project,
      endpoint,
      reason: 'LANGSMITH_TRACING is set to false.',
    };
  }

  return {
    enabled: true,
    project,
    endpoint,
  };
}

let cachedOpenAIClient: OpenAI | null = null;
let cachedLangSmithClient: LangSmithClient | null = null;

/**
 * Returns the singleton OpenAI-compatible AI client.
 * Connects to NVIDIA NIM (or OpenAI) and is wrapped with LangSmith tracing
 * when configured.
 */
export function getAiClient(): OpenAI {
  if (cachedOpenAIClient) {
    return cachedOpenAIClient;
  }

  const apiKey =
    process.env.NVIDIA_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    '';

  const baseURL =
    process.env.NVIDIA_BASE_URL?.trim() ||
    (process.env.NVIDIA_API_KEY
      ? 'https://integrate.api.nvidia.com/v1'
      : undefined);

  if (!apiKey) {
    throw new Error(
      '[CodoGraph AI] Neither NVIDIA_API_KEY nor OPENAI_API_KEY is configured in the environment.'
    );
  }

  const tracing = getTracingStatus();

  // Configure LangSmith environment for SDK auto-instrumentation
  if (tracing.enabled) {
    process.env.LANGSMITH_TRACING = 'true';
    process.env.LANGSMITH_PROJECT = tracing.project;
    process.env.LANGSMITH_ENDPOINT = tracing.endpoint;
  }

  const rawClient = new OpenAI({
    apiKey,
    baseURL,
    maxRetries: 2,
    timeout: 30000,
  });

  // Wrapped so every call through it is traced in LangSmith
  if (tracing.enabled) {
    cachedOpenAIClient = wrapOpenAI(rawClient, {
      project_name: tracing.project,
    });
  } else {
    cachedOpenAIClient = rawClient;
  }

  return cachedOpenAIClient;
}

/**
 * Returns singleton LangSmith client for trace metadata and manual parent runs.
 */
export function getLangSmithClient(): LangSmithClient | null {
  const status = getTracingStatus();
  if (!status.enabled) return null;

  if (!cachedLangSmithClient) {
    cachedLangSmithClient = new LangSmithClient({
      apiUrl: status.endpoint,
      apiKey: process.env.LANGSMITH_API_KEY?.trim(),
    });
  }

  return cachedLangSmithClient;
}

