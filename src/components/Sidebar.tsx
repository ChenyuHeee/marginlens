import { useState } from 'react';
import {
  FileText,
  Plus,
  Trash2,
  Upload,
  Search,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { useDocumentStore, useAnnotationStore, useChatStore, useUIStore } from '@/stores';

export function Sidebar() {
  const { documents, activeDocumentId, openDocument, addDocument, addDocumentFromText, removeDocument } = useDocumentStore();
  const annotationStore = useAnnotationStore();
  const chatStore = useChatStore();
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const filteredDocs = documents.filter((d) =>
    d.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileUpload(e.dataTransfer.files);
  };

  const handleCreateNew = async () => {
    const sampleContent = `# 新笔记\n\n在此开始编写...\n`;
    const id = await addDocumentFromText('新笔记', sampleContent);
    await handleOpenDocument(id);
  };

  if (!sidebarOpen) {
    return (
      <button
        onClick={toggleSidebar}
        className="fixed left-3 top-3 z-20 p-1.5 rounded-lg transition-colors"
        style={{
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-sm)',
        }}
        title="打开侧栏"
      >
        <PanelLeft size={15} style={{ color: 'var(--color-text-secondary)' }} />
      </button>
    );
  }

  return (
    <div
      className="h-full flex flex-col mac-sidebar"
      style={{
        width: 'var(--sidebar-width)',
        backgroundColor: 'var(--color-bg-sidebar)',
        borderRight: '1px solid var(--color-border)',
      }}
    >
      {/* Header — macOS window titlebar style */}
      <div
        className="flex items-center justify-between px-4 h-12 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">🔍</span>
          <span className="font-semibold text-[13px] tracking-tight">MarginLens</span>
        </div>
        <button
          onClick={toggleSidebar}
          className="p-1 rounded-md transition-colors"
          style={{ color: 'var(--color-text-secondary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-card-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <PanelLeftClose size={14} />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pt-2.5 pb-1.5">
        <div className="relative">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-tertiary)' }} />
          <input
            type="text"
            placeholder="搜索"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="mac-input pl-7"
            style={{ fontSize: 12, padding: '5px 8px 5px 26px', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg)' }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="px-3 pb-1.5 flex gap-1.5">
        <label className="mac-btn flex-1 cursor-pointer" style={{ fontSize: 11 }}>
          <Upload size={11} />
          导入
          <input
            type="file"
            accept=".md,.markdown,.pdf"
            multiple
            onChange={(e) => handleFileUpload(e.target.files)}
            className="hidden"
          />
        </label>
        <button onClick={handleCreateNew} className="mac-btn flex-1" style={{ fontSize: 11 }}>
          <Plus size={11} />
          新建
        </button>
      </div>

      {/* Document list */}
      <div
        className={`flex-1 overflow-y-auto px-2 py-1 ${dragOver ? 'ring-2 ring-blue-500/30 ring-inset rounded-lg' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {filteredDocs.length === 0 ? (
          <div className="text-center py-10 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            <p>拖拽 .md / .pdf 文件到此处</p>
          </div>
        ) : (
          <div className="space-y-px">
            {filteredDocs.map((doc) => (
              <div
                key={doc.id}
                onClick={() => handleOpenDocument(doc.id)}
                className="group flex items-center gap-2 px-2.5 py-[7px] rounded-lg cursor-pointer transition-all duration-100"
                style={{
                  background: activeDocumentId === doc.id ? 'var(--color-primary-light)' : 'transparent',
                  color: activeDocumentId === doc.id ? 'var(--color-primary)' : 'var(--color-text)',
                }}
                onMouseEnter={(e) => {
                  if (activeDocumentId !== doc.id) e.currentTarget.style.background = 'var(--color-card-hover)';
                }}
                onMouseLeave={(e) => {
                  if (activeDocumentId !== doc.id) e.currentTarget.style.background = 'transparent';
                }}
              >
                <FileText size={13} className="flex-shrink-0 opacity-50" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium truncate">{doc.title}</p>
                  <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                    {formatFileSize(doc.fileSize)}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`删除 "${doc.title}"？`)) removeDocument(doc.id);
                  }}
                  className="p-1 rounded opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
