import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { MarkdownPanel } from '@/components/MarkdownPanel';
import { PdfViewer } from '@/components/PdfViewer';
import { RightPanel } from '@/components/RightPanel';
import { SettingsDialog } from '@/components/SettingsDialog';
import { ApiKeyAlert } from '@/components/ApiKeyAlert';
import { ResizableHandle } from '@/components/ResizableHandle';
import { useDocumentStore, useAnnotationStore, useChatStore, useSettingsStore } from '@/stores';
import { Upload, FileText, MessageSquare, BookOpen, Sparkles } from 'lucide-react';

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { activeDocument, loadDocuments } = useDocumentStore();
  const { loadSettings, settings } = useSettingsStore();

  useEffect(() => {
    loadSettings();
    loadDocuments();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.theme === 'dark');
  }, [settings.theme]);

  return (
    <div className="h-full flex" style={{ backgroundColor: 'var(--color-bg)' }}>
      <Sidebar />

      <div className="flex-1 flex min-w-0">
        {activeDocument ? (
          <>
            <div className="flex-1 min-w-0 h-full overflow-hidden">
              {activeDocument.type === 'markdown' ? (
                <MarkdownPanel content={activeDocument.content} documentId={activeDocument.id} />
              ) : (
                <PdfViewer document={activeDocument} />
              )}
            </div>
            <ResizableHandle side="right" />
            <RightPanel onOpenSettings={() => setSettingsOpen(true)} />
          </>
        ) : (
          <WelcomePage onOpenSettings={() => setSettingsOpen(true)} />
        )}
      </div>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ApiKeyAlert />
    </div>
  );
}

function WelcomePage({ onOpenSettings }: { onOpenSettings: () => void }) {
  const features = [
    { icon: <FileText size={14} />, text: '支持 Markdown 与 PDF 阅读' },
    { icon: <Sparkles size={14} />, text: '选中文本即可向 AI 提问' },
    { icon: <MessageSquare size={14} />, text: 'LLM 自动理解文档全文上下文' },
    { icon: <BookOpen size={14} />, text: '批注直接内嵌在文档中' },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center animate-fade-in" style={{ color: 'var(--color-text-tertiary)' }}>
      <div className="text-center max-w-md">
        {/* Logo */}
        <div
          className="w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-5"
          style={{
            background: 'linear-gradient(135deg, var(--color-primary-light), var(--color-primary-subtle))',
            boxShadow: '0 4px 16px rgba(52, 120, 246, 0.10)',
          }}
        >
          <span className="text-3xl">🔍</span>
        </div>

        <h1 className="text-2xl font-bold tracking-tight mb-1" style={{ color: 'var(--color-text)' }}>
          MarginLens
        </h1>
        <p className="text-[13px] mb-8" style={{ color: 'var(--color-text-secondary)' }}>
          智能论文阅读工具 · AI 辅助理解
        </p>

        {/* Action buttons */}
        <div className="flex flex-col gap-3 items-center mb-10">
          <label
            className="mac-btn mac-btn-primary cursor-pointer"
            style={{ padding: '10px 28px', fontSize: 14, borderRadius: 'var(--radius-md)', fontWeight: 500 }}
          >
            <Upload size={15} />
            导入文件
            <input
              type="file"
              accept=".md,.markdown,.pdf"
              multiple
              onChange={async (e) => {
                const files = e.target.files;
                if (!files) return;
                const { addDocument, openDocument } = useDocumentStore.getState();
                for (const file of Array.from(files)) {
                  if (!file.name.match(/\.(md|markdown|pdf)$/i)) continue;
                  const id = await addDocument(file);
                  await openDocument(id);
                  await useAnnotationStore.getState().loadAnnotations(id);
                  await useChatStore.getState().loadSessions(id);
                }
              }}
              className="hidden"
            />
          </label>
          <button
            onClick={onOpenSettings}
            className="text-[12px] font-medium transition-opacity hover:opacity-70"
            style={{ color: 'var(--color-primary)' }}
          >
            配置 API Key →
          </button>
        </div>

        {/* Feature list */}
        <div className="space-y-2.5">
          {features.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-3 text-[12px] justify-center"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              <span style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }}>{f.icon}</span>
              <span>{f.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
