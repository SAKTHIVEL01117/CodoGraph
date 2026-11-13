"use client";

/**
 * CodoGraph — Phase 10: Constrained Explanation Markdown Renderer.
 *
 * Requirements & Constraints:
 * 1. Permits EXACTLY three pieces of formatting:
 *    - inline code (`code`)
 *    - bold text (**bold**)
 *    - bullet items (- or * at line start)
 * 2. NO headings: strip any # marks because headings cut paragraphs into fragments in narrow panes.
 * 3. Repository paths in inline code or prose turn into clickable buttons that call onSelect(path).
 * 4. Zero stray backticks, asterisks or hash symbols in output.
 */
import React, { useMemo } from 'react';

interface ExplanationRendererProps {
  content: string;
  knownPaths: Set<string>;
  onSelect: (path: string) => void;
}

/**
 * Searches plain text for repository paths and renders them as clickable links,
 * while stripping rogue leftover markdown characters (*, `, #).
 */
function renderPlainTextWithLinks(
  plainText: string,
  knownPaths: Set<string>,
  onSelect: (path: string) => void,
  nodes: React.ReactNode[],
  getNextKey: (suffix: string) => string
) {
  // Strip any rogue lone backticks, asterisks, or hash symbols
  const cleaned = plainText.replace(/[`*#]/g, '');
  if (!cleaned) return;

  // Split by whitespace while preserving delimiters
  const tokens = cleaned.split(/(\s+)/);

  // Fast path: if no token is in knownPaths, emit a single span for the whole segment
  const hasKnownPath = tokens.some((token) => {
    const match = token.match(/^([("']*)(.*?)([.,:;)"']*)$/);
    const core = match ? match[2] : token;
    return core && knownPaths.has(core);
  });

  if (!hasKnownPath) {
    nodes.push(<span key={getNextKey('text')}>{cleaned}</span>);
    return;
  }

  tokens.forEach((token) => {
    if (!token) return;

    // Check if token matches a repo path (handling trailing punctuation like ., ,, ;, ))
    const matchPunctuation = token.match(/^([("']*)(.*?)([.,:;)"']*)$/);
    const leading = matchPunctuation ? matchPunctuation[1] : '';
    const core = matchPunctuation ? matchPunctuation[2] : token;
    const trailing = matchPunctuation ? matchPunctuation[3] : '';

    if (core && knownPaths.has(core)) {
      nodes.push(
        <span key={getNextKey('link-wrap')}>
          {leading}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(core);
            }}
            className="inline-flex items-center text-primary font-mono text-[11px] underline underline-offset-2 hover:text-primary/80 transition-colors cursor-pointer"
            title={`Select ${core}`}
          >
            {core}
          </button>
          {trailing}
        </span>
      );
    } else {
      nodes.push(<span key={getNextKey('seg')}>{token}</span>);
    }
  });
}

/**
 * Renders inline text containing bold (**...**), inline code (`...`), and repo path links.
 * Cleans any rogue unclosed markers.
 */
function renderInlineSegments(
  text: string,
  knownPaths: Set<string>,
  onSelect: (path: string) => void,
  prefix: string
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let counter = 0;
  const getNextKey = (suffix: string) => `${prefix}-${suffix}-${counter++}`;

  // Regex matches inline code `...` OR bold **...**
  // Group 1: code inside backticks
  // Group 2: bold inside double asterisks
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    // 1. Text before the match
    if (match.index > lastIndex) {
      const plain = text.slice(lastIndex, match.index);
      renderPlainTextWithLinks(plain, knownPaths, onSelect, nodes, getNextKey);
    }

    if (match[1] !== undefined) {
      // Inline code `...`
      const codeVal = match[1].trim();
      if (knownPaths.has(codeVal)) {
        nodes.push(
          <button
            key={getNextKey('code-link')}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(codeVal);
            }}
            className="inline-flex items-center text-primary font-mono text-[11px] underline underline-offset-2 hover:text-primary/80 transition-colors cursor-pointer"
            title={`Select ${codeVal}`}
          >
            {codeVal}
          </button>
        );
      } else {
        nodes.push(
          <code
            key={getNextKey('code')}
            className="px-1 py-0.5 rounded bg-muted/60 text-foreground font-mono text-[11px] border border-border/40"
          >
            {codeVal}
          </code>
        );
      }
    } else if (match[2] !== undefined) {
      // Bold **...**
      const boldVal = match[2];
      nodes.push(
        <strong key={getNextKey('bold')} className="font-semibold text-foreground">
          {boldVal}
        </strong>
      );
    }

    lastIndex = pattern.lastIndex;
  }

  // Remaining text after last match
  if (lastIndex < text.length) {
    const trailing = text.slice(lastIndex);
    renderPlainTextWithLinks(trailing, knownPaths, onSelect, nodes, getNextKey);
  }

  return nodes;
}

export function ExplanationRenderer({
  content,
  knownPaths,
  onSelect,
}: ExplanationRendererProps) {
  const elements = useMemo(() => {
    if (!content || content.trim() === '') {
      return null;
    }

    const lines = content.split('\n');
    const result: React.ReactNode[] = [];
    let currentBulletList: React.ReactNode[] = [];
    let blockIdx = 0;

    const flushBulletList = () => {
      if (currentBulletList.length > 0) {
        const listIdx = blockIdx++;
        result.push(
          <ul
            key={`bullet-list-${listIdx}`}
            className="my-2 space-y-1.5 list-none pl-0 text-xs text-foreground/90 font-sans"
          >
            {currentBulletList}
          </ul>
        );
        currentBulletList = [];
      }
    };

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();

      // Constraint: Strip any rogue markdown headings (#, ##, ###)
      line = line.replace(/^#{1,6}\s+/, '');

      if (!line) {
        flushBulletList();
        continue;
      }

      // Check for bullet list item: starts with '- ' or '* ' or '• '
      const bulletMatch = line.match(/^[-*•]\s+(.*)$/);
      if (bulletMatch) {
        const bulletText = bulletMatch[1].trim();
        const itemIdx = currentBulletList.length;
        const inlineNodes = renderInlineSegments(
          bulletText,
          knownPaths,
          onSelect,
          `b-${blockIdx}-${itemIdx}`
        );

        currentBulletList.push(
          <li
            key={`bullet-item-${blockIdx}-${itemIdx}`}
            className="flex items-start gap-2 leading-relaxed"
          >
            <span className="text-primary mt-1 select-none text-[10px] shrink-0 leading-none">
              •
            </span>
            <div className="flex-1 min-w-0">{inlineNodes}</div>
          </li>
        );
      } else {
        flushBulletList();
        const pIdx = blockIdx++;
        const inlineNodes = renderInlineSegments(
          line,
          knownPaths,
          onSelect,
          `p-${pIdx}`
        );
        result.push(
          <p
            key={`paragraph-${pIdx}`}
            className="text-xs leading-relaxed text-foreground/90 font-sans my-1.5"
          >
            {inlineNodes}
          </p>
        );
      }
    }

    flushBulletList();
    return result;
  }, [content, knownPaths, onSelect]);

  if (!elements || elements.length === 0) {
    return null;
  }

  return <div className="space-y-2">{elements}</div>;
}

