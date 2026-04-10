import { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { useSelectionStore, useAnnotationStore, useDocumentStore, useUIStore } from '@/stores';
import type { Document, SelectionInfo } from '@/types';
import { SelectionPopup } from './SelectionPopup';
import { ZoomIn, ZoomOut, ChevronUp, ChevronDown } from 'lucide-react';

// Configure worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface PdfViewerProps {
  document: Document;
}

export function PdfViewer({ document: doc }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.5);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const renderingPages = useRef<Set<number>>(new Set());

  const { setSelection } = useSelectionStore();
  const { annotations } = useAnnotationStore();
  const [popupSelection, setPopupSelection] = useState<SelectionInfo | null>(null);

  const docAnnotations = annotations.filter((a) => a.documentId === doc.id);

  // Load PDF document
  useEffect(() => {
    if (!doc.pdfData) {
      setError('PDF 数据不可用');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const loadPdf = async () => {
      try {
        const data = new Uint8Array(doc.pdfData!);
        const pdf = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) {
          pdf.destroy();
          return;
        }
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
        setCurrentPage(1);
        setLoading(false);

        // Extract full text for LLM context if not already done
        if (!doc.extractedText) {
          const pages: string[] = [];
          for (let i = 1; i <= pdf.numPages; i++) {
            const p = await pdf.getPage(i);
            const tc = await p.getTextContent();
            const pageText = tc.items
              .filter((it) => 'str' in it && it.str)
              .map((it) => ('str' in it ? it.str : ''))
              .join('');
            pages.push(pageText);
          }
          const fullText = pages.join('\n\n');
          useDocumentStore.getState().updateDocument(doc.id, { extractedText: fullText });
        }
      } catch (err) {
        if (!cancelled) {
          setError(`加载 PDF 失败: ${err instanceof Error ? err.message : '未知错误'}`);
          setLoading(false);
        }
      }
    };

    loadPdf();
    return () => {
      cancelled = true;
    };
  }, [doc.id, doc.pdfData]);

  // Cleanup PDF document on unmount
  useEffect(() => {
    return () => {
      pdfDoc?.destroy();
    };
  }, [pdfDoc]);

  // Render a single page
  const renderPage = useCallback(
    async (pageNum: number, container: HTMLDivElement) => {
      if (!pdfDoc || renderingPages.current.has(pageNum)) return;
      renderingPages.current.add(pageNum);

      try {
        const page: PDFPageProxy = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        // Clear previous content
        container.innerHTML = '';
        container.style.width = `${viewport.width}px`;
        container.style.height = `${viewport.height}px`;

        // Canvas for rendering
        const canvas = window.document.createElement('canvas');
        canvas.width = Math.floor(viewport.width * window.devicePixelRatio);
        canvas.height = Math.floor(viewport.height * window.devicePixelRatio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        canvas.style.display = 'block';
        canvas.style.position = 'relative';
        canvas.style.zIndex = '0';
        canvas.style.pointerEvents = 'none';
        container.appendChild(canvas);

        const ctx = canvas.getContext('2d')!;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

        await page.render({ canvas, canvasContext: ctx, viewport }).promise;

        // Build text layer manually from text content
        const textContent = await page.getTextContent();
        const textLayerDiv = window.document.createElement('div');
        textLayerDiv.className = 'pdf-text-layer';
        textLayerDiv.style.position = 'absolute';
        textLayerDiv.style.left = '0';
        textLayerDiv.style.top = '0';
        textLayerDiv.style.right = '0';
        textLayerDiv.style.bottom = '0';
        textLayerDiv.style.overflow = 'visible';
        textLayerDiv.style.lineHeight = '1';
        textLayerDiv.style.zIndex = '1';
        container.appendChild(textLayerDiv);

        for (const item of textContent.items) {
          if (!('str' in item) || !item.str) continue;
          const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
          const fontHeight = Math.hypot(tx[2], tx[3]);
          const angle = Math.atan2(tx[1], tx[0]);

          const span = window.document.createElement('span');
          span.textContent = item.str;
          span.dataset.pageNum = String(pageNum);
          span.style.position = 'absolute';
          span.style.left = `${tx[4]}px`;
          span.style.top = `${tx[5] - fontHeight}px`;
          span.style.fontSize = `${fontHeight}px`;
          span.style.fontFamily = 'sans-serif';
          span.style.color = 'transparent';
          span.style.whiteSpace = 'pre';
          span.style.cursor = 'text';
          span.style.transformOrigin = '0% 0%';
          span.style.lineHeight = '1';
          span.style.webkitUserSelect = 'text';
          span.style.userSelect = 'text';
          if (angle !== 0) {
            span.style.transform = `rotate(${angle}rad)`;
          }
          // Scale width to match PDF glyph width
          if (item.width && item.str.length > 0) {
            const scaledWidth = item.width * viewport.scale;
            span.dataset.targetWidth = String(scaledWidth);
          }
          textLayerDiv.appendChild(span);
        }

        // Adjust span widths to match PDF layout
        textLayerDiv.querySelectorAll('span').forEach((span) => {
          const targetWidth = Number(span.dataset.targetWidth);
          if (targetWidth && span.offsetWidth > 0) {
            const currentWidth = span.getBoundingClientRect().width;
            if (currentWidth > 0) {
              span.style.transform = (span.style.transform || '') +
                ` scaleX(${targetWidth / currentWidth})`;
            }
          }
        });

        // Tag spans with page number for selection handling — already done above

        // Apply annotation highlights
        applyHighlights(textLayerDiv, pageNum);
      } finally {
        renderingPages.current.delete(pageNum);
      }
    },
    [pdfDoc, scale],
  );

  // Apply annotation highlights to text layer spans
  const applyHighlights = (textLayer: HTMLDivElement, _pageNum: number) => {
    const spans = textLayer.querySelectorAll<HTMLSpanElement>('span');
    const fullText = Array.from(spans)
      .map((s) => s.textContent)
      .join('');

    for (const ann of docAnnotations) {
      const idx = fullText.indexOf(ann.selectedText);
      if (idx === -1) continue;

      let charCount = 0;
      for (const span of spans) {
        const text = span.textContent || '';
        const spanStart = charCount;
        const spanEnd = charCount + text.length;
        charCount = spanEnd;

        // Check overlap with annotation
        const highlightStart = Math.max(idx, spanStart);
        const highlightEnd = Math.min(idx + ann.selectedText.length, spanEnd);

        if (highlightStart < highlightEnd) {
          span.classList.add('pdf-annotation-highlight');
          span.dataset.annotationId = ann.id;
        }
      }
    }
  };

  // Render all visible pages
  useEffect(() => {
    if (!pdfDoc) return;

    // Render all pages
    for (let i = 1; i <= numPages; i++) {
      const container = pageRefs.current.get(i);
      if (container) {
        renderPage(i, container);
      }
    }
  }, [pdfDoc, scale, numPages, renderPage]);

  // Re-apply highlights when annotations change
  useEffect(() => {
    if (!pdfDoc) return;
    pageRefs.current.forEach((container, pageNum) => {
      const textLayer = container.querySelector('.pdf-text-layer') as HTMLDivElement;
      if (textLayer) {
        // Remove old highlights
        textLayer.querySelectorAll('.pdf-annotation-highlight').forEach((el) => {
          el.classList.remove('pdf-annotation-highlight');
          delete (el as HTMLElement).dataset.annotationId;
        });
        applyHighlights(textLayer, pageNum);
      }
    });
  }, [annotations, pdfDoc]);

  // Track current page on scroll
  useEffect(() => {
    const scrollEl = scrollContainerRef.current;
    if (!scrollEl) return;

    const handleScroll = () => {
      const pageElements = Array.from(pageRefs.current.entries());
      for (const [pageNum, el] of pageElements) {
        const rect = el.getBoundingClientRect();
        const containerRect = scrollEl.getBoundingClientRect();
        if (rect.top <= containerRect.top + containerRect.height / 3 && rect.bottom > containerRect.top) {
          setCurrentPage(pageNum);
        }
      }
    };

    scrollEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollEl.removeEventListener('scroll', handleScroll);
  }, [numPages]);

  // Handle text selection
  const handleMouseUp = useCallback(() => {
    requestAnimationFrame(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;

      const range = sel.getRangeAt(0);
      const text = sel.toString().trim();
      if (!text || !containerRef.current?.contains(range.commonAncestorContainer)) return;

      const rect = range.getBoundingClientRect();

      // Get context from surrounding text
      const textLayer = (range.startContainer as Node).parentElement?.closest('.pdf-text-layer');
      const fullText = textLayer?.textContent || '';
      const selStart = fullText.indexOf(text);
      const contextBefore = selStart > 0 ? fullText.slice(Math.max(0, selStart - 200), selStart) : '';
      const contextAfter = fullText.slice(selStart + text.length, selStart + text.length + 200);

      // Determine page number
      const pageEl = (range.startContainer as Node).parentElement?.closest('.pdf-page-wrapper');
      const pageNum = pageEl ? parseInt(pageEl.getAttribute('data-page') || '1', 10) : 1;

      const info: SelectionInfo = {
        text,
        contextBefore,
        contextAfter,
        rect,
        paragraphIndex: pageNum, // use pageNum as paragraph index for PDF
        startOffset: range.startOffset,
        endOffset: range.endOffset,
      };

      setPopupSelection(info);
      setSelection(info);
    });
  }, [setSelection]);

  // Close popup on outside click
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const popup = window.document.querySelector('.selection-popup');
      if (popup?.contains(e.target as Node)) return;

      requestAnimationFrame(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) {
          setPopupSelection(null);
          setSelection(null);
        }
      });
    };
    window.document.addEventListener('mousedown', handleMouseDown);
    return () => window.document.removeEventListener('mousedown', handleMouseDown);
  }, [setSelection]);

  // Handle annotation highlight click
  useEffect(() => {
    if (!containerRef.current) return;
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('.pdf-annotation-highlight');
      if (!target) return;
      const annId = (target as HTMLElement).dataset.annotationId;
      if (annId) {
        e.stopPropagation();
        const { setActiveAnnotation } = useAnnotationStore.getState();
        setActiveAnnotation(annId);
        // Switch to annotations tab in right panel
        useUIStore.getState().setRightPanelTab('annotations');
      }
    };
    containerRef.current.addEventListener('click', handleClick);
    const ref = containerRef.current;
    return () => ref.removeEventListener('click', handleClick);
  }, []);

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.25, 4));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.25, 0.5));

  const scrollToPage = (pageNum: number) => {
    const el = pageRefs.current.get(pageNum);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center" style={{ color: 'var(--color-text-tertiary)' }}>
        <div className="text-center">
          <div className="animate-spin w-6 h-6 border-2 border-current border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-[13px]">加载 PDF...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center" style={{ color: 'var(--color-text-tertiary)' }}>
        <div className="text-center">
          <p className="text-[14px] font-medium" style={{ color: '#ff3b30' }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full flex flex-col" ref={containerRef}>
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-4 h-10 flex-shrink-0"
        style={{
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-bg-secondary)',
        }}
      >
        <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
          <button
            onClick={() => { if (currentPage > 1) scrollToPage(currentPage - 1); }}
            className="p-0.5 rounded hover:bg-[var(--color-card-hover)]"
            disabled={currentPage <= 1}
          >
            <ChevronUp size={14} />
          </button>
          <span>
            {currentPage} / {numPages}
          </span>
          <button
            onClick={() => { if (currentPage < numPages) scrollToPage(currentPage + 1); }}
            className="p-0.5 rounded hover:bg-[var(--color-card-hover)]"
            disabled={currentPage >= numPages}
          >
            <ChevronDown size={14} />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={handleZoomOut} className="p-1 rounded hover:bg-[var(--color-card-hover)]">
            <ZoomOut size={14} style={{ color: 'var(--color-text-secondary)' }} />
          </button>
          <span className="text-[11px] min-w-[40px] text-center" style={{ color: 'var(--color-text-secondary)' }}>
            {Math.round(scale * 100)}%
          </span>
          <button onClick={handleZoomIn} className="p-1 rounded hover:bg-[var(--color-card-hover)]">
            <ZoomIn size={14} style={{ color: 'var(--color-text-secondary)' }} />
          </button>
        </div>
      </div>

      {/* PDF Pages */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto"
        id="pdf-scroll-container"
        style={{ background: 'var(--color-bg-tertiary)' }}
        onMouseUp={handleMouseUp}
      >
        <div className="flex flex-col items-center py-4 gap-3">
          {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
            <div key={pageNum} className="flex flex-col items-center gap-3" style={{ width: 'fit-content' }}>
              <div
                data-page={pageNum}
                className="pdf-page-wrapper relative shadow-md"
                style={{ background: '#fff' }}
                ref={(el) => {
                  if (el) pageRefs.current.set(pageNum, el);
                }}
              >
                {/* Canvas + text layer will be rendered here */}
              </div>
            </div>
          ))}
        </div>
      </div>

      {popupSelection && (
        <SelectionPopup
          selection={popupSelection}
          onClose={() => setPopupSelection(null)}
          documentId={doc.id}
        />
      )}
    </div>
  );
}
