import { useEffect, useRef, useState, useCallback } from 'react';
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
      const text = rawText.trim();
      if (!text || !containerRef.current?.contains(range.commonAncestorContainer)) return;

      const rect = range.getBoundingClientRect();

      const offsetInfo = getRangeOffsets(containerRef.current, range, '.inline-annotation, .annotation-portal');
      const leadingTrim = rawText.length - rawText.trimStart().length;
      const trailingTrim = rawText.length - rawText.trimEnd().length;
      const selStart = offsetInfo.start + leadingTrim;
      const selEnd = Math.max(selStart, offsetInfo.end - trailingTrim);
      const contextBefore = selStart > 0
        ? offsetInfo.fullText.slice(Math.max(0, selStart - 200), selStart)
        : '';
      const contextAfter = offsetInfo.fullText.slice(selEnd, selEnd + 200);

      const paragraphs = containerRef.current.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, td, th');
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
  useEffect(() => {
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

    for (const annotation of docAnnotations) {
      // Try to highlight the text in the rendered markdown
      highlightText(
        containerRef.current,
        annotation.selectedText,
        annotation.id,
        annotation.positionHint?.startOffset,
          annotation.positionHint?.endOffset,
      );

      // Find the highlight span we just inserted
      const highlightSpan: Element | null = containerRef.current.querySelector(
        `.annotation-highlight[data-annotation-id="${CSS.escape(annotation.id)}"]`
      );

      if (highlightSpan) {
        // Walk up to the nearest block-level parent using tag names (avoids getComputedStyle reflow)
        const BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'DIV', 'SECTION', 'ARTICLE', 'TD', 'TH', 'DT', 'DD']);
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
  }, [annotations, documentId, content]);

  // Temporary visual highlight for popup selection (so autoFocus doesn't lose the visual cue)
  useEffect(() => {
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
    // Apply temporary highlight at the captured offsets
    highlightText(
      containerRef.current,
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
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex, rehypeHighlight, rehypeRaw, rehypeSlug]}
            components={{
              a: ({ href, children, ...props }) => {
                if (href?.startsWith('#')) {
                  return (
                    <a
                      href={href}
                      onClick={(e) => {
                        e.preventDefault();
                        const target = document.getElementById(href.slice(1));
                        if (target) {
                          target.scrollIntoView({ behavior: 'smooth' });
                        }
                      }}
                      {...props}
                    >
                      {children}
                    </a>
                  );
                }
                return <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
              },
            }}
          >
            {content}
          </ReactMarkdown>

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
    // Skip text nodes inside inline-annotation blocks
    if ((node as Node).parentElement?.closest('.inline-annotation')) continue;
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

  if (hasPreferredRange) {
    targetStart = preferredStart;
    targetEnd = preferredEnd;
  } else {
    const idx = findBestMatchIndex(accumulated, text, preferredStart);
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
