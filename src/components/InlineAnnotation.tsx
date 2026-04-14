import { useState, useRef, useCallback, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Trash2, Edit3, Check, X, ChevronDown, ChevronRight, MessageSquare, Sparkles } from 'lucide-react';
import { useAnnotationStore, useSelectionStore, useSettingsStore, useDocumentStore, useUIStore } from '@/stores';
import { buildSystemMessage } from '@/lib/context';
import { streamChat } from '@/lib/llm';
import type { Annotation, SelectionInfo } from '@/types';

interface InlineAnnotationProps {
  annotation: Annotation;
  documentId: string;
}

export function InlineAnnotation({ annotation, documentId }: InlineAnnotationProps) {
  const { updateAnnotation, removeAnnotation, activeAnnotationId, setActiveAnnotation } = useAnnotationStore();
  const { setSelection } = useSelectionStore();
  const [editing, setEditing] = useState(false);
  const [editComment, setEditComment] = useState(annotation.comment);
  const [collapsed, setCollapsed] = useState(true);
  const [askingInline, setAskingInline] = useState(false);
  const [inlineQuestion, setInlineQuestion] = useState('');
  const [inlineAnswer, setInlineAnswer] = useState('');
  const [inlineStreaming, setInlineStreaming] = useState(false);
  const [bodyHeight, setBodyHeight] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const resizeStartYRef = useRef(0);
  const resizeStartHeightRef = useRef(0);
  const isActive = activeAnnotationId === annotation.id;

  const MIN_BODY_HEIGHT = 60;
  const MAX_BODY_HEIGHT = 560;

  const scrollBodyToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (!bodyRef.current) return;
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    });
  }, []);

  // Auto-expand and scroll into view when activated externally (e.g. clicking highlight)
  useEffect(() => {
    if (isActive) {
      setCollapsed(false);
      // Scroll the annotation block into view
      requestAnimationFrame(() => {
        rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  }, [isActive]);

  // Determine header title: prefer user question (from comment "Q: ..."), otherwise show selected text
  const headerTitle = annotation.comment?.startsWith('Q: ')
    ? annotation.comment.slice(3)
    : `「${annotation.selectedText}」`;

  const handleSave = () => {
    updateAnnotation(annotation.id, { comment: editComment });
    setEditing(false);
  };

  const handleCancel = () => {
    setEditComment(annotation.comment);
    setEditing(false);
  };

  // Handle text selection inside the annotation body for Q&A
  const handleBodyMouseUp = useCallback(() => {
    requestAnimationFrame(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;
      const text = sel.toString().trim();
      if (!text || !bodyRef.current?.contains(sel.getRangeAt(0).commonAncestorContainer)) return;

      const rect = sel.getRangeAt(0).getBoundingClientRect();
      const info: SelectionInfo = {
        text,
        contextBefore: '',
        contextAfter: '',
        rect,
        paragraphIndex: 0,
        startOffset: 0,
        endOffset: 0,
      };
      setSelection(info);
    });
  }, [setSelection]);

  // Inline ask: send a question about this annotation's content directly
  const handleInlineAsk = async () => {
    if (!inlineQuestion.trim() || inlineStreaming) return;
    const provider = useSettingsStore.getState().getActiveProvider();
    if (!provider?.apiKey) {
      useUIStore.getState().setShowApiKeyAlert(true);
      return;
    }

    const doc = useDocumentStore.getState().activeDocument;
    const allAnnotations = useAnnotationStore.getState().annotations.filter(a => a.documentId === documentId);

    const messages = [
      {
        role: 'system' as const,
        content: doc ? buildSystemMessage(doc.content || doc.extractedText || '', allAnnotations) : '你是一个学术阅读助手。',
      },
      {
        role: 'user' as const,
        content: `关于以下批注内容：\n\n原文: "${annotation.selectedText}"\n${annotation.llmResponse ? `已有AI批注: ${annotation.llmResponse}\n` : ''}\n我的问题: ${inlineQuestion}`,
      },
    ];

    setInlineStreaming(true);
    setInlineAnswer('');
    setCollapsed(false);
    setActiveAnnotation(annotation.id);
    scrollBodyToBottom();

    const controller = new AbortController();
    let fullContent = '';
    await streamChat(
      provider,
      messages,
      {
        onToken: (token) => {
          fullContent += token;
          setInlineAnswer(fullContent);
          scrollBodyToBottom();
        },
        onDone: () => {
          setInlineStreaming(false);
          // Append to annotation's llmResponse
          const separator = annotation.llmResponse ? '\n\n---\n\n' : '';
          const followUp = `**Q: ${inlineQuestion}**\n\n${fullContent}`;
          updateAnnotation(annotation.id, {
            llmResponse: (annotation.llmResponse || '') + separator + followUp,
          });
          setInlineQuestion('');
          setInlineAnswer('');
          setAskingInline(false);
          scrollBodyToBottom();
        },
        onError: (error) => {
          setInlineAnswer(fullContent + `\n\n⚠️ 错误: ${error.message}`);
          setInlineStreaming(false);
          scrollBodyToBottom();
        },
      },
      controller.signal,
    );
  };

  useEffect(() => {
    if (collapsed) return;
    if (!inlineStreaming && !inlineAnswer && !annotation.llmResponse) return;
    scrollBodyToBottom();
  }, [annotation.llmResponse, inlineAnswer, inlineStreaming, collapsed, scrollBodyToBottom]);

  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientY - resizeStartYRef.current;
      const nextHeight = resizeStartHeightRef.current + delta;
      const maxAllowed = Math.min(MAX_BODY_HEIGHT, Math.floor(window.innerHeight * 0.7));
      setBodyHeight(Math.max(MIN_BODY_HEIGHT, Math.min(maxAllowed, nextHeight)));
    };

    const handleMouseUp = () => {
      setResizing(false);
      window.document.body.style.cursor = '';
      window.document.body.style.userSelect = '';
    };

    window.document.addEventListener('mousemove', handleMouseMove);
    window.document.addEventListener('mouseup', handleMouseUp);
    window.document.body.style.cursor = 'ns-resize';
    window.document.body.style.userSelect = 'none';

    return () => {
      window.document.removeEventListener('mousemove', handleMouseMove);
      window.document.removeEventListener('mouseup', handleMouseUp);
      window.document.body.style.cursor = '';
      window.document.body.style.userSelect = '';
    };
  }, [resizing]);

  const handleResizeStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    resizeStartYRef.current = e.clientY;
    resizeStartHeightRef.current = bodyRef.current?.offsetHeight || bodyHeight || 200;
    setCollapsed(false);
    setResizing(true);
  }, [bodyHeight]);

  return (
    <div
      ref={rootRef}
      className={`inline-annotation ${isActive ? 'ring-2 ring-[var(--color-primary)]/40' : ''}`}
      data-annotation-block={annotation.id}
    >
      {/* Header - always visible, click to expand/collapse */}
      <div
        className="inline-annotation-header cursor-pointer select-none"
        onClick={() => {
          setCollapsed(!collapsed);
          setActiveAnnotation(isActive ? null : annotation.id);
        }}
      >
        <span className="flex items-center gap-1.5 flex-1 min-w-0">
          {collapsed ? <ChevronRight size={10} className="flex-shrink-0" /> : <ChevronDown size={10} className="flex-shrink-0" />}
          <MessageSquare size={10} style={{ color: 'var(--color-primary)' }} className="flex-shrink-0" />
          <span className="truncate" title={headerTitle}>
            {headerTitle.length > 80 ? headerTitle.slice(0, 80) + '...' : headerTitle}
          </span>
        </span>
        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => { setEditing(true); setEditComment(annotation.comment); setCollapsed(false); }}
            className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5"
            title="编辑笔记"
          >
            <Edit3 size={10} />
          </button>
          <button
            onClick={() => removeAnnotation(annotation.id)}
            className="p-0.5 rounded hover:bg-red-500/10 text-red-500"
            title="删除"
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>

      {/* Body - expandable, scrollable, supports text selection */}
      {!collapsed && (
        <>
          <div
            ref={bodyRef}
            className="inline-annotation-body"
            style={
              bodyHeight !== null
                ? { height: `${bodyHeight}px`, maxHeight: `${MAX_BODY_HEIGHT}px` }
                : { maxHeight: `${MAX_BODY_HEIGHT}px` }
            }
            onMouseUp={handleBodyMouseUp}
          >
            {/* User comment section */}
            {editing ? (
              <div className="mb-2">
                <textarea
                  value={editComment}
                  onChange={(e) => setEditComment(e.target.value)}
                  className="mac-input"
                  style={{ minHeight: 60, resize: 'vertical', fontSize: 12 }}
                  placeholder="写下你的笔记..."
                  onMouseUp={(e) => e.stopPropagation()}
                />
                <div className="flex gap-1 mt-1.5">
                  <button onClick={handleSave} className="mac-btn mac-btn-primary" style={{ padding: '3px 10px' }}>
                    <Check size={11} /> 保存
                  </button>
                  <button onClick={handleCancel} className="mac-btn" style={{ padding: '3px 10px' }}>
                    <X size={11} /> 取消
                  </button>
                </div>
              </div>
            ) : (
              annotation.comment && (
                <div className="mb-2 text-xs px-1 py-0.5 rounded" style={{ color: 'var(--color-text)', background: 'var(--color-primary-light)' }}>
                  📝 {annotation.comment}
                </div>
              )
            )}

            {/* LLM response - rendered as scrollable markdown */}
            {annotation.llmResponse && (
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {annotation.llmResponse}
                </ReactMarkdown>
              </div>
            )}

            {/* Inline streaming answer */}
            {inlineAnswer && (
              <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
                <div className={`markdown-body ${inlineStreaming ? 'streaming-cursor' : ''}`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {inlineAnswer}
                  </ReactMarkdown>
                </div>
              </div>
            )}

            {/* Action bar: add note / ask follow-up */}
            <div className="flex items-center gap-1 mt-2 pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
              {!annotation.comment && !editing && (
                <button
                  onClick={() => setEditing(true)}
                  className="mac-btn"
                  style={{ fontSize: 10, padding: '2px 8px' }}
                >
                  <Edit3 size={9} /> 添加笔记
                </button>
              )}
              <button
                onClick={() => setAskingInline(!askingInline)}
                className="mac-btn"
                style={{ fontSize: 10, padding: '2px 8px' }}
              >
                <Sparkles size={9} /> 追问
              </button>
            </div>

            {/* Inline question input */}
            {askingInline && (
              <div className="flex items-center gap-1.5 mt-2" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  placeholder="对这条批注追问..."
                  value={inlineQuestion}
                  onChange={(e) => setInlineQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleInlineAsk(); }
                    if (e.key === 'Escape') setAskingInline(false);
                  }}
                  onMouseUp={(e) => e.stopPropagation()}
                  className="mac-input"
                  style={{ fontSize: 11 }}
                />
                <button
                  onClick={handleInlineAsk}
                  disabled={!inlineQuestion.trim() || inlineStreaming}
                  className="mac-btn mac-btn-primary disabled:opacity-30"
                  style={{ padding: '4px 8px', fontSize: 10 }}
                >
                  发送
                </button>
              </div>
            )}

            {/* Empty state */}
            {!annotation.comment && !annotation.llmResponse && !editing && (
              <div className="text-center py-2 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                点击「添加笔记」或「追问」开始
              </div>
            )}
          </div>
          <div
            className="inline-annotation-resizer"
            onMouseDown={handleResizeStart}
            title="拖拽调整批注高度"
          />
        </>
      )}
    </div>
  );
}
