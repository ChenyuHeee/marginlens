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
  BarChart2,
  List,
  Tag,
  Folder,
  FolderOpen,
  FolderPlus,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { useDocumentStore, useAnnotationStore, useChatStore, useUIStore, useAuthStore, useWorkspaceStore } from '@/stores';
import { isSupabaseConfigured } from '@/lib/supabase';
import { AuthDialog } from './AuthDialog';
import { ApiMonitorPanel } from './ApiMonitorPanel';
import { MarkdownOutline, PdfOutline } from './OutlinePanel';

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
  const { documents, activeDocumentId, activeDocument, openDocument, addDocument, addDocumentFromText, removeDocument, updateDocument } = useDocumentStore();
  const annotationStore = useAnnotationStore();
  const chatStore = useChatStore();
  const { sidebarOpen, toggleSidebar, sidebarTab, setSidebarTab, pdfOutline, tagFilter, setTagFilter, activeWorkspaceId, setActiveWorkspaceId } = useUIStore();
  const { user, syncing: cloudSyncing, lastSyncedAt, syncError, signOut, syncNow } = useAuthStore();
  const { workspaces, loadWorkspaces, createWorkspace, removeWorkspace, addDocumentToWorkspace, removeDocumentFromWorkspace } = useWorkspaceStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState('');
  const [authOpen, setAuthOpen] = useState(false);
  const [monitorOpen, setMonitorOpen] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>(loadSort);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [taggingId, setTaggingId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Workspace UI state
  const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useState<Set<string>>(new Set());
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [addingDocToWsId, setAddingDocToWsId] = useState<string | null>(null);

  // Close sort menu on outside click
  useEffect(() => {
    if (!showSortMenu) return;
    const close = () => setShowSortMenu(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showSortMenu]);

  // Load workspaces on mount
  useEffect(() => { loadWorkspaces(); }, []);

  const toggleWorkspaceExpand = (wsId: string) => {
    setExpandedWorkspaceIds((prev) => {
      const next = new Set(prev);
      if (next.has(wsId)) {
        next.delete(wsId);
      } else {
        next.add(wsId);
      }
      return next;
    });
  };

  const handleActivateWorkspace = async (wsId: string) => {
    setActiveWorkspaceId(wsId);
    setExpandedWorkspaceIds((prev) => new Set([...prev, wsId]));
    await chatStore.loadWorkspaceSessions(wsId);
  };

  const handleDeactivateWorkspace = () => {
    setActiveWorkspaceId(null);
    if (activeDocumentId) {
      chatStore.loadSessions(activeDocumentId);
    }
  };

  const handleCreateWorkspace = async () => {
    const name = newWorkspaceName.trim();
    if (!name) return;
    const ws = await createWorkspace(name);
    setNewWorkspaceName('');
    setCreatingWorkspace(false);
    await handleActivateWorkspace(ws.id);
  };

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

  const addTag = async (docId: string) => {
    const tag = tagInput.trim().toLowerCase().replace(/\s+/g, '-');
    if (!tag) { setTaggingId(null); return; }
    const doc = documents.find(d => d.id === docId);
    const existing = doc?.tags ?? [];
    if (!existing.includes(tag)) {
      await updateDocument(docId, { tags: [...existing, tag] });
    }
    setTaggingId(null);
    setTagInput('');
  };

  const removeTag = async (docId: string, tag: string) => {
    const doc = documents.find(d => d.id === docId);
    const existing = doc?.tags ?? [];
    await updateDocument(docId, { tags: existing.filter(t => t !== tag) });
  };

  // Collect all unique tags across all documents
  const allTags = Array.from(new Set(documents.flatMap(d => d.tags ?? []))).sort();

  // Sort + filter
  const sortedDocs = [...documents]
    .filter((d) => {
      const matchSearch = d.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchTag = !tagFilter || (d.tags ?? []).includes(tagFilter);
      return matchSearch && matchTag;
    })
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

      {/* Tag filter bar */}
      {allTags.length > 0 && (
        <div className="px-3 pb-1 flex items-center gap-1.5 flex-wrap">
          <Tag size={10} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
          <button
            onClick={() => setTagFilter(null)}
            className="px-1.5 py-0.5 rounded text-[10px] font-medium transition-all"
            style={{
              background: !tagFilter ? 'var(--color-primary-light)' : 'transparent',
              color: !tagFilter ? 'var(--color-primary)' : 'var(--color-text-tertiary)',
            }}
          >
            全部
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
              className="px-1.5 py-0.5 rounded text-[10px] font-medium transition-all"
              style={{
                background: tagFilter === tag ? 'var(--color-primary-light)' : 'var(--color-bg-tertiary)',
                color: tagFilter === tag ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              }}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

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

      {/* Tab switcher: docs / outline / workspaces */}
      <div className="px-3 pb-1 flex gap-1">
        <button
          onClick={() => { setSidebarTab('docs'); handleDeactivateWorkspace(); }}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-medium transition-all"
          style={{
            background: sidebarTab === 'docs' ? 'var(--color-primary-light)' : 'transparent',
            color: sidebarTab === 'docs' ? 'var(--color-primary)' : 'var(--color-text-tertiary)',
          }}
        >
          <FileText size={11} />
          文档
        </button>
        <button
          onClick={() => { if (activeDocument) setSidebarTab('outline'); }}
          disabled={!activeDocument}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            background: sidebarTab === 'outline' ? 'var(--color-primary-light)' : 'transparent',
            color: sidebarTab === 'outline' ? 'var(--color-primary)' : 'var(--color-text-tertiary)',
          }}
        >
          <List size={11} />
          目录
        </button>
        <button
          onClick={() => setSidebarTab('workspaces')}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-medium transition-all"
          style={{
            background: sidebarTab === 'workspaces' ? 'var(--color-primary-light)' : 'transparent',
            color: sidebarTab === 'workspaces' ? 'var(--color-primary)' : 'var(--color-text-tertiary)',
          }}
        >
          <Folder size={11} />
          工作区
        </button>
      </div>

      {/* Outline panel (replaces doc list when tab = outline) */}
      {sidebarTab === 'outline' && activeDocument ? (
        <div className="flex-1 overflow-y-auto pb-2">
          <div className="px-3 pt-1 pb-2 flex items-center">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
              {activeDocument.title}
            </span>
          </div>
          {activeDocument.type === 'pdf' ? (
            <PdfOutline outline={pdfOutline} />
          ) : (
            <MarkdownOutline content={activeDocument.content || ''} />
          )}
        </div>
      ) : sidebarTab === 'workspaces' ? (
        /* ─── Workspace Panel ─── */
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {/* Create workspace */}
          <div className="px-1 pt-2 pb-1 flex items-center gap-1">
            <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
              工作区 ({workspaces.length})
            </span>
            <button
              onClick={() => setCreatingWorkspace(true)}
              className="p-1 rounded transition-all"
              title="新建工作区"
              style={{ color: 'var(--color-text-tertiary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-primary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
            >
              <FolderPlus size={13} />
            </button>
          </div>

          {creatingWorkspace && (
            <div className="px-1 pb-2 flex items-center gap-1.5">
              <input
                autoFocus
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateWorkspace();
                  if (e.key === 'Escape') { setCreatingWorkspace(false); setNewWorkspaceName(''); }
                }}
                onBlur={() => { if (!newWorkspaceName.trim()) setCreatingWorkspace(false); }}
                placeholder="工作区名称..."
                className="mac-input flex-1"
                style={{ fontSize: 11.5, padding: '4px 8px', borderRadius: 'var(--radius-sm)' }}
              />
              <button
                onClick={handleCreateWorkspace}
                disabled={!newWorkspaceName.trim()}
                className="p-1 rounded disabled:opacity-30"
                style={{ color: 'var(--color-primary)' }}
              >
                <Check size={12} />
              </button>
            </div>
          )}

          {workspaces.length === 0 && !creatingWorkspace && (
            <div className="flex flex-col items-center justify-center py-10 text-center px-3">
              <Folder size={28} style={{ color: 'var(--color-text-tertiary)', opacity: 0.4, marginBottom: 8 }} />
              <p className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                点击右上角 + 创建工作区
              </p>
              <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-tertiary)', opacity: 0.7 }}>
                将多个文档组织成项目或课程
              </p>
            </div>
          )}

          <div className="space-y-1">
            {workspaces.map((ws) => {
              const isExpanded = expandedWorkspaceIds.has(ws.id);
              const isActive = activeWorkspaceId === ws.id;
              const wsDocs = documents.filter((d) => ws.documentIds.includes(d.id));
              const availableDocs = documents.filter((d) => !ws.documentIds.includes(d.id));

              return (
                <div key={ws.id} className="rounded-lg overflow-hidden" style={{ border: isActive ? '1px solid var(--color-primary)' : '1px solid transparent' }}>
                  {/* Workspace header row */}
                  <div
                    className="group flex items-center gap-1.5 px-2 py-1.5 cursor-pointer rounded-lg transition-all"
                    style={{ background: isActive ? 'var(--color-primary-light)' : 'transparent' }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--color-card-hover)'; }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                    onClick={() => {
                      toggleWorkspaceExpand(ws.id);
                      if (!isActive) {
                        handleActivateWorkspace(ws.id);
                      } else if (isExpanded) {
                        handleDeactivateWorkspace();
                      }
                    }}
                  >
                    <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
                      {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    </span>
                    {isExpanded
                      ? <FolderOpen size={13} style={{ color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)', flexShrink: 0 }} />
                      : <Folder size={13} style={{ color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)', flexShrink: 0 }} />
                    }
                    <span
                      className="flex-1 text-[12px] font-medium truncate"
                      style={{ color: isActive ? 'var(--color-primary)' : 'var(--color-text)' }}
                    >
                      {ws.name}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                      {ws.documentIds.length}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); if (confirm(`删除工作区「${ws.name}」？文档不会被删除。`)) { removeWorkspace(ws.id); if (isActive) handleDeactivateWorkspace(); } }}
                      className="opacity-0 group-hover:opacity-60 hover:!opacity-100 p-0.5 rounded transition-all"
                      style={{ color: 'var(--color-danger)', flexShrink: 0 }}
                      title="删除工作区"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>

                  {/* Expanded: doc list inside workspace */}
                  {isExpanded && (
                    <div className="pb-1">
                      {wsDocs.map((doc) => (
                        <div
                          key={doc.id}
                          className="group flex items-center gap-1.5 pl-7 pr-2 py-1 cursor-pointer transition-all"
                          style={{ background: activeDocumentId === doc.id ? 'var(--color-primary-light)' : 'transparent' }}
                          onMouseEnter={(e) => { if (activeDocumentId !== doc.id) e.currentTarget.style.background = 'var(--color-card-hover)'; }}
                          onMouseLeave={(e) => { if (activeDocumentId !== doc.id) e.currentTarget.style.background = 'transparent'; }}
                          onClick={() => handleOpenDocument(doc.id)}
                        >
                          <FileText size={11} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                          <span
                            className="flex-1 text-[11px] truncate"
                            style={{ color: activeDocumentId === doc.id ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}
                          >
                            {doc.title}
                          </span>
                          <span className="text-[9px] opacity-60" style={{ color: 'var(--color-text-tertiary)' }}>
                            {doc.type.toUpperCase()}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); removeDocumentFromWorkspace(ws.id, doc.id); }}
                            className="opacity-0 group-hover:opacity-60 hover:!opacity-100 p-0.5 rounded transition-all"
                            style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }}
                            title="从工作区移除"
                          >
                            <X size={9} />
                          </button>
                        </div>
                      ))}

                      {/* Add doc to workspace */}
                      {addingDocToWsId === ws.id ? (
                        <div className="pl-7 pr-2 py-1">
                          <select
                            autoFocus
                            className="mac-input w-full text-[11px]"
                            style={{ padding: '3px 6px', borderRadius: 'var(--radius-sm)' }}
                            defaultValue=""
                            onChange={async (e) => {
                              if (e.target.value) {
                                await addDocumentToWorkspace(ws.id, e.target.value);
                              }
                              setAddingDocToWsId(null);
                            }}
                            onBlur={() => setAddingDocToWsId(null)}
                          >
                            <option value="" disabled>— 选择文档添加 —</option>
                            {availableDocs.map((d) => (
                              <option key={d.id} value={d.id}>{d.type === 'pdf' ? '📑' : '📄'} {d.title}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAddingDocToWsId(ws.id)}
                          className="flex items-center gap-1 pl-7 pr-2 py-1 w-full text-left text-[11px] transition-all"
                          style={{ color: 'var(--color-text-tertiary)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-primary)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
                        >
                          <Plus size={10} />
                          添加文档
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <>

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
                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                          <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                            {doc.type === 'pdf' ? 'PDF' : 'MD'} · {formatFileSize(doc.fileSize)}
                          </span>
                          {(doc.tags ?? []).map((tag) => (
                            <span
                              key={tag}
                              className="group/tag flex items-center gap-0.5 px-1 py-px rounded text-[9px] font-medium cursor-pointer"
                              style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}
                              onClick={(e) => { e.stopPropagation(); setTagFilter(tag); }}
                              title={`筛选: #${tag}`}
                            >
                              #{tag}
                              <span
                                className="opacity-0 group-hover/tag:opacity-100 transition-opacity"
                                onClick={(e) => { e.stopPropagation(); removeTag(doc.id, tag); }}
                                title="移除标签"
                              >
                                ×
                              </span>
                            </span>
                          ))}
                        </div>
                        {/* Inline tag input */}
                        {taggingId === doc.id && (
                          <div className="flex items-center gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
                            <input
                              ref={tagInputRef}
                              value={tagInput}
                              onChange={(e) => setTagInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') addTag(doc.id);
                                if (e.key === 'Escape') { setTaggingId(null); setTagInput(''); }
                              }}
                              onBlur={() => addTag(doc.id)}
                              autoFocus
                              placeholder="输入标签..."
                              className="mac-input flex-1 min-w-0"
                              style={{ fontSize: 10, padding: '2px 5px', borderRadius: 'var(--radius-sm)' }}
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Action buttons (visible on hover) */}
                  {!isRenaming && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={(e) => { e.stopPropagation(); setTaggingId(doc.id); setTagInput(''); setTimeout(() => tagInputRef.current?.focus(), 0); }}
                        className="p-1 rounded-md"
                        style={{ color: 'var(--color-text-tertiary)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
                        title="添加标签"
                      >
                        <Tag size={11} />
                      </button>
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

        </> // closes the else branch (sidebarTab !== 'outline')
      )}

      {/* API Monitor button */}
      <div
        className="px-3 py-2 flex-shrink-0"
        style={{ borderTop: '1px solid var(--color-border)' }}
      >
        <button
          onClick={() => setMonitorOpen(true)}
          className="mac-btn w-full justify-center gap-1.5"
          style={{ fontSize: 11, padding: '5px 0', borderRadius: 'var(--radius-sm)' }}
        >
          <BarChart2 size={12} />
          API 用量监控
        </button>
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
                {cloudSyncing ? '备份中...' : '云备份'}
              </button>
              {lastSyncedAt && (
                <p className="text-[9.5px] text-center" style={{ color: 'var(--color-text-tertiary)' }}>
                  上次备份: {new Date(lastSyncedAt).toLocaleTimeString()}
                </p>
              )}
              {syncError && (
                <p className="text-[9.5px] text-center" style={{ color: 'var(--color-danger)' }}>
                  备份错误: {syncError}
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
              登录以开启云备份
            </button>
          )}
        </div>
      )}

      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
      <ApiMonitorPanel open={monitorOpen} onClose={() => setMonitorOpen(false)} />
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
