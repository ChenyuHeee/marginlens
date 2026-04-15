import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Eye, Edit3, Download, Save, GitBranch, Maximize2, Minimize2, Share2, Copy, Check, X } from 'lucide-react';
import { MarkdownViewer } from './MarkdownViewer';
import { LiveMarkdownEditor } from './LiveMarkdownEditor';
import { SyncDialog } from './SyncDialog';
import { useDocumentStore, useAnnotationStore, useGitHubSyncStore, useUIStore } from '@/stores';
import { serializeAnnotationsToMarkdown } from '@/lib/annotations';
import { createShare, buildShareUrl, type ShareMode, type AccessMode } from '@/lib/share';
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
  const [shareOpen, setShareOpen] = useState(false);
  const [shareMode, setShareMode] = useState<ShareMode>('readonly');
  const [accessMode, setAccessMode] = useState<AccessMode>('public');
  const [allowedEmails, setAllowedEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [shareGenerating, setShareGenerating] = useState(false);
  const [shareResult, setShareResult] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);

  const openShareDialog = () => {
    setShareMode('readonly');
    setAccessMode('public');
    setAllowedEmails([]);
    setEmailInput('');
    setShareResult(null);
    setShareCopied(false);
    setShareOpen(true);
  };

  const addEmail = () => {
    const e = emailInput.trim().toLowerCase();
    if (e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && !allowedEmails.includes(e)) {
      setAllowedEmails((prev) => [...prev, e]);
    }
    setEmailInput('');
    emailInputRef.current?.focus();
  };

  const handleGenerateShare = async () => {
    setShareGenerating(true);
    try {
      const doc = useDocumentStore.getState().activeDocument;
      if (!doc) return;
      const anns = await getAnnotationsByDocument(documentId);
      const token = await createShare(doc.title, editContent, anns, {
        shareMode,
        accessMode,
        allowedEmails,
      });
      setShareResult(buildShareUrl(token));
    } catch (err) {
      alert('分享失败：' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setShareGenerating(false);
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
            onClick={openShareDialog}
            className="mac-btn flex items-center gap-1"
            style={{ fontSize: 11, padding: '3px 10px' }}
            title="分享文档"
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
      {shareOpen && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShareOpen(false)}
        >
          <div
            className="rounded-2xl p-6 w-[420px] space-y-5"
            style={{
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-border-strong)',
              boxShadow: 'var(--shadow-xl)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Share2 size={16} style={{ color: 'var(--color-primary)' }} />
                <span className="font-semibold text-[15px]" style={{ color: 'var(--color-text)' }}>分享文档</span>
              </div>
              <button onClick={() => setShareOpen(false)} style={{ color: 'var(--color-text-tertiary)' }}>
                <X size={16} />
              </button>
            </div>

            {shareResult ? (
              /* ── Result step: show URL ── */
              <div className="space-y-4">
                <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                  链接已生成，{accessMode === 'public' ? '任何人' : '指定用户'}可通过此链接
                  {shareMode === 'import' ? '查看并导入' : '查看'}文档。
                </p>
                <div
                  className="flex items-center gap-2 rounded-lg px-3 py-2"
                  style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
                >
                  <span className="flex-1 text-[11px] truncate font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                    {shareResult}
                  </span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(shareResult); setShareCopied(true); setTimeout(() => setShareCopied(false), 2000); }}
                    style={{ color: shareCopied ? 'var(--color-success, #22c55e)' : 'var(--color-primary)', flexShrink: 0 }}
                  >
                    {shareCopied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { navigator.clipboard.writeText(shareResult); setShareCopied(true); setTimeout(() => setShareCopied(false), 2000); }}
                    className="flex-1 mac-btn justify-center gap-1.5 text-[12px] py-1.5"
                    style={{ background: 'var(--color-primary)', color: '#fff', border: 'none' }}
                  >
                    {shareCopied ? <Check size={12} /> : <Copy size={12} />}
                    {shareCopied ? '已复制' : '复制链接'}
                  </button>
                  <button
                    onClick={() => setShareOpen(false)}
                    className="mac-btn text-[12px] py-1.5 px-4"
                  >
                    完成
                  </button>
                </div>
              </div>
            ) : (
              /* ── Config step ── */
              <>
                {/* Step 1: Share mode */}
                <div className="space-y-2">
                  <p className="text-[11px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>分享模式</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { value: 'readonly', emoji: '👁', label: '只读', desc: '对方只能浏览，无法导入' },
                      { value: 'import', emoji: '📥', label: '可导入', desc: '对方可一键导入到自己的文档库' },
                    ] as const).map(({ value, emoji, label, desc }) => (
                      <button
                        key={value}
                        onClick={() => setShareMode(value)}
                        className="text-left p-3 rounded-xl transition-all"
                        style={{
                          border: shareMode === value ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                          background: shareMode === value ? 'var(--color-primary-subtle)' : 'var(--color-bg)',
                        }}
                      >
                        <div className="text-[18px] mb-1">{emoji}</div>
                        <div className="text-[12px] font-semibold" style={{ color: 'var(--color-text)' }}>{label}</div>
                        <div className="text-[10px] mt-0.5 leading-tight" style={{ color: 'var(--color-text-tertiary)' }}>{desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Step 2: Access control */}
                <div className="space-y-2">
                  <p className="text-[11px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>访问权限</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { value: 'public', emoji: '🌐', label: '所有人', desc: '包括未登录的访客' },
                      { value: 'restricted', emoji: '🔒', label: '指定用户', desc: '仅限你填写的邮箱用户' },
                    ] as const).map(({ value, emoji, label, desc }) => (
                      <button
                        key={value}
                        onClick={() => setAccessMode(value)}
                        className="text-left p-3 rounded-xl transition-all"
                        style={{
                          border: accessMode === value ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                          background: accessMode === value ? 'var(--color-primary-subtle)' : 'var(--color-bg)',
                        }}
                      >
                        <div className="text-[18px] mb-1">{emoji}</div>
                        <div className="text-[12px] font-semibold" style={{ color: 'var(--color-text)' }}>{label}</div>
                        <div className="text-[10px] mt-0.5 leading-tight" style={{ color: 'var(--color-text-tertiary)' }}>{desc}</div>
                      </button>
                    ))}
                  </div>

                  {/* Email input for restricted */}
                  {accessMode === 'restricted' && (
                    <div className="space-y-2 pt-1">
                      <div className="flex gap-2">
                        <input
                          ref={emailInputRef}
                          value={emailInput}
                          onChange={(e) => setEmailInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addEmail(); } }}
                          placeholder="输入邮箱后按回车添加…"
                          className="mac-input flex-1 text-[12px]"
                          style={{ height: 32 }}
                        />
                        <button
                          onClick={addEmail}
                          className="mac-btn text-[12px] px-3"
                          style={{ height: 32 }}
                        >
                          添加
                        </button>
                      </div>
                      {allowedEmails.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {allowedEmails.map((email) => (
                            <span
                              key={email}
                              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px]"
                              style={{ background: 'var(--color-primary-subtle)', color: 'var(--color-primary)', border: '1px solid var(--color-primary-light)' }}
                            >
                              {email}
                              <button onClick={() => setAllowedEmails((prev) => prev.filter((e) => e !== email))}>
                                <X size={10} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      {allowedEmails.length === 0 && (
                        <p className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                          至少添加一个邮箱
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Generate button */}
                <button
                  onClick={handleGenerateShare}
                  disabled={shareGenerating || (accessMode === 'restricted' && allowedEmails.length === 0)}
                  className="w-full mac-btn justify-center text-[13px] py-2"
                  style={{ background: 'var(--color-primary)', color: '#fff', border: 'none', opacity: (shareGenerating || (accessMode === 'restricted' && allowedEmails.length === 0)) ? 0.5 : 1 }}
                >
                  {shareGenerating ? '生成中…' : '生成分享链接'}
                </button>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
