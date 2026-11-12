/**
 * CodoGraph — Phase 7: Repository Analysis Pipeline Runner.
 *
 * Orchestrates the full lifecycle:
 * 1. Checks for existing completed analysis ("One analysis per repository").
 * 2. Creates a pending analysis record.
 * 3. Advances through named stages: fetching -> selecting -> parsing -> storing -> complete.
 * 4. Derives codebase insights and persists entities into Supabase with RLS.
 * 5. Top-level try/catch ensures any failure writes a failed state and the failed stage,
 *    never leaving a hanging row.
 * 6. Finally block guarantees full cleanup of the temporary repository folder.
 */
import { parseGitHubUrl, fetchRepositoryArchive, type FetchedRepository } from './github.ts';
import {
  findExistingAnalysisAdmin,
  createPendingAnalysisAdmin,
  updateAnalysisStage,
  markAnalysisFailed,
  storeAnalysisResults,
  getAnalysisByIdAdmin,
  type PipelineStage,
  type AnalysisRecord,
} from './storage.ts';
import { parseRepository } from '../parser/index.ts';
import { computeCodebaseInsights } from '../canvas/metrics.ts';

export interface PipelineOptions {
  /** Optional user identifier associated with the request. */
  userId?: string | null;
  /** Force re-run even if an existing completed analysis is present. */
  forceRerun?: boolean;
  /** Optional existing analysis record ID to run against. */
  analysisId?: string;
  /** Optional callback invoked on each stage transition. */
  onStageChange?: (stage: PipelineStage, analysisId: string) => void;
}

export interface PipelineExecutionResult {
  analysis: AnalysisRecord;
  reusedExisting: boolean;
}

/**
 * Runs the ingestion, parsing, and storage pipeline for a public GitHub repository.
 *
 * @param repositoryUrl Public GitHub repository URL.
 * @param orgId Organization ID owning the analysis.
 * @param options Pipeline execution options.
 */
export async function runAnalysisPipeline(
  repositoryUrl: string,
  orgId: string,
  options: PipelineOptions = {}
): Promise<PipelineExecutionResult> {
  // 1. Normalize and validate repository URL
  const coords = parseGitHubUrl(repositoryUrl);

  // 2. Check for existing analysis ("One analysis per repository")
  if (!options.forceRerun && !options.analysisId) {
    const existing = await findExistingAnalysisAdmin(orgId, coords.canonicalUrl);
    if (existing) {
      return {
        analysis: existing,
        reusedExisting: true,
      };
    }
  }

  // 3. Create or reuse pending analysis record
  let analysis: AnalysisRecord;
  if (options.analysisId) {
    const existing = await getAnalysisByIdAdmin(options.analysisId, orgId);
    if (!existing) {
      throw new Error(`Analysis ${options.analysisId} not found for organization`);
    }
    analysis = existing;
  } else {
    analysis = await createPendingAnalysisAdmin(
      orgId,
      coords.canonicalUrl,
      coords.repo,
      coords.ref || 'main'
    );
  }

  let currentStage: PipelineStage = 'fetching';
  let fetched: FetchedRepository | null = null;

  const notify = (stage: PipelineStage) => {
    currentStage = stage;
    if (options.onStageChange) {
      options.onStageChange(stage, analysis.id);
    }
  };

  try {
    // Stage 1: FETCHING
    notify('fetching');
    await updateAnalysisStage(analysis.id, orgId, 'fetching');

    fetched = await fetchRepositoryArchive(repositoryUrl);

    // Stage 2: SELECTING
    notify('selecting');
    await updateAnalysisStage(analysis.id, orgId, 'selecting');

    // Stage 3: PARSING
    notify('parsing');
    await updateAnalysisStage(analysis.id, orgId, 'parsing');

    const parserResult = parseRepository(fetched.extractedDir);

    // Derive pure graph insights (unimported, popular, cycles, oversized)
    const insights = computeCodebaseInsights(parserResult.files, parserResult.edges);

    // Stage 4: STORING
    notify('storing');
    await updateAnalysisStage(analysis.id, orgId, 'storing');

    const completedRecord = await storeAnalysisResults(
      analysis.id,
      orgId,
      fetched.commitHash,
      parserResult,
      insights,
      fetched.branch
    );

    notify('complete');
    return {
      analysis: completedRecord,
      reusedExisting: false,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const failedStage = currentStage;
    if (options.onStageChange) {
      options.onStageChange('failed', analysis.id);
    }
    try {
      await markAnalysisFailed(analysis.id, orgId, failedStage, errorMessage);
    } catch (markErr) {
      console.error(`[CodoGraph Pipeline] Failed to persist error state for ${analysis.id}:`, markErr);
    }
    throw err;
  } finally {
    // Always clean up extracted folder on disk
    if (fetched) {
      await fetched.cleanup();
    }
  }
}
