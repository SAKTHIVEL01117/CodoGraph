import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { createDeepAgent } from "deepagents";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

// Check for required API keys
const nvidiaApiKey = process.env.NVIDIA_API_KEY || process.env.OPENAI_API_KEY;
if (!nvidiaApiKey) {
  console.error("❌ Error: NVIDIA_API_KEY is not set.");
  console.error("Please add your NVIDIA NIM API key to the .env file:");
  console.error('NVIDIA_API_KEY="nvapi-..."\n');
  process.exit(1);
}

// Configure LLM using NVIDIA NIM OpenAI-compatible endpoint
const modelName = process.env.NVIDIA_MODEL || "meta/llama-3.3-70b-instruct";
const baseURL = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";

console.log(`🤖 Initializing agent with model: ${modelName} (NIM endpoint: ${baseURL})`);
if (process.env.LANGSMITH_API_KEY) {
  console.log(`📊 LangSmith tracing enabled: ${process.env.LANGSMITH_ENDPOINT} (Project: ${process.env.LANGSMITH_PROJECT})`);
} else {
  console.log(`ℹ️ LangSmith API key not detected in .env. To view traces in LangSmith (${process.env.LANGSMITH_PROJECT}), set LANGSMITH_API_KEY in .env.`);
}

const model = new ChatOpenAI({
  model: modelName,
  temperature: 0.2,
  apiKey: nvidiaApiKey,
  configuration: {
    baseURL: baseURL,
  },
});

// Define a sample research tool for the agent
const searchKnowledgeBase = tool(
  async ({ query }) => {
    return `[Knowledge Base result for "${query}"]: LangGraph and Deep Agents are frameworks developed by LangChain for creating controllable, stateful, and resilient agent workflows with planning, memory, and sub-agents.`;
  },
  {
    name: "search_knowledge_base",
    description: "Search the knowledge base for information on topics",
    schema: z.object({
      query: z.string().describe("Search query to look up"),
    }),
  }
);

async function main() {
  const agent = await createDeepAgent({
    model: model,
    tools: [searchKnowledgeBase],
    systemPrompt:
      "You are a helpful research agent. Break down complex tasks into steps, utilize available tools when needed, and provide clear and accurate responses.",
  });

  const query = process.argv.slice(2).join(" ") || "What is LangGraph and how does it relate to Deep Agents?";
  console.log(`\n💬 User query: "${query}"\n`);

  const result = await agent.invoke({
    messages: [{ role: "user", content: query }],
  });

  const lastMessage = result.messages[result.messages.length - 1];
  console.log("📝 Agent Response:\n");
  console.log(lastMessage.content);
}

main().catch((err) => {
  console.error("Execution error:", err);
  process.exit(1);
});
