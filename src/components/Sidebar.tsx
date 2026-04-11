import { useState } from 'react';
import {
  FileText,
  Plus,
  Trash2,
  Upload,
  Search,
  PanelLeftClose,
  PanelLeft,
  File,
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
    const sampleContent = '# 新笔记\n\n在此开始编写...\n';
    const id = await addDocumentFromText('新笔记', sampleContent);
    await handleOpenDocument(id);
  };

  if (!sidebarOpen) {
    return (
      <button
        onClick={toggleSidebar}
        className="fixed left-3 top-3 z-20 p-2 rounded-xl transition-all"
        style={{
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-md)',
        }}
        title="打开侧栏"
      >
        <PanelLeft size={15} style={{ color: 'var(--color-text-secondary)' }} />
      </button>
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
          onClick={handleCreateNew}
          className="mac-btn flex-1 justify-center"
          style={{ fontSize: 11.5, padding: '6px 0', borderRadius: 'var(--radius-sm)' }}
        >
          <Plus size={12} />
          新建
        </button>
      </div>

      {/* Section label */}
      <div className="px-4 pt-1 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
          文档 ({filteredDocs.length})
        </span>
      </div>

      {/* Document list */}
      <div
        className={`flex-1 overflow-y-auto px-2 pb-2 ${dragOver ? 'ring-2 ring-inset rounded-lg' : ''}`}
        style={dragOver ? { boxShadow: 'inset 0 0 0 2px var(--color-primary)', borderRadius: 'var(--radius-md)' } : undefined}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {filteredDocs.length === 0 ? (
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
            {filteredDocs.map((doc) => {
              const isActive = activeDocumentId === doc.id;
              return (
                <div
                  key={doc.id}
                  onClick={() => handleOpenDocument(doc.id)}
                  className="group flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all"
                  style={{
                    background: isActive ? 'var(--color-primary-light)' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'var(--color-card-hover)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'transparent';
                  }}
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
                    <p
                      className="text-[12px] font-medium truncate"
                      style={{ color: isActive ? 'var(--color-primary)' : 'var(--color-text)' }}
                    >
                      {doc.title}
                    </p>
                    <p className="text-[10px] mt-px" style={{ color: 'var(--color-text-tertiary)' }}>
                      {doc.type === 'pdf' ? 'PDF' : 'MD'} · {formatFileSize(doc.fileSize)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`删除 "${doc.title}"？`)) removeDocument(doc.id);
                    }}
                    className="p-1 rounded-md opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-all"
                    style={{ color: 'var(--color-danger)' }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
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
