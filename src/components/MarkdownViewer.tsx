import { useEffect, useLayoutEffect, useRef, useState, useCallback, memo, useMemo } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import rehypeSlug from 'rehype-slug';
import { useSelectionStore, useAnnotationStore, useSettingsStore } from '@/stores';
import type { SelectionInfo } from '@/types';
import { SelectionPopup } from './SelectionPopup';
import { InlineAnnotation } from './InlineAnnotation';
import { getReadProgress, saveReadProgress } from '@/lib/db';
import type { Components } from 'react-markdown';

// ── Markdown components defined at module level (no closure deps) to keep reference stable──
const markdownComponents: Components = {
  a: ({ href, children, ...props }) => {
    if (href?.startsWith('#')) {
      return (
        <a
          href={href}
          onClick={(e) => {
            e.preventDefault();
            document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth' });
          }}
          {...props}
        >
          {children}
        </a>
      );
    }
    return <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
  },
  // Custom image renderer: data URLs and absolute URLs render normally;
  // relative paths (not yet inlined) show a clear placeholder instead of broken alt text.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  img: ({ src, alt, node: _node, ...props }) => {
    const isResolved = !src || src.startsWith('data:') || /^https?:\/\//i.test(src);
    if (isResolved) {
      return <img src={src} alt={alt} style={{ maxWidth: '100%' }} {...props} />;
    }
    // Relative path — show placeholder so the user knows to use the attach-images button
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.3em',
          padding: '2px 8px',
          borderRadius: 4,
          background: 'var(--color-bg-tertiary)',
          border: '1px dashed var(--color-border)',
          color: 'var(--color-text-tertiary)',
          fontSize: '0.85em',
          cursor: 'default',
        }}
        title={`图片路径 "${src}" 尚未内嵌，请在侧边栏点击 🖼 或 📂 补充图片资源`}
      >
        🖼 {alt || src}
      </span>
    );
  },
};

/**
 * Pre-process markdown before handing to remark.
 * remark's inline URL parser breaks on very long data URLs (base64 images),
 * so we convert  ![alt](data:...)  →  <img src="data:..." alt="..." />
 * which rehype-raw then handles correctly.
 * HTML img tags with data URLs are left untouched.
 */
function preprocessDataUrlImages(content: string): string {
  // Only target markdown image syntax whose URL is a data: URI.
  // Base64 chars are [A-Za-z0-9+/=] — no ')' — so [^)]+ is safe here.
  return content.replace(
    /!\[([^\]]*)\]\((data:[^)]+)\)/g,
    (_, alt, src) => `<img src="${src}" alt="${alt.replace(/"/g, '&quot;')}" style="max-width:100%" />`,
  );
}

// ── Memoised renderer — only re‐runs the full remark/rehype pipeline when content changes ──
const MemoMarkdown = memo(({ content }: { content: string }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm, remarkMath]}
    rehypePlugins={[rehypeKatex, rehypeHighlight, rehypeRaw, rehypeSlug]}
    components={markdownComponents}
  >
    {preprocessDataUrlImages(content)}
  </ReactMarkdown>
));
MemoMarkdown.displayName = 'MemoMarkdown';

// ── Split large docs into sections so we can lazily render only visible parts ──
// Splits at H1/H2 heading boundaries that are NOT inside a code fence.
// Falls back to blank-line splits every ~300 lines for fence-less / heading-less docs.
function splitIntoChunks(content: string, maxLines = 300): string[] {
  const lines = content.split('\n');
  // Small doc — no chunking needed
  if (lines.length <= maxLines) return [content];

  const chunks: string[] = [];
  let current: string[] = [];
  let inFence = false;

  for (const line of lines) {
    // Track triple-backtick / triple-tilde fences
    if (/^(`{3,}|~{3,})/.test(line)) inFence = !inFence;

    const isHeadingBoundary =
      !inFence &&
      /^#{1,2} /.test(line) &&
      current.length >= 50;

    const isEmergencySplit =
      !inFence &&
      current.length >= maxLines &&
      line.trim() === ''; // only split at blank line

    if (isHeadingBoundary || isEmergencySplit) {
      if (current.length) chunks.push(current.join('\n'));
      current = [];
    }
    current.push(line);
  }
  if (current.length) chunks.push(current.join('\n'));
  return chunks.filter((c) => c.trim());
}

// ── Single chunk renderer, memo’d so already-rendered chunks never re-run remark/rehype ──
const MarkdownChunk = memo(({ markdown, isRendered, placeholderHeight }: {
  markdown: string;
  isRendered: boolean;
  placeholderHeight: number;
}) => {
  if (!isRendered) {
    return <div style={{ minHeight: placeholderHeight }} aria-hidden="true" />;
  }
  return <MemoMarkdown content={markdown} />;
});
MarkdownChunk.displayName = 'MarkdownChunk';

/** Scroll to and expand the inline annotation for a given annotation ID */
function activateAnnotationHighlight(annotationId: string) {
  const { setActiveAnnotation } = useAnnotationStore.getState();
  setActiveAnnotation(annotationId);
}

interface MarkdownViewerProps {
  content: string;
  documentId: string;
}

export function MarkdownViewer({ content, documentId }: MarkdownViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { setSelection } = useSelectionStore();
  const { annotations } = useAnnotationStore();
  const { settings } = useSettingsStore();
  const [popupSelection, setPopupSelection] = useState<SelectionInfo | null>(null);
  // Portal containers: annotationId → DOM element inserted after highlighted paragraph
  const [portalContainers, setPortalContainers] = useState<Map<string, HTMLElement>>(new Map());

  // ── Chunked rendering state ──
  const chunks = useMemo(() => splitIntoChunks(content), [content]);
  const chunkRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  // Set of chunk indices that have been rendered into the DOM
  const renderedChunksRef = useRef<Set<number>>(new Set([0]));
  // Bumped whenever renderedChunksRef changes — triggers annotation re-highlight
  const [renderVersion, setRenderVersion] = useState(0);

  // ── Read progress: restore scroll on mount, save scroll on scroll ──
  const scrollSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset chunk render state when document / content changes
  useEffect(() => {
    renderedChunksRef.current = new Set([0]);
    chunkRefs.current.clear();
    setRenderVersion(0);
  }, [content]);

  // Lazy-render chunks via IntersectionObserver (pre-render 2 viewports in advance)
  useEffect(() => {
    if (chunks.length <= 1) return; // single chunk — already fully rendered
    const scrollEl = document.getElementById('markdown-scroll-container');
    const observer = new IntersectionObserver(
      (entries) => {
        let changed = false;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = parseInt((entry.target as HTMLElement).dataset.chunkIndex ?? '-1', 10);
          if (idx >= 0 && !renderedChunksRef.current.has(idx)) {
            renderedChunksRef.current.add(idx);
            changed = true;
          }
        }
        if (changed) setRenderVersion((v) => v + 1);
      },
      { root: scrollEl, rootMargin: '200% 0px', threshold: 0 },
    );
    // Observe chunk wrapper divs (populated by ref callbacks in render)
    const attachObservers = () => {
      chunkRefs.current.forEach((el) => observer.observe(el));
    };
    // Refs are set during render; observe in a microtask so they’re all available
    Promise.resolve().then(attachObservers);
    return () => observer.disconnect();
  }, [chunks, documentId]);

  // Restore scroll when document changes
  useEffect(() => {
    const el = document.getElementById('markdown-scroll-container');
    if (!el) return;
    getReadProgress(documentId).then((p) => {
      if (p?.scrollTop) {
        el.scrollTop = p.scrollTop;
      } else {
        el.scrollTop = 0;
      }
    });
  }, [documentId]);

  // Save scroll on scroll (debounced 500ms)
  useEffect(() => {
    const el = document.getElementById('markdown-scroll-container');
    if (!el) return;
    const handleScroll = () => {
      if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current);
      scrollSaveTimer.current = setTimeout(() => {
        saveReadProgress({ documentId, scrollTop: el.scrollTop, updatedAt: Date.now() });
      }, 500);
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current);
    };
  }, [documentId]);

  const docAnnotations = annotations
    .filter((a) => a.documentId === documentId)
    .sort((a, b) => {
      const posHintA = a.positionHint?.startOffset;
      const posHintB = b.positionHint?.startOffset;
      if (typeof posHintA === 'number' && typeof posHintB === 'number') {
        return posHintA - posHintB;
      }
      if (typeof posHintA === 'number') return -1;
      if (typeof posHintB === 'number') return 1;

      // Sort by position in document content (earlier text first)
      const posA = content.indexOf(a.selectedText);
      const posB = content.indexOf(b.selectedText);
      // If not found in content, put at end
      const safeA = posA === -1 ? Infinity : posA;
      const safeB = posB === -1 ? Infinity : posB;
      return safeA - safeB;
    });

  const handleMouseUp = useCallback(() => {
    requestAnimationFrame(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;

      const range = sel.getRangeAt(0);
      const rawText = sel.toString();
      if (!rawText.trim() || !containerRef.current?.contains(range.commonAncestorContainer)) return;

      const rect = range.getBoundingClientRect();

      // ── Find the chunk wrapper that contains this selection ──
      const chunkWrapperEl = (range.startContainer as Node).parentElement
        ?.closest<HTMLElement>('[data-chunk-index]');
      const chunkIndex = chunkWrapperEl
        ? parseInt(chunkWrapperEl.dataset.chunkIndex ?? '0', 10)
        : 0;
      // Compute offsets relative to the chunk container (or full container if no chunk found)
      const searchRoot = chunkWrapperEl ?? containerRef.current;

      const offsetInfo = getRangeOffsets(searchRoot, range, '.inline-annotation, .annotation-portal, .katex');
      const leadingTrim = rawText.length - rawText.trimStart().length;
      const trailingTrim = rawText.length - rawText.trimEnd().length;
      const selStart = offsetInfo.start + leadingTrim;
      const selEnd = Math.max(selStart, offsetInfo.end - trailingTrim);
      const text = offsetInfo.fullText.slice(selStart, selEnd).trim();
      if (!text) return;
      const contextBefore = selStart > 0
        ? offsetInfo.fullText.slice(Math.max(0, selStart - 200), selStart)
        : '';
      const contextAfter = offsetInfo.fullText.slice(selEnd, selEnd + 200);

      const paragraphs = searchRoot.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, td, th');
      let paragraphIndex = 0;
      for (let i = 0; i < paragraphs.length; i++) {
        if (paragraphs[i].contains(range.startContainer)) {
          paragraphIndex = i;
          break;
        }
      }

      const info: SelectionInfo = {
        text,
        contextBefore,
        contextAfter,
        rect,
        paragraphIndex,
        startOffset: selStart,
        endOffset: selEnd,
        chunkIndex,
      };

      setPopupSelection(info);
      setSelection(info);
    });
  }, [setSelection]);

  // Close popup when clicking outside
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const popup = document.querySelector('.selection-popup');
      if (popup?.contains(e.target as Node)) return;

      requestAnimationFrame(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) {
          setPopupSelection(null);
          setSelection(null);
        }
      });
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [setSelection]);

  // Handle clicks on annotation highlights → activate corresponding annotation
  useEffect(() => {
    if (!containerRef.current) return;
    const handleHighlightClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('.annotation-highlight');
      if (!target) return;
      const annId = (target as HTMLElement).dataset.annotationId;
      if (annId) {
        e.stopPropagation();
        activateAnnotationHighlight(annId);
      }
    };
    containerRef.current.addEventListener('click', handleHighlightClick);
    const ref = containerRef.current;
    return () => ref.removeEventListener('click', handleHighlightClick);
  }, []);

  // Apply annotation highlights AND insert portal containers after highlighted paragraphs
  // useLayoutEffect so DOM mutations happen before paint — prevents scroll blank flash
  useLayoutEffect(() => {
    if (!containerRef.current) return;

    // Clean up old highlights
    containerRef.current.querySelectorAll('.annotation-highlight').forEach((el) => {
      const parent = el.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(el.textContent || ''), el);
        parent.normalize();
      }
    });

    // Clean up old portal containers
    containerRef.current.querySelectorAll('.annotation-portal').forEach((el) => el.remove());

    const newPortals = new Map<string, HTMLElement>();
    const BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'DIV', 'SECTION', 'ARTICLE', 'TD', 'TH', 'DT', 'DD']);

    for (const annotation of docAnnotations) {
      // Resolve the search root: the specific chunk if known, else full container
      const chunkIndex = annotation.positionHint?.chunkIndex;
      const searchRoot: HTMLElement =
        (typeof chunkIndex === 'number' && chunkRefs.current.get(chunkIndex))
          ? chunkRefs.current.get(chunkIndex)!
          : containerRef.current;

      // Skip annotations whose chunk hasn't rendered yet — renderVersion bump will retry
      if (typeof chunkIndex === 'number' && !renderedChunksRef.current.has(chunkIndex)) continue;

      highlightText(
        searchRoot,
        annotation.selectedText,
        annotation.id,
        annotation.positionHint?.startOffset,
        annotation.positionHint?.endOffset,
      );

      const highlightSpan: Element | null = searchRoot.querySelector(
        `.annotation-highlight[data-annotation-id="${CSS.escape(annotation.id)}"]`
      );

      if (highlightSpan) {
        let blockParent: Element | null = highlightSpan.parentElement;
        while (blockParent && blockParent !== containerRef.current) {
          if (BLOCK_TAGS.has(blockParent.tagName) || blockParent.parentElement === containerRef.current) {
            break;
          }
          blockParent = blockParent.parentElement;
        }

        if (blockParent && blockParent !== containerRef.current) {
          const portalDiv = document.createElement('div');
          portalDiv.className = 'annotation-portal';
          portalDiv.dataset.annotationId = annotation.id;
          blockParent.parentNode!.insertBefore(portalDiv, blockParent.nextSibling);
          newPortals.set(annotation.id, portalDiv);
        }
      }
    }

    setPortalContainers(newPortals);
  }, [annotations, documentId, content, renderVersion]);

  // Temporary visual highlight for popup selection (so autoFocus doesn't lose the visual cue)
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    // Remove old temp highlights
    containerRef.current.querySelectorAll('.temp-selection-highlight').forEach((el) => {
      const parent = el.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(el.textContent || ''), el);
        parent.normalize();
      }
    });
    if (!popupSelection) return;
    // Only search within the chunk the selection came from (chunk-local offsets)
    const searchRoot: HTMLElement =
      (typeof popupSelection.chunkIndex === 'number' && chunkRefs.current.get(popupSelection.chunkIndex))
        ? chunkRefs.current.get(popupSelection.chunkIndex)!
        : containerRef.current;
    highlightText(
      searchRoot,
      popupSelection.text,
      '__temp_selection__',
      popupSelection.startOffset,
      popupSelection.endOffset,
    );
    // Restyle to temp class
    containerRef.current.querySelectorAll('.annotation-highlight[data-annotation-id="__temp_selection__"]').forEach((el) => {
      el.className = 'temp-selection-highlight';
      delete (el as HTMLElement).dataset.annotationId;
    });
  }, [popupSelection]);

  // Annotations that couldn't be placed via portal (text not found in document)
  const orphanAnnotations = docAnnotations.filter((ann) => !portalContainers.has(ann.id));

  return (
    <div className="relative h-full">
      <div className="h-full overflow-y-auto px-10 py-8 lg:px-20" id="markdown-scroll-container">
        <div
          ref={containerRef}
          className="markdown-body max-w-[780px]"
          style={{ fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight }}
          onMouseUp={handleMouseUp}
        >
          {chunks.map((chunk, i) => (
            <div
              key={i}
              data-chunk-index={i}
              ref={(el) => { if (el) chunkRefs.current.set(i, el); }}
            >
              <MarkdownChunk
                markdown={chunk}
                isRendered={renderedChunksRef.current.has(i)}
                placeholderHeight={chunk.split('\n').length * 22}
              />
            </div>
          ))}

          {/* Fallback: render annotations that couldn't be placed inline (orphans) */}
          {orphanAnnotations.length > 0 && (
            <div className="mt-6 pt-4" style={{ borderTop: '1px dashed var(--color-border-strong)' }}>
              {orphanAnnotations.map((ann) => (
                <InlineAnnotation key={ann.id} annotation={ann} documentId={documentId} />
              ))}
            </div>
          )}
        </div>

        {/* Render inline annotations via portals right after highlighted paragraphs */}
        {docAnnotations.map((ann) => {
          const container = portalContainers.get(ann.id);
          if (!container) return null;
          return createPortal(
            <InlineAnnotation key={ann.id} annotation={ann} documentId={documentId} />,
            container,
          );
        })}
      </div>

      {popupSelection && (
        <SelectionPopup
          selection={popupSelection}
          onClose={() => { setPopupSelection(null); }}
          documentId={documentId}
        />
      )}
    </div>
  );
}

function getRangeOffsets(container: HTMLElement, range: Range, skipSelector: string) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let fullText = '';
  let start = -1;
  let end = -1;
  let node: Node | null;

  while ((node = walker.nextNode())) {
    const textNode = node as Text;
    if (textNode.parentElement?.closest(skipSelector)) continue;

    const nodeText = textNode.textContent || '';
    const base = fullText.length;
    fullText += nodeText;

    if (textNode === range.startContainer) {
      start = base + range.startOffset;
    }
    if (textNode === range.endContainer) {
      end = base + range.endOffset;
    }
  }

  if (start < 0 || end < 0) {
    const fallbackStart = fullText.indexOf(range.toString());
    if (fallbackStart >= 0) {
      return {
        fullText,
        start: fallbackStart,
        end: fallbackStart + range.toString().length,
      };
    }
    return { fullText, start: 0, end: 0 };
  }

  return { fullText, start, end };
}

function findBestMatchIndex(haystack: string, needle: string, preferredStart?: number) {
  if (!needle) return -1;
  if (typeof preferredStart === 'number' && preferredStart >= 0) {
    if (haystack.slice(preferredStart, preferredStart + needle.length) === needle) {
      return preferredStart;
    }

    const forward = haystack.indexOf(needle, preferredStart);
    const backward = haystack.lastIndexOf(needle, preferredStart);

    if (forward === -1) return backward;
    if (backward === -1) return forward;

    return Math.abs(forward - preferredStart) < Math.abs(preferredStart - backward)
      ? forward
      : backward;
  }

  return haystack.indexOf(needle);
}

function highlightText(
  container: HTMLElement,
  text: string,
  annotationId: string,
  preferredStart?: number,
  preferredEnd?: number,
) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    // Skip text nodes inside inline-annotation blocks or annotation portals
    // and KaTeX subtree (MathML/HTML dual trees introduce offset drift).
    // Matches getRangeOffsets skip logic so offsets stay in sync.
    if ((node as Node).parentElement?.closest('.inline-annotation, .annotation-portal, .katex')) continue;
    textNodes.push(node as Text);
  }

  let accumulated = '';
  const nodeRanges: { node: Text; start: number; end: number }[] = [];

  for (const tn of textNodes) {
    const prevLen = accumulated.length;
    accumulated += tn.textContent || '';
    nodeRanges.push({ node: tn, start: prevLen, end: accumulated.length });
  }

  let targetStart = -1;
  let targetEnd = -1;

  const hasPreferredRange =
    typeof preferredStart === 'number' &&
    typeof preferredEnd === 'number' &&
    preferredStart >= 0 &&
    preferredEnd > preferredStart;

  if (hasPreferredRange && accumulated.slice(preferredStart, preferredEnd) === text) {
    targetStart = preferredStart;
    targetEnd = preferredEnd;
  } else {
    // Offsets stale or missing — fall back to nearest-occurrence search
    const idx = findBestMatchIndex(accumulated, text, hasPreferredRange ? preferredStart : undefined);
    if (idx === -1) return;
    targetStart = idx;
    targetEnd = idx + text.length;
  }

  if (targetStart < 0 || targetEnd <= targetStart) return;
  if (targetStart >= accumulated.length) return;
  targetEnd = Math.min(targetEnd, accumulated.length);

  for (const nr of nodeRanges) {
    if (nr.end <= targetStart || nr.start >= targetEnd) continue;
    const nodeStart = Math.max(0, targetStart - nr.start);
    const nodeEnd = Math.min(nr.node.textContent!.length, targetEnd - nr.start);

    const range = document.createRange();
    range.setStart(nr.node, nodeStart);
    range.setEnd(nr.node, nodeEnd);

    const span = document.createElement('span');
    span.className = 'annotation-highlight';
    span.dataset.annotationId = annotationId;
    try {
      range.surroundContents(span);
    } catch {
      // skip if range spans multiple elements
    }
  }
}
