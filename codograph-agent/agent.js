/**
 * CodoGraph Agent — Agent Project Entry.
 *
 * Implements Phase 12 Agent Project:
 * - Built on Managed Deep Agents harness (deepagents / LangChain).
 * - Loaded with the 6 core graph tools.
 * - System instructions enforce the refusal behavior and never-infer rule.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { ChatOpenAI } from '@langchain/openai';
import { createDeepAgent } from 'deepagents';
import { allAgentTools } from './tools/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure .env in agent directory is loaded
dotenv.config({ path: path.join(__dirname, '.env') });

// Read system instructions
const instructionsPath = path.join(__dirname, 'instructions.md');
export const agentInstructions = fs.existsSync(instructionsPath)
  ? fs.readFileSync(instructionsPath, 'utf8')
  : 'You are the CodoGraph codebase architecture assistant. Look up real relationships in the graph using tools.';

/**
 * Constructs the configured Chat model pointing to NVIDIA NIM API.
 */
export function getAgentModel() {
  const apiKey = process.env.NVIDIA_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('[CodoGraph Agent] NVIDIA_API_KEY or OPENAI_API_KEY is required.');
  }

  const modelName = process.env.NVIDIA_MODEL || 'nvidia/nemotron-3.5-bolt-e4b';
  const baseURL = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';

  return new ChatOpenAI({
    model: modelName,
    temperature: 0.1,
    apiKey,
    configuration: {
      baseURL,
    },
  });
}

/**
 * Creates and initializes the CodoGraph Deep Agent.
 */
export async function createCodoGraphAgent(options = {}) {
  const model = options.model || getAgentModel();
  const tools = options.tools || allAgentTools;
  const systemPrompt = options.systemPrompt || agentInstructions;

  return await createDeepAgent({
    model,
    tools,
    systemPrompt,
  });
}
