import { useState, useEffect, useCallback } from 'react';
import { Eye, Edit3, Download, Save, GitBranch, Loader2, Check } from 'lucide-react';
import { MarkdownViewer } from './MarkdownViewer';
import { LiveMarkdownEditor } from './LiveMarkdownEditor';
import { useDocumentStore, useAnnotationStore, useGitHubSyncStore } from '@/stores';
import { serializeAnnotationsToMarkdown } from '@/lib/annotations';
import { pushFile, toFilename } from '@/lib/github';

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
  const { config: ghConfig, syncing, setSyncing, setLastSyncedAt } = useGitHubSyncStore();
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSync = async () => {
    if (!ghConfig || syncing) return;
    setSyncing(true);
    setSyncStatus('idle');
    try {
      const doc = useDocumentStore.getState().activeDocument;
      const title = doc?.title || 'document';
      const filename = toFilename(title);
      const docAnnotations = annotations.filter((a) => a.documentId === documentId);
      const contentToSync = serializeAnnotationsToMarkdown(editContent, docAnnotations);
      await pushFile(ghConfig, filename, contentToSync, `Update ${title} via MarginLens`);
      setSyncStatus('success');
      setLastSyncedAt(Date.now());
      setTimeout(() => setSyncStatus('idle'), 2500);
    } catch (e) {
      setSyncStatus('error');
      console.error('GitHub sync failed:', e);
      setTimeout(() => setSyncStatus('idle'), 3000);
    } finally {
      setSyncing(false);
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
              onClick={handleSync}
              disabled={syncing}
              className="mac-btn flex items-center gap-1"
              style={{
                fontSize: 11,
                padding: '3px 10px',
                color: syncStatus === 'success' ? 'var(--color-success, #34c759)'
                  : syncStatus === 'error' ? 'var(--color-danger)'
                  : undefined,
              }}
              title={`同步到 ${ghConfig.owner}/${ghConfig.repo}/${ghConfig.path}`}
            >
              {syncing ? <Loader2 size={11} className="animate-spin" />
                : syncStatus === 'success' ? <Check size={11} />
                : <GitBranch size={11} />}
              {syncing ? '同步中...' : syncStatus === 'success' ? '已同步' : syncStatus === 'error' ? '失败' : '同步'}
            </button>
          )}
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
    </div>
  );
}
