import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { MarkdownViewer } from '@/components/MarkdownViewer';
import { RightPanel } from '@/components/RightPanel';
import { SettingsDialog } from '@/components/SettingsDialog';
import { ResizableHandle } from '@/components/ResizableHandle';
import { useDocumentStore, useSettingsStore } from '@/stores';
import { FileText, Upload } from 'lucide-react';

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
                <MarkdownViewer content={activeDocument.content} documentId={activeDocument.id} />
              ) : (
                <div className="h-full flex items-center justify-center" style={{ color: 'var(--color-text-tertiary)' }}>
                  <div className="text-center">
                    <FileText size={40} className="mx-auto mb-3 opacity-20" />
                    <p className="text-[14px] font-medium">PDF 查看器</p>
                    <p className="text-[12px] mt-1">即将推出</p>
                  </div>
                </div>
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
    </div>
  );
}

function WelcomePage({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center" style={{ color: 'var(--color-text-tertiary)' }}>
      <div className="text-center max-w-sm">
        <div className="text-4xl mb-3">🔍</div>
        <h1 className="text-xl font-bold tracking-tight mb-1" style={{ color: 'var(--color-text)' }}>
          MarginLens
        </h1>
        <p className="text-[13px] mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          智能论文阅读工具 · 划线提问 · AI 辅助理解
        </p>
        <div className="flex flex-col gap-2.5 items-center">
          <label className="mac-btn mac-btn-primary cursor-pointer" style={{ padding: '8px 20px', fontSize: 13, borderRadius: 'var(--radius-md)' }}>
            <Upload size={14} />
            导入 Markdown 文件
            <input
              type="file"
              accept=".md,.markdown"
              multiple
              onChange={async (e) => {
                const files = e.target.files;
                if (!files) return;
                const { addDocument, openDocument } = useDocumentStore.getState();
                for (const file of Array.from(files)) {
                  const id = await addDocument(file);
                  await openDocument(id);
                }
              }}
              className="hidden"
            />
          </label>
          <button
            onClick={onOpenSettings}
            className="text-[12px]"
            style={{ color: 'var(--color-primary)' }}
          >
            配置 API Key →
          </button>
        </div>
        <div className="mt-8 text-[11px] space-y-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
          <p>选中文本即可向 AI 提问</p>
          <p>LLM 自动理解文档全文上下文</p>
          <p>批注直接内嵌在文档中</p>
          <p>支持 OpenAI / DeepSeek / Qwen / Ollama</p>
        </div>
      </div>
    </div>
  );
}
