import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Eye, Edit3, Download, Save, GitBranch, Maximize2, Minimize2, Share2, Copy, Check } from 'lucide-react';
import { MarkdownViewer } from './MarkdownViewer';
import { LiveMarkdownEditor } from './LiveMarkdownEditor';
import { SyncDialog } from './SyncDialog';
import { useDocumentStore, useAnnotationStore, useGitHubSyncStore, useUIStore } from '@/stores';
import { serializeAnnotationsToMarkdown } from '@/lib/annotations';
import { createShare, buildShareUrl } from '@/lib/share';
import { getAnnotationsByDocument } from '@/lib/db';

interface MarkdownPanelProps {
  content: string;
  documentId: string;
}

const NEW_NOTE_CONTENT = '# 新笔记\n\n在此开始编写...\n';

export function MarkdownPanel({ content, documentId }: MarkdownPanelProps) {
  const [mode, setMode] = useState<'preview' | 'edit'>(
    content === NEW_NOTE_CONTENT ? 'edit' : 'preview'
  );
  const [editContent, setEditContent] = useState(content);
  const { updateDocumentContent } = useDocumentStore();
  const { annotations } = useAnnotationStore();
  const [dirty, setDirty] = useState(false);

  // Sync editContent when content changes externally (e.g. switching documents)
  useEffect(() => {
    setEditContent(content);
    setDirty(false);
    setMode(content === NEW_NOTE_CONTENT ? 'edit' : 'preview');
  }, [content, documentId]);

  const handleSave = useCallback(async () => {
    await updateDocumentContent(documentId, editContent);
    setDirty(false);
  }, [documentId, editContent, updateDocumentContent]);

  const handleExport = () => {
    const docAnnotations = annotations.filter((a) => a.documentId === documentId);
    const contentWithAnnotations = serializeAnnotationsToMarkdown(editContent, docAnnotations);

    const doc = useDocumentStore.getState().activeDocument;
    const filename = (doc?.title || 'document') + '.md';
    const blob = new Blob([contentWithAnnotations], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // GitHub sync
  const { config: ghConfig } = useGitHubSyncStore();
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const { focusMode, toggleFocusMode } = useUIStore();

  // Share
  const [shareLoading, setShareLoading] = useState(false);
  const [shareDialog, setShareDialog] = useState<{ url: string } | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  const handleShare = async () => {
    setShareLoading(true);
    try {
      const doc = useDocumentStore.getState().activeDocument;
      if (!doc) return;
      const anns = await getAnnotationsByDocument(documentId);
      const token = await createShare(doc.title, editContent, anns);
      setShareDialog({ url: buildShareUrl(token) });
    } catch (err) {
      alert('分享失败：' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setShareLoading(false);
    }
  };

  // Keyboard shortcut: Cmd/Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (mode === 'edit' && dirty) {
          handleSave();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mode, dirty, handleSave]);

  return (
    <div className="relative h-full flex flex-col">
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-4 h-10 flex-shrink-0"
        style={{
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-bg-secondary)',
        }}
      >
        <div className="flex items-center gap-1">
          <button
            onClick={async () => {
              if (mode === 'edit' && dirty) await handleSave();
              setMode('preview');
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
              mode === 'preview' ? '' : ''
            }`}
            style={{
              background: mode === 'preview' ? 'var(--color-primary-light)' : 'transparent',
              color: mode === 'preview' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            }}
            onMouseEnter={(e) => { if (mode !== 'preview') e.currentTarget.style.background = 'var(--color-card-hover)'; }}
            onMouseLeave={(e) => { if (mode !== 'preview') e.currentTarget.style.background = 'transparent'; }}
          >
            <Eye size={12} />
            预览
          </button>
          <button
            onClick={() => setMode('edit')}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors"
            style={{
              background: mode === 'edit' ? 'var(--color-primary-light)' : 'transparent',
              color: mode === 'edit' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            }}
            onMouseEnter={(e) => { if (mode !== 'edit') e.currentTarget.style.background = 'var(--color-card-hover)'; }}
            onMouseLeave={(e) => { if (mode !== 'edit') e.currentTarget.style.background = 'transparent'; }}
          >
            <Edit3 size={12} />
            编辑
            {dirty && <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />}
          </button>
        </div>

        <div className="flex items-center gap-1">
          {mode === 'edit' && dirty && (
            <button
              onClick={handleSave}
              className="mac-btn flex items-center gap-1"
              style={{ fontSize: 11, padding: '3px 10px' }}
            >
              <Save size={11} />
              保存
            </button>
          )}
          <button
            onClick={handleExport}
            className="mac-btn flex items-center gap-1"
            style={{ fontSize: 11, padding: '3px 10px' }}
            title="导出 Markdown（含批注）"
          >
            <Download size={11} />
            导出
          </button>
          {ghConfig && (
            <button
              onClick={() => setSyncDialogOpen(true)}
              className="mac-btn flex items-center gap-1"
              style={{ fontSize: 11, padding: '3px 10px' }}
              title="推送到 GitHub"
            >
              <GitBranch size={11} />
              推送
            </button>
          )}
          <button
            onClick={handleShare}
            className="mac-btn flex items-center gap-1"
            style={{ fontSize: 11, padding: '3px 10px' }}
            title="生成分享链接"
            disabled={shareLoading}
          >
            <Share2 size={11} />
            分享
          </button>
          <button
            onClick={toggleFocusMode}
            className="mac-btn flex items-center gap-1"
            style={{ fontSize: 11, padding: '3px 8px' }}
            title={focusMode ? '退出专注模式 (Esc)' : '专注模式'}
          >
            {focusMode ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0">
        {mode === 'preview' ? (
          <MarkdownViewer content={content} documentId={documentId} />
        ) : (
          <div className="h-full overflow-auto">
            <LiveMarkdownEditor
              content={editContent}
              documentId={documentId}
              onChange={(md) => {
                setEditContent(md);
                setDirty(true);
              }}
            />
          </div>
        )}
      </div>

      {/* GitHub Sync Dialog */}
      <SyncDialog
        open={syncDialogOpen}
        onClose={() => setSyncDialogOpen(false)}
        content={serializeAnnotationsToMarkdown(
          editContent,
          annotations.filter((a) => a.documentId === documentId),
        )}
        title={useDocumentStore.getState().activeDocument?.title || 'document'}
      />

      {/* Share dialog */}
      {shareDialog && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}
          onClick={() => { setShareDialog(null); setShareCopied(false); }}
        >
          <div
            className="rounded-2xl p-6 w-[380px]"
            style={{
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-border-strong)',
              boxShadow: 'var(--shadow-xl)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-4">
              <Share2 size={16} style={{ color: 'var(--color-primary)' }} />
              <span className="font-semibold text-[15px]" style={{ color: 'var(--color-text)' }}>分享文档</span>
            </div>
            <div className="text-[12px] mb-3" style={{ color: 'var(--color-text-secondary)' }}>
              已生成只读分享链接，任何人可通过该链接查看文档及批注。
            </div>
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-2 mb-4"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
            >
              <span className="flex-1 text-[11px] truncate font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                {shareDialog.url}
              </span>
              <button
                onClick={() => { navigator.clipboard.writeText(shareDialog.url); setShareCopied(true); setTimeout(() => setShareCopied(false), 2000); }}
                className="flex-shrink-0 p-1.5 rounded-md"
                style={{ color: shareCopied ? 'var(--color-success, #22c55e)' : 'var(--color-primary)' }}
              >
                {shareCopied ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { navigator.clipboard.writeText(shareDialog.url); setShareCopied(true); setTimeout(() => setShareCopied(false), 2000); }}
                className="flex-1 mac-btn justify-center gap-1.5 text-[12px] py-1.5"
                style={{ background: 'var(--color-primary)', color: '#fff', border: 'none' }}
              >
                {shareCopied ? <Check size={12} /> : <Copy size={12} />}
                {shareCopied ? '已复制' : '复制链接'}
              </button>
              <button
                onClick={() => { setShareDialog(null); setShareCopied(false); }}
                className="mac-btn text-[12px] py-1.5 px-4"
              >
                关闭
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
