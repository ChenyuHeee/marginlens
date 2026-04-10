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
import type { SelectionInfo, Annotation } from '@/types';
import { SelectionPopup } from './SelectionPopup';
import { InlineAnnotation } from './InlineAnnotation';

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

  const docAnnotations = annotations.filter((a) => a.documentId === documentId);

  const handleMouseUp = useCallback(() => {
    requestAnimationFrame(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;

      const range = sel.getRangeAt(0);
      const text = sel.toString().trim();
      if (!text || !containerRef.current?.contains(range.commonAncestorContainer)) return;

      const rect = range.getBoundingClientRect();

      const fullText = containerRef.current.textContent || '';
      const selStart = fullText.indexOf(text);
      const contextBefore = selStart > 0 ? fullText.slice(Math.max(0, selStart - 200), selStart) : '';
      const contextAfter = fullText.slice(selStart + text.length, selStart + text.length + 200);

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
        startOffset: range.startOffset,
        endOffset: range.endOffset,
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
      highlightText(containerRef.current, annotation.selectedText, annotation.id);

      // Find the highlight span we just inserted
      const highlightSpan = containerRef.current.querySelector(
        `.annotation-highlight[data-annotation-id="${CSS.escape(annotation.id)}"]`
      );

      if (highlightSpan) {
        // Walk up to the nearest block-level parent
        let blockParent = highlightSpan.parentElement;
        while (blockParent && blockParent !== containerRef.current) {
          const display = window.getComputedStyle(blockParent).display;
          if (display === 'block' || display === 'list-item' || blockParent.parentElement === containerRef.current) {
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

function highlightText(container: HTMLElement, text: string, annotationId: string) {
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

  const idx = accumulated.indexOf(text);
  if (idx === -1) return;

  const targetStart = idx;
  const targetEnd = idx + text.length;

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
