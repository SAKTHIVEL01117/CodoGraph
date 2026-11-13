# My First Agent (LangChain Deep Agents Quickstart)

A simple agent built using the LangChain open-source **Deep Agents** framework (`deepagents`), configured with **NVIDIA NIM** (OpenAI-compatible inference API) and **LangSmith** tracing configured for the EU region.

---

## 🛠️ Setup & Configuration

### 1. Configure Environment Variables
Open the [.env](file:///C:/Users/SAKTHIVEL%20%20P/Desktop/projects/codograph/my%20first%20agent/.env) file:

```env
# LangSmith Tracing Configuration
LANGSMITH_TRACING=true
LANGSMITH_ENDPOINT="https://eu.api.smith.langchain.com"
LANGSMITH_PROJECT="my-first-agent"
LANGSMITH_API_KEY="<your-langsmith-api-key>"

# NVIDIA NIM API Configuration
NVIDIA_API_KEY="<your-nvidia-nim-api-key>"
NVIDIA_BASE_URL="https://integrate.api.nvidia.com/v1"
NVIDIA_MODEL="meta/llama-3.3-70b-instruct"
```

> **Note:**
> - Set your `NVIDIA_API_KEY` (e.g., `nvapi-...` from [NVIDIA build catalog](https://build.nvidia.com/)).
> - Set your `LANGSMITH_API_KEY` if you want all trace logs to appear in your EU LangSmith workspace under project `my-first-agent`.
> - You can change `NVIDIA_MODEL` to any model available on NVIDIA NIM (e.g., `meta/llama-3.3-70b-instruct`, `mistralai/mixtral-8x22b-instruct-v0.1`, `deepseek-ai/deepseek-r1`, etc.).

---

## 🚀 Running the Agent

Run the default query:
```bash
npm start
```

Or pass a custom prompt directly as arguments:
```bash
node index.js "Explain how agentic workflows differ from traditional chains"
```

---

## 📦 Installed Skills

All 22 open-source LangChain skills from [langchain-ai/langchain-skills](https://github.com/langchain-ai/langchain-skills) have been installed into the workspace:
- `deepagents-typescript-quickstart`
- `deep-agents-core`
- `deep-agents-memory`
- `deep-agents-orchestration`
- `langgraph-fundamentals`
- `langgraph-decision-models`
- `langgraph-persistence`
- `langgraph-human-in-the-loop`
- And more!
