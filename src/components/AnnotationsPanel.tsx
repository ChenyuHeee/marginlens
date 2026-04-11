import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Trash2, Edit3, Check, X, ChevronDown, ChevronRight, BookOpen } from 'lucide-react';
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
      <div className="h-full flex flex-col items-center justify-center px-8 text-center animate-fade-in">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: 'var(--color-bg-secondary)' }}
        >
          <BookOpen size={20} style={{ color: 'var(--color-text-tertiary)' }} />
        </div>
        <p className="text-[13px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>暂无批注</p>
        <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-tertiary)' }}>选中文本 → 点击"批注"创建</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-3 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
          {docAnnotations.length} 条批注
        </span>
      </div>
      <div className="py-1">
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

  useEffect(() => {
    if (isActive) {
      setExpanded(true);
      setTimeout(() => {
        cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    }
  }, [isActive]);

  const handleSave = () => {
    onUpdate({ comment: editComment });
    setEditing(false);
  };

  return (
    <div
      ref={cardRef}
      className="mx-2 my-1 rounded-xl cursor-pointer transition-all"
      style={{
        background: isActive ? 'var(--color-primary-light)' : 'var(--color-bg)',
        border: isActive ? '1px solid var(--color-annotation-border)' : '1px solid transparent',
      }}
      onClick={() => {
        onActivate();
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
      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = isActive ? 'var(--color-primary-light)' : 'var(--color-bg)'; }}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-start gap-2.5">
          <div
            className="w-1 self-stretch rounded-full flex-shrink-0 mt-0.5"
            style={{ background: isActive ? 'var(--color-primary)' : 'var(--color-border-strong)', minHeight: 16 }}
          />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium leading-snug" style={{ color: 'var(--color-text)' }}>
              「{annotation.selectedText}」
            </p>

            {editing ? (
              <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                <textarea
                  value={editComment}
                  onChange={(e) => setEditComment(e.target.value)}
                  className="mac-input"
                  style={{ fontSize: 11, minHeight: 50, resize: 'vertical' }}
                  placeholder="写下笔记..."
                  autoFocus
                />
                <div className="flex gap-1.5 mt-1.5">
                  <button onClick={handleSave} className="mac-btn mac-btn-primary" style={{ padding: '3px 10px', fontSize: 10.5 }}>
                    <Check size={10} /> 保存
                  </button>
                  <button onClick={() => { setEditComment(annotation.comment); setEditing(false); }} className="mac-btn" style={{ padding: '3px 10px', fontSize: 10.5 }}>
                    <X size={10} /> 取消
                  </button>
                </div>
              </div>
            ) : (
              annotation.comment && (
                <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{annotation.comment}</p>
              )
            )}

            {annotation.llmResponse && (
              <div className="mt-2">
                <button
                  onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                  className="flex items-center gap-1 text-[10.5px] font-medium transition-colors"
                  style={{ color: 'var(--color-primary)' }}
                >
                  {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                  AI 回复
                </button>
                {expanded && (
                  <div
                    className="mt-1.5 p-2.5 rounded-lg text-[11px] markdown-body max-w-none"
                    style={{ background: 'var(--color-bg-secondary)', fontSize: 11, border: '1px solid var(--color-border)' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{annotation.llmResponse}</ReactMarkdown>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={(e) => { e.stopPropagation(); setEditing(true); setEditComment(annotation.comment); }}
                className="p-0.5 rounded opacity-30 hover:opacity-100 transition-opacity"
                title="编辑"
              >
                <Edit3 size={10.5} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="p-0.5 rounded opacity-30 hover:opacity-100 transition-opacity"
                style={{ color: 'var(--color-danger)' }}
                title="删除"
              >
                <Trash2 size={10.5} />
              </button>
              <span className="text-[9px] ml-auto" style={{ color: 'var(--color-text-tertiary)' }}>
                {new Date(annotation.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
