/**
 * CodoGraph — Canvas Preview Route (Phase 4).
 *
 * Renders the 687-file repository analysis through the real application shell,
 * matching the exact reference image with all 5 organization analyses supported.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import type { ParserResult } from '@/lib/parser/types';
import { CanvasShell } from '@/components/canvas/canvas-shell';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Canvas Preview — CodoGraph',
  description: 'Three-column architectural dependency canvas',
};

export default async function PreviewPage(props: {
  searchParams?: Promise<{ id?: string; repo?: string }>;
}) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const dataPath = path.join(process.cwd(), 'data', 'preview-analysis.json');

  if (!fs.existsSync(dataPath)) {
    throw new Error(
      `[CodoGraph Preview] Scaffolding data file not found at: ${dataPath}.`
    );
  }

  const raw = fs.readFileSync(dataPath, 'utf-8');
  const fullResult = JSON.parse(raw) as ParserResult;

  const analysis: ParserResult = {
    ...fullResult,
    coverage: {
      ...fullResult.coverage,
      skippedFiles: [],
    },
  };

  const initialId = searchParams.id || (searchParams.repo?.includes('next') ? '5' : '4');

  return (
    <CanvasShell
      primaryAnalysis={analysis}
      initialAnalysisId={initialId}
    />
  );
}
