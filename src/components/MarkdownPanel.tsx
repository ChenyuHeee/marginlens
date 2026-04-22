import { useState, useEffect, useCallback, useRef, createElement } from 'react';
import { createPortal } from 'react-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import { Eye, Edit3, Download, Save, GitBranch, Maximize2, Minimize2, Share2, Copy, Check, X, ChevronDown, FileText, FileType, Wand2 } from 'lucide-react';
import { MarkdownViewer } from './MarkdownViewer';
import { LiveMarkdownEditor } from './LiveMarkdownEditor';
import { SyncDialog } from './SyncDialog';
import { useDocumentStore, useAnnotationStore, useGitHubSyncStore, useUIStore, useSettingsStore } from '@/stores';
import { serializeAnnotationsToMarkdown } from '@/lib/annotations';
import { createShare, buildShareUrl, type ShareMode, type AccessMode } from '@/lib/share';
import { getAnnotationsByDocument } from '@/lib/db';

/** Extract the first markdown heading (# …) from content, null if none. */
function extractFirstHeading(md: string): string | null {
  const match = md.match(/^#{1,6}\s+(.+)$/m);
  if (!match) return null;
  // Strip inline markdown: bold (**x** / __x__), italic (*x* / _x_), inline code (`x`), strikethrough (~~x~~)
  const plain = match[1]
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_, a, b) => a ?? b)
    .replace(/\*(.+?)\*|_(.+?)_/g, (_, a, b) => a ?? b)
    .replace(/`(.+?)`/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .trim();
  return plain || null;
}

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
  const { updateDocumentContent, updateDocument, setLiveContent } = useDocumentStore();
  const { annotations } = useAnnotationStore();
  const { settings } = useSettingsStore();
  const [dirty, setDirty] = useState(false);

  // Reset state only when the document actually switches (not on every content prop update)
  const prevDocIdRef = useRef(documentId);
  useEffect(() => {
    if (prevDocIdRef.current === documentId) return;
    prevDocIdRef.current = documentId;
    setEditContent(content);
    setDirty(false);
    setMode(content === NEW_NOTE_CONTENT ? 'edit' : 'preview');
  }, [documentId, content]);

  const handleSave = useCallback(async () => {
    await updateDocumentContent(documentId, editContent);
    // Auto-rename: if the title is still the default "新笔记", use the first heading
    const currentTitle = useDocumentStore.getState().activeDocument?.title;
    if (currentTitle === '新笔记') {
      const heading = extractFirstHeading(editContent);
      if (heading) {
        await updateDocument(documentId, { title: heading });
      }
    }
    setDirty(false);
  }, [documentId, editContent, updateDocumentContent, updateDocument]);

  // Debounced autosave: persist to IndexedDB 1.5s after the user stops typing
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleAutosave = useCallback((md: string) => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(async () => {
      await updateDocumentContent(documentId, md);
      const currentTitle = useDocumentStore.getState().activeDocument?.title;
      if (currentTitle === '新笔记') {
        const heading = extractFirstHeading(md);
        if (heading) await updateDocument(documentId, { title: heading });
      }
      setDirty(false);
    }, 1500);
  }, [documentId, updateDocumentContent, updateDocument]);

  // Clear autosave timer on unmount or document switch
  useEffect(() => {
    return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current); };
  }, [documentId]);

  // Debounced setLiveContent: update Zustand (and all subscribers) at most
  // every 400ms while typing, not on every keystroke.
  const liveContentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleLiveContent = useCallback((md: string) => {
    if (liveContentTimerRef.current) clearTimeout(liveContentTimerRef.current);
    liveContentTimerRef.current = setTimeout(() => {
      setLiveContent(documentId, md);
    }, 400);
  }, [documentId, setLiveContent]);
  useEffect(() => {
    return () => { if (liveContentTimerRef.current) clearTimeout(liveContentTimerRef.current); };
  }, [documentId]);

  // Large-doc threshold: above this line count use plain textarea instead of
  // Milkdown / ProseMirror (which gets very slow for 50k+ word documents).
  const LARGE_DOC_LINES = 500;
  const isLargeDoc = editContent.split('\n').length > LARGE_DOC_LINES;

  // Export dropdown
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [exportMenuOpen]);

  const handleExportMarkdown = () => {
    setExportMenuOpen(false);
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

  const handleExportPDF = async () => {
    setExportMenuOpen(false);
    const storeDoc = useDocumentStore.getState().activeDocument;
    const title = storeDoc?.title || 'document';

    // Render full markdown to static HTML
    const mdElement = createElement(ReactMarkdown, {
      remarkPlugins: [remarkGfm, remarkMath],
      rehypePlugins: [rehypeKatex, rehypeHighlight, rehypeRaw],
      children: editContent,
    });
    const renderedHtml = renderToStaticMarkup(mdElement);

    // Collect page CSS (excluding rules that would clip/constrain layout)
    const cssTexts: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        cssTexts.push(Array.from(sheet.cssRules).map((r) => r.cssText).join('\n'));
      } catch {
        if (sheet.href) cssTexts.push(`@import url("${sheet.href}");`);
      }
    }

    // Mount a hidden container for rendering
    const container = document.createElement('div');
    container.style.cssText = [
      'position:fixed', 'left:-9999px', 'top:0',
      'width:794px',   // A4 px at 96dpi ≈ 794px
      'background:#fff', 'color:#1a1a1d',
      'font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif',
      '-webkit-font-smoothing:antialiased',
      'padding:48px 56px 64px',
      'box-sizing:border-box',
    ].join(';');
    container.className = 'markdown-body';
    container.innerHTML = renderedHtml;
    document.body.appendChild(container);

    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ]);

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: 794,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = (canvas.height / canvas.width) * imgW;

      let y = 0;
      while (y < imgH) {
        if (y > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, -y, imgW, imgH);
        y += pageH;
      }

      pdf.save(`${title}.pdf`);
    } finally {
      document.body.removeChild(container);
    }
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
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setExportMenuOpen((v) => !v)}
              className="mac-btn flex items-center gap-1"
              style={{ fontSize: 11, padding: '3px 10px' }}
              title="导出"
            >
              <Download size={11} />
              导出
              <ChevronDown size={9} />
            </button>
            {exportMenuOpen && (
              <div
                className="absolute right-0 top-full mt-1 z-50 rounded-lg overflow-hidden"
                style={{
                  minWidth: 140,
                  background: 'var(--color-bg-elevated)',
                  border: '1px solid var(--color-border-strong)',
                  boxShadow: 'var(--shadow-md)',
                }}
              >
                <button
                  onClick={handleExportMarkdown}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--color-card-hover)] transition-colors"
                  style={{ color: 'var(--color-text)' }}
                >
                  <FileText size={12} />
                  导出 Markdown
                </button>
                <button
                  onClick={handleExportPDF}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--color-card-hover)] transition-colors"
                  style={{ color: 'var(--color-text)' }}
                >
                  <FileType size={12} />
                  导出 PDF
                </button>
              </div>
            )}
          </div>
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
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.set('teach', documentId);
              window.history.pushState({}, '', url.toString());
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="mac-btn flex items-center gap-1"
            style={{
              fontSize: 11,
              padding: '3px 10px',
              background: 'var(--color-primary-light)',
              color: 'var(--color-primary)',
            }}
            title="生成互动学习页"
          >
            <Wand2 size={11} />
            互动
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
        ) : isLargeDoc ? (
          // Large doc (> 500 lines): plain textarea avoids ProseMirror AST overhead
          <textarea
            className="w-full h-full resize-none outline-none bg-transparent p-8 lg:px-20 font-mono text-sm leading-relaxed"
            style={{
              color: 'var(--color-text-primary)',
              background: 'var(--color-bg-primary)',
              fontSize: `${settings.fontSize}px`,
              lineHeight: settings.lineHeight,
            }}
            value={editContent}
            spellCheck={false}
            onChange={(e) => {
              const md = e.target.value;
              setEditContent(md);
              setDirty(true);
              scheduleLiveContent(md);
              scheduleAutosave(md);
            }}
          />
        ) : (
          <div className="h-full overflow-auto">
            <LiveMarkdownEditor
              content={editContent}
              documentId={documentId}
              onChange={(md) => {
                setEditContent(md);
                setDirty(true);
                scheduleLiveContent(md);
                scheduleAutosave(md);
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
                <div className="grid grid-cols-3 gap-2">
                  {([
                      { value: 'readonly', emoji: '👁', label: '只读', desc: '对方只能浏览，无法导入' },
                      { value: 'import', emoji: '📥', label: '可导入', desc: '对方可一键导入到自己的文档库' },
                      { value: 'collab', emoji: '✏️', label: '协同编辑', desc: '多人实时同步编辑同一文档' },
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
