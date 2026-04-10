import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Trash2, Edit3, Check, X, ChevronDown, ChevronRight } from 'lucide-react';
import { useAnnotationStore, useDocumentStore } from '@/stores';

export function AnnotationsPanel() {
  const { annotations, activeAnnotationId, setActiveAnnotation, updateAnnotation, removeAnnotation } = useAnnotationStore();
  const { activeDocument } = useDocumentStore();

  if (!activeDocument) {
    return (
      <div className="h-full flex items-center justify-center text-[13px]" style={{ color: 'var(--color-text-tertiary)' }}>
        请先打开一个文档
      </div>
    );
  }

  const docAnnotations = annotations.filter((a) => a.documentId === activeDocument.id);

  if (docAnnotations.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-[12px] px-8 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center mb-2.5" style={{ background: 'var(--color-bg-secondary)' }}>
          💬
        </div>
        <p>还没有批注</p>
        <p className="text-[11px] mt-0.5">选中左侧文本 → 点击"批注"</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <span className="text-[12px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          {docAnnotations.length} 条批注
        </span>
      </div>
      <div>
        {docAnnotations.map((ann) => (
          <AnnotationCard
            key={ann.id}
            annotation={ann}
            isActive={ann.id === activeAnnotationId}
            onActivate={() => setActiveAnnotation(ann.id === activeAnnotationId ? null : ann.id)}
            onUpdate={(updates) => updateAnnotation(ann.id, updates)}
            onRemove={() => removeAnnotation(ann.id)}
          />
        ))}
      </div>
    </div>
  );
}

interface AnnotationCardProps {
  annotation: import('@/types').Annotation;
  isActive: boolean;
  onActivate: () => void;
  onUpdate: (updates: Partial<import('@/types').Annotation>) => void;
  onRemove: () => void;
}

function AnnotationCard({ annotation, isActive, onActivate, onUpdate, onRemove }: AnnotationCardProps) {
  const [editing, setEditing] = useState(false);
  const [editComment, setEditComment] = useState(annotation.comment);
  const [expanded, setExpanded] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Auto-scroll and auto-expand when activated externally (e.g. from PDF highlight click)
  useEffect(() => {
    if (isActive) {
      setExpanded(true);
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isActive]);

  const handleSave = () => {
    onUpdate({ comment: editComment });
    setEditing(false);
  };

  return (
    <div
      ref={cardRef}
      className="px-3 py-2.5 cursor-pointer transition-colors"
      style={{
        borderBottom: '1px solid var(--color-border)',
        background: isActive ? 'var(--color-primary-light)' : 'transparent',
      }}
      onClick={() => {
        onActivate();
        // Scroll to the highlighted text in the viewer
        const container = document.getElementById('markdown-scroll-container');
        if (!container) return;
        const highlight = container.querySelector(`.annotation-highlight[data-annotation-id="${annotation.id}"]`);
        if (highlight) {
          highlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
          highlight.classList.add('active');
          setTimeout(() => highlight.classList.remove('active'), 2000);
        }
      }}
      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--color-card-hover)'; }}
      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
    >
      <div className="flex items-start gap-2">
        <div className="w-0.5 self-stretch rounded-full flex-shrink-0" style={{ background: 'var(--color-primary)' }} />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium line-clamp-2" style={{ color: 'var(--color-text)' }}>
            「{annotation.selectedText}」
          </p>

          {editing ? (
            <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
              <textarea
                value={editComment}
                onChange={(e) => setEditComment(e.target.value)}
                className="mac-input"
                style={{ fontSize: 11, minHeight: 50, resize: 'vertical' }}
                placeholder="写下笔记..."
                autoFocus
              />
              <div className="flex gap-1 mt-1">
                <button onClick={handleSave} className="mac-btn mac-btn-primary" style={{ padding: '2px 8px', fontSize: 10 }}>
                  <Check size={10} /> 保存
                </button>
                <button onClick={() => { setEditComment(annotation.comment); setEditing(false); }} className="mac-btn" style={{ padding: '2px 8px', fontSize: 10 }}>
                  <X size={10} /> 取消
                </button>
              </div>
            </div>
          ) : (
            annotation.comment && (
              <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>{annotation.comment}</p>
            )
          )}

          {annotation.llmResponse && (
            <div className="mt-1.5">
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                className="flex items-center gap-1 text-[10px]"
                style={{ color: 'var(--color-primary)' }}
              >
                {expanded ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
                AI 回复
              </button>
              {expanded && (
                <div
                  className="mt-1 p-2 rounded-md text-[11px] markdown-body max-w-none"
                  style={{ background: 'var(--color-bg-secondary)', fontSize: 11 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{annotation.llmResponse}</ReactMarkdown>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-1.5 mt-1.5">
            <button
              onClick={(e) => { e.stopPropagation(); setEditing(true); setEditComment(annotation.comment); }}
              className="p-0.5 rounded opacity-40 hover:opacity-100 transition-opacity"
              title="编辑"
            >
              <Edit3 size={10} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="p-0.5 rounded opacity-40 hover:opacity-100 transition-opacity"
              style={{ color: '#ff3b30' }}
              title="删除"
            >
              <Trash2 size={10} />
            </button>
            <span className="text-[9px] ml-auto" style={{ color: 'var(--color-text-tertiary)' }}>
              {new Date(annotation.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
