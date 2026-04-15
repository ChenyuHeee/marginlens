import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import { loadShare, type SharedDocument } from '@/lib/share';
import { useDocumentStore, useAnnotationStore } from '@/stores';
import faviconUrl from '/favicon.svg?url';

interface ShareViewProps {
  token: string;
}

export function ShareView({ token }: ShareViewProps) {
  const [doc, setDoc] = useState<SharedDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);

  useEffect(() => {
    loadShare(token)
      .then((d) => {
        if (d) setDoc(d);
        else setError('链接已失效、文档不存在，或你没有访问权限');
      })
      .catch(() => setError('加载失败，请稍后重试'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleImport = async () => {
    if (!doc) return;
    setImporting(true);
    try {
      const docId = await useDocumentStore.getState().addDocumentFromText(doc.title, doc.content);
      for (const ann of doc.annotations) {
        await useAnnotationStore.getState().addAnnotation({
          documentId: docId,
          selectedText: ann.selectedText,
          contextBefore: ann.contextBefore || '',
          contextAfter: ann.contextAfter || '',
          comment: ann.comment || '',
          llmResponse: ann.llmResponse || '',
          color: ann.color,
          positionHint: ann.positionHint,
        });
      }
      setImported(true);
    } catch {
      alert('导入失败，请稍后重试');
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center" style={{ color: 'var(--color-text-tertiary)' }}>
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin mx-auto mb-3" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
          <p className="text-[13px]">加载中…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center" style={{ color: 'var(--color-text-tertiary)' }}>
        <div className="text-center">
          <p className="text-[15px] font-medium mb-2" style={{ color: 'var(--color-text)' }}>{error}</p>
          <a href={window.location.pathname} className="text-[12px]" style={{ color: 'var(--color-primary)' }}>
            返回 MarginLens →
          </a>
        </div>
      </div>
    );
  }

  if (!doc) return null;

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--color-bg)' }}>
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-6 h-[52px] flex-shrink-0"
        style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-elevated)' }}
      >
        <div className="flex items-center gap-2.5">
          <img src={faviconUrl} alt="MarginLens" width={20} height={20} />
          <span className="text-[13px] font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
            {doc.title}
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)', fontWeight: 500 }}
          >
            {doc.share_mode === 'import' ? '共享 · 可导入' : '共享只读'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {doc.share_mode === 'import' && (
            imported ? (
              <span className="text-[12px] font-medium" style={{ color: 'var(--color-success, #22c55e)' }}>
                ✓ 已导入到文档库
              </span>
            ) : (
              <button
                onClick={handleImport}
                disabled={importing}
                className="mac-btn flex items-center gap-1.5 text-[12px] font-medium"
                style={{ padding: '5px 14px', background: 'var(--color-primary)', color: '#fff', border: 'none' }}
              >
                {importing ? (
                  <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                ) : '＋'}
                导入到我的文档库
              </button>
            )
          )}
          <a
            href={window.location.pathname}
            className="text-[11px] font-medium transition-opacity hover:opacity-70"
            style={{ color: 'var(--color-primary)' }}
          >
            打开 MarginLens →
          </a>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-8 py-8">
          {/* Annotations summary (if any) */}
          {doc.annotations.length > 0 && (
            <div
              className="mb-6 p-4 rounded-xl text-[12px]"
              style={{ background: 'var(--color-primary-subtle)', border: '1px solid var(--color-border)' }}
            >
              <p className="font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                📌 包含 {doc.annotations.length} 条批注
              </p>
              <p style={{ color: 'var(--color-text-tertiary)' }}>
                批注高亮与内容均包含在文档中
              </p>
            </div>
          )}

          {/* Annotated highlights rendered inline within markdown */}
          <div className="markdown-body prose prose-sm max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex, rehypeHighlight, rehypeRaw]}
            >
              {buildAnnotatedContent(doc.content, doc.annotations)}
            </ReactMarkdown>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        className="px-6 py-2 text-[10px] flex items-center justify-between flex-shrink-0"
        style={{ borderTop: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)' }}
      >
        <span>
          由 MarginLens 生成的共享文档{doc.author_name ? ` · 作者：${doc.author_name}` : ''}
        </span>
        <span>共享于 {new Date(doc.created_at).toLocaleDateString('zh-CN')}</span>
      </div>
    </div>
  );
}

/** Inline annotation content as blockquotes after each highlighted selection */
function buildAnnotatedContent(
  content: string,
  annotations: SharedDocument['annotations'],
): string {
  if (annotations.length === 0) return content;

  // Sort by position (last first) so insertions don't shift offsets
  const sorted = [...annotations]
    .map((ann) => ({ ann, idx: content.indexOf(ann.selectedText) }))
    .filter((a) => a.idx !== -1)
    .sort((a, b) => b.idx - a.idx);

  let result = content;
  for (const { ann, idx } of sorted) {
    const end = idx + ann.selectedText.length;
    const highlighted = `<mark style="background:${ann.color};border-radius:2px;padding:0 2px">${ann.selectedText}</mark>`;
    let note = '';
    if (ann.comment) note += `\n> 💬 ${ann.comment}`;
    if (ann.llmResponse) note += `\n>\n> 🤖 ${ann.llmResponse.replace(/\n/g, '\n> ')}`;
    result = result.slice(0, idx) + highlighted + result.slice(end) + note;
  }
  return result;
}
