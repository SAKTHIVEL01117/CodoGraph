/**
 * CodoGraph — Phase 11: Retired Explanation Prompt (v1).
 *
 * Constraint:
 * "The retired prompt lives with the evals, not in the application.
 *  Shipping a dead prompt so a test can reach it is the test shaping the product."
 *
 * Characteristics of Retired Prompt v1 (Naive early implementation):
 * - Unstructured prose without explicit section divisions.
 * - Allowed markdown headings (#, ##, ###) which fragmented the narrow UI pane.
 * - Lacked strict constraints on inbound/outbound contract definitions.
 * - Had higher propensity to hallucinate external paths due to loose boundary rules.
 */

export interface PromptV1Input {
  filePath: string;
  folder?: string | null;
  fileRole?: string | null;
  dependencies: string[];
  dependents: string[];
  fileSnippet?: string;
}

export function buildRetiredV1Prompts(input: PromptV1Input): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `You are a helpful software assistant. Your task is to write a summary of a code file for a developer.
Explain what the file does and how it relates to other files in the project.
You may use standard Markdown formatting including headers, bullet points, and code spans.`;

  const userPrompt = `Please summarize this file:
File: ${input.filePath}
Role: ${input.fileRole || 'unspecified'}
Imports: ${input.dependencies.join(', ') || 'None'}
Imported by: ${input.dependents.join(', ') || 'None'}

${input.fileSnippet ? `Code:\n\`\`\`\n${input.fileSnippet.slice(0, 1000)}\n\`\`\`` : ''}

Write a summary explaining what this file is for and how it interacts with the rest of the app.`;

  return { systemPrompt, userPrompt };
}

