"use client";

/**
 * CodoGraph — Phase 12: Ask Panel (Repository AI Assistant).
 *
 * Requirements (docs/specs/phase-12.md):
 * 1. "Scoped to this analysis, aware of what's selected, and showing each tool call as it happens."
 * 2. "Ask is a mode of the whole right-hand pane, not a third tab beside Structure and Explanation."
 * 3. "Streaming is required. Three tool calls take fifteen to thirty seconds, and a silent spinner for that long reads as broken."
 * 4. "Every answer has at least one tool call visible above it."
 * 5. Dense developer tool: small type, tight spacing, monospace for file paths.
 * 6. Interactive file links in answers that highlight nodes on the canvas.
 * 7. When the agent is unreachable, displays inline recovery instructions without crashing the application.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  Loader2,
  Wrench,
  CheckCircle2,
  AlertCircle,
  FileCode,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Terminal,
} from 'lucide-react';

let messageSeq = 0;
function generateMessageId(prefix: string): string {
  messageSeq += 1;
  return `${prefix}-${messageSeq}`;
}

export interface ToolCallItem {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'running' | 'completed';
  summary?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCallItem[];
  isStreaming?: boolean;
  error?: string;
}

interface AskPanelProps {
  analysisId: string;
  repositoryName: string;
  selectedFilePath: string | null;
  onSelectFile?: (filePath: string) => void;
}

const QUICK_PROMPTS = [
  'Where is authentication handled?',
  'What breaks if I change that?',
  'Show me the declared route table',
  'Is this code any good?',
];

export function AskPanel({
  analysisId,
  repositoryName,
  selectedFilePath,
  onSelectFile,
}: AskPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [unreachableError, setUnreachableError] = useState<string | null>(null);
  const [includeSelectedContext, setIncludeSelectedContext] = useState(true);
  const [expandedToolIds, setExpandedToolIds] = useState<Set<string>>(new Set());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const toggleToolExpanded = (id: string) => {
    setExpandedToolIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async (overridePrompt?: string) => {
    const promptToSend = (overridePrompt || input).trim();
    if (!promptToSend || isSubmitting) return;

    setInput('');
    setUnreachableError(null);

    const userMessageId = generateMessageId('user');
    const assistantMessageId = generateMessageId('asst');

    const newMessages: ChatMessage[] = [
      ...messages,
      { id: userMessageId, role: 'user', content: promptToSend },
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        toolCalls: [],
        isStreaming: true,
      },
    ];

    setMessages(newMessages);
    setIsSubmitting(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const payloadMessages = newMessages
        .filter((m) => m.id !== assistantMessageId)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch(`/api/analyses/${analysisId}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: payloadMessages,
          selectedFile: includeSelectedContext ? selectedFilePath : null,
        }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server returned HTTP ${res.status}`);
      }

      if (!res.body) {
        throw new Error('No streaming response body received.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = 'message';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('event:')) {
            currentEvent = trimmed.slice(6).trim();
            continue;
          }

          if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.slice(5).trim();
            if (!dataStr) continue;

            try {
              const data = JSON.parse(dataStr);

              if (currentEvent === 'tool_start') {
                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.id !== assistantMessageId) return msg;
                    const existingCalls = msg.toolCalls || [];
                    const newCall: ToolCallItem = {
                      id: data.id || generateMessageId('tool'),
                      name: data.tool,
                      args: data.args || {},
                      status: 'running',
                    };
                    return { ...msg, toolCalls: [...existingCalls, newCall] };
                  })
                );
              } else if (currentEvent === 'tool_end') {
                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.id !== assistantMessageId) return msg;
                    const updatedCalls = (msg.toolCalls || []).map((tc) => {
                      if (tc.name === data.tool || tc.id === data.id) {
                        return { ...tc, status: 'completed' as const, summary: data.summary };
                      }
                      return tc;
                    });
                    return { ...msg, toolCalls: updatedCalls };
                  })
                );
              } else if (currentEvent === 'token') {
                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.id !== assistantMessageId) return msg;
                    return { ...msg, content: data.text || msg.content };
                  })
                );
              } else if (currentEvent === 'done') {
                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.id !== assistantMessageId) return msg;
                    return {
                      ...msg,
                      content: data.content || msg.content,
                      isStreaming: false,
                    };
                  })
                );
              } else if (currentEvent === 'error') {
                if (data.unreachable) {
                  setUnreachableError(data.error);
                }
                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.id !== assistantMessageId) return msg;
                    return {
                      ...msg,
                      error: data.error,
                      isStreaming: false,
                    };
                  })
                );
              }
            } catch {
              // Ignore partial JSON chunks
            }
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        const errorMsg = err instanceof Error ? err.message : 'Failed to query agent.';
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== assistantMessageId) return msg;
            return {
              ...msg,
              error: errorMsg,
              isStreaming: false,
            };
          })
        );
      }
    } finally {
      setIsSubmitting(false);
      abortControllerRef.current = null;
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id === assistantMessageId && msg.isStreaming) {
            return { ...msg, isStreaming: false };
          }
          return msg;
        })
      );
    }
  };

  /**
   * Parses inline backticked paths and renders clickable pills if onSelectFile is present.
   */
  const renderMessageContent = (content: string) => {
    if (!content) return null;

    const parts = content.split(/(`[^`]+`)/g);

    return parts.map((part, index) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        const pathCandidate = part.slice(1, -1);
        const isPath = pathCandidate.includes('/') || pathCandidate.includes('.');

        if (isPath && onSelectFile) {
          return (
            <button
              key={index}
              type="button"
              onClick={() => onSelectFile(pathCandidate)}
              className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded text-[11px] font-mono bg-primary/10 text-primary hover:bg-primary/20 hover:underline transition-colors cursor-pointer border border-primary/20"
              title={`Highlight ${pathCandidate} on canvas`}
            >
              <FileCode className="w-3 h-3 mr-1 inline shrink-0" />
              {pathCandidate}
            </button>
          );
        }

        return (
          <code key={index} className="px-1 py-0.5 rounded text-[11px] bg-secondary text-foreground font-mono">
            {pathCandidate}
          </code>
        );
      }

      return (
        <span key={index} className="whitespace-pre-wrap leading-relaxed">
          {part}
        </span>
      );
    });
  };

  return (
    <div className="flex flex-col h-full bg-card select-text font-mono text-foreground">
      {/* Header Indicator */}
      <div className="shrink-0 px-4 py-2 border-b border-border bg-secondary/30 flex items-center justify-between text-[11px] font-sans">
        <div className="flex items-center gap-1.5 text-muted-foreground truncate">
          <Terminal className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="truncate">Scoped to <strong className="font-mono text-foreground">{repositoryName}</strong></span>
        </div>
        {selectedFilePath && (
          <div
            className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
              includeSelectedContext
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-muted border-border text-muted-foreground'
            }`}
          >
            <span className="truncate max-w-[120px] font-mono">{selectedFilePath.split('/').pop()}</span>
            <button
              type="button"
              onClick={() => setIncludeSelectedContext(!includeSelectedContext)}
              className="text-[10px] ml-0.5 hover:underline cursor-pointer"
              title={includeSelectedContext ? 'Click to exclude selected file context' : 'Click to include selected file context'}
            >
              {includeSelectedContext ? '✕' : '+'}
            </button>
          </div>
        )}
      </div>

      {/* Unreachable Agent Warning Banner */}
      {unreachableError && (
        <div className="shrink-0 m-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-sans">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
            <div className="flex-1">
              <p className="font-semibold mb-1">Agent Service Unreachable</p>
              <p className="text-[11px] leading-relaxed mb-2">{unreachableError}</p>
              <p className="text-[10px] font-mono bg-card px-2 py-1 rounded border border-border inline-block">
                pnpm --prefix codograph-agent start
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Chat Messages List */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col justify-center items-center text-center p-4">
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
              <Sparkles className="w-4 h-4" />
            </div>
            <h4 className="text-xs font-semibold font-sans mb-1 text-foreground">Ask CodoGraph</h4>
            <p className="text-[11px] font-sans text-muted-foreground leading-relaxed max-w-xs mb-4">
              Ask about architecture, blast radius, dependencies, or endpoints. Answers are verified with real graph tool lookups.
            </p>

            <div className="w-full space-y-1.5 text-left">
              <p className="text-[10px] font-sans text-muted-foreground uppercase tracking-wider mb-1">Try asking:</p>
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleSubmit(prompt)}
                  className="w-full text-left px-2.5 py-1.5 rounded-md bg-secondary/50 hover:bg-secondary border border-border/60 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer truncate"
                >
                  &ldquo;{prompt}&rdquo;
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex flex-col ${
                message.role === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              {/* User Prompt */}
              {message.role === 'user' ? (
                <div className="max-w-[90%] px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs leading-relaxed font-sans shadow-sm">
                  {message.content}
                </div>
              ) : (
                <div className="w-full space-y-2">
                  {/* Tool Invocations Streamed Above Answer (Acceptance Check 4) */}
                  {message.toolCalls && message.toolCalls.length > 0 && (
                    <div className="w-full space-y-1.5 py-1">
                      {message.toolCalls.map((tool) => {
                        const isExpanded = expandedToolIds.has(tool.id);
                        return (
                          <div
                            key={tool.id}
                            className="rounded-md border border-border bg-secondary/30 overflow-hidden text-[11px]"
                          >
                            <button
                              type="button"
                              onClick={() => toggleToolExpanded(tool.id)}
                              className="w-full px-2.5 py-1.5 flex items-center justify-between gap-2 hover:bg-secondary/50 transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                <Wrench className="w-3 h-3 text-primary shrink-0" />
                                <span className="font-mono font-medium text-foreground">{tool.name}</span>
                                {tool.args && Object.keys(tool.args).length > 0 && (
                                  <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[140px]">
                                    ({Object.entries(tool.args).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')})
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {tool.status === 'running' ? (
                                  <Loader2 className="w-3 h-3 text-primary animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                )}
                                {isExpanded ? (
                                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                                )}
                              </div>
                            </button>

                            {isExpanded && (
                              <div className="px-2.5 py-2 border-t border-border bg-background/50 text-[10px] font-mono space-y-1">
                                <div>
                                  <span className="text-muted-foreground">Arguments: </span>
                                  <pre className="mt-0.5 p-1 rounded bg-secondary/50 overflow-x-auto text-foreground">
                                    {JSON.stringify(tool.args, null, 2)}
                                  </pre>
                                </div>
                                {tool.summary && (
                                  <div className="text-muted-foreground">
                                    <span>Result summary: </span>
                                    <span className="text-foreground">{tool.summary}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Assistant Text Answer */}
                  {message.content ? (
                    <div className="text-xs text-foreground bg-card border border-border/70 p-3 rounded-xl shadow-xs leading-relaxed font-sans">
                      {renderMessageContent(message.content)}
                    </div>
                  ) : message.isStreaming ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-sans p-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                      <span>Verifying graph connections...</span>
                    </div>
                  ) : null}

                  {/* Error Notification */}
                  {message.error && (
                    <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span className="font-sans leading-snug">{message.error}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <div className="shrink-0 p-3 border-t border-border bg-card">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="relative flex items-center rounded-lg border border-border bg-background focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all"
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Ask repository architecture..."
            disabled={isSubmitting}
            className="flex-1 max-h-32 min-h-[38px] py-2 px-3 text-xs bg-transparent text-foreground placeholder:text-muted-foreground outline-none resize-none font-mono"
          />
          <button
            type="submit"
            disabled={!input.trim() || isSubmitting}
            className="shrink-0 p-2 mr-1 rounded-md text-primary hover:bg-primary/10 disabled:text-muted-foreground disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-not-allowed"
            title="Send query"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
