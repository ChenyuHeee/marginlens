import { useState, useRef, useEffect } from 'react';
import {
  FileText,
  Plus,
  Trash2,
  Upload,
  Search,
  PanelLeftClose,
  PanelLeft,
  File,
  Link,
  Loader2,
  X,
  User,
  LogOut,
  RefreshCw,
  Cloud,
  Pin,
  PinOff,
  Pencil,
  Check,
  ArrowUpDown,
} from 'lucide-react';
import { useDocumentStore, useAnnotationStore, useChatStore, useUIStore, useAuthStore } from '@/stores';
import { isSupabaseConfigured } from '@/lib/supabase';
import { AuthDialog } from './AuthDialog';

type SortKey = 'updatedAt' | 'title' | 'type' | 'createdAt';
type SortDir = 'asc' | 'desc';

function loadSort(): { key: SortKey; dir: SortDir } {
  try {
    const s = localStorage.getItem('ml_sort');
    if (s) return JSON.parse(s);
  } catch { /* ignore */ }
  return { key: 'updatedAt', dir: 'desc' };
}

export function Sidebar() {
  const { documents, activeDocumentId, openDocument, addDocument, addDocumentFromText, removeDocument, updateDocument } = useDocumentStore();
  const annotationStore = useAnnotationStore();
  const chatStore = useChatStore();
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const { user, syncing: cloudSyncing, lastSyncedAt, syncError, signOut, syncNow } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState('');
  const [authOpen, setAuthOpen] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>(loadSort);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Close sort menu on outside click
  useEffect(() => {
    if (!showSortMenu) return;
    const close = () => setShowSortMenu(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showSortMenu]);

  const handleSort = (key: SortKey) => {
    const next = sort.key === key
      ? { key, dir: sort.dir === 'asc' ? 'desc' as SortDir : 'asc' as SortDir }
      : { key, dir: key === 'title' ? 'asc' as SortDir : 'desc' as SortDir };
    setSort(next);
    localStorage.setItem('ml_sort', JSON.stringify(next));
    setShowSortMenu(false);
  };

  const togglePin = async (e: React.MouseEvent, docId: string, pinned: boolean) => {
    e.stopPropagation();
    await updateDocument(docId, { pinnedAt: pinned ? 0 : Date.now() });
  };

  const startRename = (e: React.MouseEvent, docId: string, currentTitle: string) => {
    e.stopPropagation();
    setRenamingId(docId);
    setRenameValue(currentTitle);
    setTimeout(() => renameInputRef.current?.select(), 0);
  };

  const commitRename = async (docId: string) => {
    const trimmed = renameValue.trim();
    if (trimmed) await updateDocument(docId, { title: trimmed });
    setRenamingId(null);
  };

  // Sort + filter
  const sortedDocs = [...documents]
    .filter((d) => d.title.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      const pinA = a.pinnedAt || 0;
      const pinB = b.pinnedAt || 0;
      if (pinA !== pinB) return pinB - pinA; // pinned first
      const { key, dir } = sort;
      let cmp = 0;
      if (key === 'title') cmp = a.title.localeCompare(b.title, 'zh');
      else if (key === 'type') cmp = a.type.localeCompare(b.type);
      else cmp = (a[key] as number) - (b[key] as number);
      return dir === 'asc' ? cmp : -cmp;
    });

  const handleFileUpload = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.name.match(/\.(md|markdown|pdf)$/i)) {
        const id = await addDocument(file);
        await handleOpenDocument(id);
      }
    }
  };

  const handleOpenDocument = async (id: string) => {
    await openDocument(id);
    await annotationStore.loadAnnotations(id);
    await chatStore.loadSessions(id);
  };

  /**
   * Parse an arXiv URL into a PDF download URL and a human-readable title.
   * Supports: arxiv.org/abs/ID, arxiv.org/pdf/ID, arxiv.org/html/ID
   */
  const parseArxivUrl = (input: string): { pdfUrl: string; title: string } | null => {
    const trimmed = input.trim();
    // Match arXiv ID from various URL forms or bare ID
    const patterns = [
      /arxiv\.org\/(?:abs|pdf|html)\/([\d.]+(?:v\d+)?)/i,
      /^(\d{4}\.\d{4,5}(?:v\d+)?)$/,
    ];
    for (const p of patterns) {
      const m = trimmed.match(p);
      if (m) {
        const id = m[1];
        return {
          pdfUrl: `https://arxiv.org/pdf/${id}`,
          title: `arXiv:${id}`,
        };
      }
    }
    return null;
  };

  const handleImportUrl = async () => {
    if (!urlValue.trim()) return;
    const parsed = parseArxivUrl(urlValue);
    if (!parsed) {
      setUrlError('无法识别的 arXiv 链接，请输入如 https://arxiv.org/abs/2301.12345');
      return;
    }
    setUrlLoading(true);
    setUrlError('');
    try {
      // Try direct fetch first; if CORS blocks, fall back to proxy
      let response: Response;
      try {
        response = await fetch(parsed.pdfUrl, { redirect: 'follow' });
        if (!response.ok) throw new Error('direct fetch failed');
      } catch {
        // Use a public CORS proxy as fallback
        const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(parsed.pdfUrl)}`;
        response = await fetch(proxyUrl, { redirect: 'follow' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const file = new window.File([blob], `${parsed.title}.pdf`, { type: 'application/pdf' });
      const id = await addDocument(file);
      await handleOpenDocument(id);
      setShowUrlInput(false);
      setUrlValue('');
    } catch (err) {
      setUrlError(`导入失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUrlLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileUpload(e.dataTransfer.files);
  };

  const handleCreateNew = async () => {
    const sampleContent = '# 新笔记\n\n在此开始编写...\n';
    const id = await addDocumentFromText('新笔记', sampleContent);
    await handleOpenDocument(id);
  };

  if (!sidebarOpen) {
    return (
      <div
        className="h-full flex-shrink-0 flex flex-col items-center pt-2.5"
        style={{
          width: 40,
          borderRight: '1px solid var(--color-border)',
          background: 'var(--color-bg-sidebar)',
        }}
      >
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-lg transition-all"
          style={{
            background: 'transparent',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-card-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          title="打开侧栏"
        >
          <PanelLeft size={15} style={{ color: 'var(--color-text-secondary)' }} />
        </button>
      </div>
    );
  }

  return (
    <div
      className="h-full flex flex-col mac-sidebar flex-shrink-0"
      style={{
        width: 'var(--sidebar-width)',
        backgroundColor: 'var(--color-bg-sidebar)',
        borderRight: '1px solid var(--color-border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 h-[52px] flex-shrink-0"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-[22px] h-[22px] rounded-md flex items-center justify-center text-[11px]"
            style={{ background: 'var(--color-primary-light)' }}
          >
            🔍
          </div>
          <span className="font-semibold text-[13px] tracking-tight">MarginLens</span>
        </div>
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-lg transition-all"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--color-card-hover)';
            e.currentTarget.style.color = 'var(--color-text-secondary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--color-text-tertiary)';
          }}
        >
          <PanelLeftClose size={14} />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pt-3 pb-1">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-tertiary)' }} />
          <input
            type="text"
            placeholder="搜索文档..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="mac-input"
            style={{
              fontSize: 12,
              padding: '6px 10px 6px 28px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
            }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="px-3 py-2 flex gap-2">
        <label
          className="mac-btn flex-1 cursor-pointer justify-center"
          style={{ fontSize: 11.5, padding: '6px 0', borderRadius: 'var(--radius-sm)' }}
        >
          <Upload size={12} />
          导入
          <input
            type="file"
            accept=".md,.markdown,.pdf"
            multiple
            onChange={(e) => handleFileUpload(e.target.files)}
            className="hidden"
          />
        </label>
        <button
          onClick={() => { setShowUrlInput(!showUrlInput); setUrlError(''); }}
          className="mac-btn justify-center"
          style={{ fontSize: 11.5, padding: '6px 8px', borderRadius: 'var(--radius-sm)' }}
          title="从 arXiv 链接导入"
        >
          <Link size={12} />
        </button>
        <button
          onClick={handleCreateNew}
          className="mac-btn flex-1 justify-center"
          style={{ fontSize: 11.5, padding: '6px 0', borderRadius: 'var(--radius-sm)' }}
        >
          <Plus size={12} />
          新建
        </button>
      </div>

      {/* arXiv URL import */}
      {showUrlInput && (
        <div className="px-3 pb-2">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              placeholder="粘贴 arXiv 链接..."
              value={urlValue}
              onChange={(e) => { setUrlValue(e.target.value); setUrlError(''); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleImportUrl();
                if (e.key === 'Escape') { setShowUrlInput(false); setUrlValue(''); }
              }}
              autoFocus
              disabled={urlLoading}
              className="mac-input flex-1"
              style={{ fontSize: 11.5, padding: '5px 8px', borderRadius: 'var(--radius-sm)' }}
            />
            {urlLoading ? (
              <Loader2 size={14} className="animate-spin flex-shrink-0" style={{ color: 'var(--color-primary)' }} />
            ) : (
              <button
                onClick={() => { setShowUrlInput(false); setUrlValue(''); setUrlError(''); }}
                className="p-1 rounded flex-shrink-0"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                <X size={12} />
              </button>
            )}
          </div>
          {urlError && (
            <p className="text-[10px] mt-1 px-0.5" style={{ color: 'var(--color-danger)' }}>{urlError}</p>
          )}
        </div>
      )}

      {/* Section label + sort */}
      <div className="px-3 pt-1 pb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
          文档 ({sortedDocs.length})
        </span>
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setShowSortMenu((v) => !v); }}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] transition-colors"
            style={{ color: 'var(--color-text-tertiary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-card-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            title="排序"
          >
            <ArrowUpDown size={10} />
            {{updatedAt:'修改', createdAt:'创建', title:'名称', type:'类型'}[sort.key]}
          </button>
          {showSortMenu && (
            <div
              className="absolute right-0 top-full mt-1 w-32 rounded-lg shadow-lg z-50 overflow-hidden"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {([['updatedAt', '修改日期'], ['createdAt', '创建日期'], ['title', '名称'], ['type', '类型']] as [SortKey, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => handleSort(key)}
                  className="w-full flex items-center justify-between px-3 py-2 text-[11px] transition-colors"
                  style={{
                    color: sort.key === key ? 'var(--color-primary)' : 'var(--color-text)',
                    background: sort.key === key ? 'var(--color-primary-light)' : 'transparent',
                  }}
                  onMouseEnter={(e) => { if (sort.key !== key) e.currentTarget.style.background = 'var(--color-card-hover)'; }}
                  onMouseLeave={(e) => { if (sort.key !== key) e.currentTarget.style.background = 'transparent'; }}
                >
                  {label}
                  {sort.key === key && <span>{sort.dir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Document list */}
      <div
        className={`flex-1 overflow-y-auto px-2 pb-2 ${dragOver ? 'ring-2 ring-inset rounded-lg' : ''}`}
        style={dragOver ? { boxShadow: 'inset 0 0 0 2px var(--color-primary)', borderRadius: 'var(--radius-md)' } : undefined}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {sortedDocs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
              style={{ background: 'var(--color-bg-tertiary)' }}
            >
              <File size={16} style={{ color: 'var(--color-text-tertiary)' }} />
            </div>
            <p className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
              拖拽 .md / .pdf 文件到此处
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {sortedDocs.map((doc) => {
              const isActive = activeDocumentId === doc.id;
              const isPinned = !!doc.pinnedAt;
              const isRenaming = renamingId === doc.id;
              return (
                <div
                  key={doc.id}
                  onClick={() => !isRenaming && handleOpenDocument(doc.id)}
                  className="group flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all"
                  style={{ background: isActive ? 'var(--color-primary-light)' : 'transparent' }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--color-card-hover)'; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div
                    className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 transition-colors"
                    style={{
                      background: isActive ? 'var(--color-primary)' : 'var(--color-bg-tertiary)',
                      color: isActive ? 'white' : 'var(--color-text-tertiary)',
                    }}
                  >
                    <FileText size={12} />
                  </div>
                  <div className="flex-1 min-w-0">
                    {isRenaming ? (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          ref={renameInputRef}
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename(doc.id);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          onBlur={() => commitRename(doc.id)}
                          autoFocus
                          className="mac-input flex-1 min-w-0"
                          style={{ fontSize: 11.5, padding: '2px 5px', borderRadius: 'var(--radius-sm)' }}
                        />
                        <button
                          onClick={() => commitRename(doc.id)}
                          className="p-0.5 rounded flex-shrink-0"
                          style={{ color: 'var(--color-primary)' }}
                        >
                          <Check size={11} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <p
                          className="text-[12px] font-medium truncate"
                          style={{ color: isActive ? 'var(--color-primary)' : 'var(--color-text)' }}
                        >
                          {isPinned && <span className="mr-1" style={{ color: 'var(--color-primary)', fontSize: 9 }}>●</span>}
                          {doc.title}
                        </p>
                        <p className="text-[10px] mt-px" style={{ color: 'var(--color-text-tertiary)' }}>
                          {doc.type === 'pdf' ? 'PDF' : 'MD'} · {formatFileSize(doc.fileSize)}
                        </p>
                      </>
                    )}
                  </div>

                  {/* Action buttons (visible on hover) */}
                  {!isRenaming && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={(e) => startRename(e, doc.id, doc.title)}
                        className="p-1 rounded-md"
                        style={{ color: 'var(--color-text-tertiary)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
                        title="重命名"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={(e) => togglePin(e, doc.id, isPinned)}
                        className="p-1 rounded-md"
                        style={{ color: isPinned ? 'var(--color-primary)' : 'var(--color-text-tertiary)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-primary)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = isPinned ? 'var(--color-primary)' : 'var(--color-text-tertiary)'; }}
                        title={isPinned ? '取消置顶' : '置顶'}
                      >
                        {isPinned ? <PinOff size={11} /> : <Pin size={11} />}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`删除 "${doc.title}"？`)) removeDocument(doc.id);
                        }}
                        className="p-1 rounded-md"
                        style={{ color: 'var(--color-text-tertiary)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-danger)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
                        title="删除"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* User / Auth section */}
      {isSupabaseConfigured() && (
        <div
          className="px-3 py-2.5 flex-shrink-0"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          {user ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}
                >
                  <User size={11} />
                </div>
                <span className="text-[11px] truncate flex-1" style={{ color: 'var(--color-text-secondary)' }}>
                  {user.email}
                </span>
                <button
                  onClick={() => signOut()}
                  className="p-1 rounded transition-colors"
                  style={{ color: 'var(--color-text-tertiary)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-danger)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
                  title="退出登录"
                >
                  <LogOut size={12} />
                </button>
              </div>
              <button
                onClick={() => syncNow()}
                disabled={cloudSyncing}
                className="mac-btn w-full justify-center gap-1.5"
                style={{ fontSize: 10.5, padding: '5px 0', borderRadius: 'var(--radius-sm)', opacity: cloudSyncing ? 0.6 : 1 }}
              >
                {cloudSyncing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                {cloudSyncing ? '同步中...' : '同步'}
              </button>
              {lastSyncedAt && (
                <p className="text-[9.5px] text-center" style={{ color: 'var(--color-text-tertiary)' }}>
                  上次同步: {new Date(lastSyncedAt).toLocaleTimeString()}
                </p>
              )}
              {syncError && (
                <p className="text-[9.5px] text-center" style={{ color: 'var(--color-danger)' }}>
                  同步错误: {syncError}
                </p>
              )}
            </div>
          ) : (
            <button
              onClick={() => setAuthOpen(true)}
              className="mac-btn w-full justify-center gap-1.5"
              style={{ fontSize: 11, padding: '6px 0', borderRadius: 'var(--radius-sm)' }}
            >
              <Cloud size={12} />
              登录以同步
            </button>
          )}
        </div>
      )}

      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
