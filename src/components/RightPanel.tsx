import { MessageSquare, BookOpen, Languages, Settings, Sun, Moon } from 'lucide-react';
import { useUIStore, useSettingsStore } from '@/stores';
import { ChatPanel } from './ChatPanel';
import { AnnotationsPanel } from './AnnotationsPanel';
import { TranslatePanel } from './TranslatePanel';

interface RightPanelProps {
  onOpenSettings: () => void;
}

export function RightPanel({ onOpenSettings }: RightPanelProps) {
  const { rightPanelTab, setRightPanelTab, rightPanelWidth } = useUIStore();
  const { settings, updateSettings } = useSettingsStore();

  const toggleTheme = () => {
    const next = settings.theme === 'dark' ? 'light' : 'dark';
    updateSettings({ theme: next });
    document.documentElement.classList.toggle('dark', next === 'dark');
  };

  return (
    <div
      className="h-full flex flex-col"
      style={{
        width: rightPanelWidth,
        borderLeft: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-bg)',
      }}
    >
      {/* Tab bar */}
      <div
        className="flex items-center h-10 flex-shrink-0 px-1"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <TabButton
          active={rightPanelTab === 'chat'}
          onClick={() => setRightPanelTab('chat')}
          icon={<MessageSquare size={12} />}
          label="对话"
        />
        <TabButton
          active={rightPanelTab === 'annotations'}
          onClick={() => setRightPanelTab('annotations')}
          icon={<BookOpen size={12} />}
          label="批注"
        />
        <TabButton
          active={rightPanelTab === 'translate'}
          onClick={() => setRightPanelTab('translate')}
          icon={<Languages size={12} />}
          label="翻译"
        />
        <div className="flex-1" />
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-md transition-colors"
          title="切换主题"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-card-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          {settings.theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
        </button>
        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded-md transition-colors mr-1"
          title="设置"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-card-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <Settings size={12} />
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        {rightPanelTab === 'chat' && <ChatPanel />}
        {rightPanelTab === 'annotations' && <AnnotationsPanel />}
        {rightPanelTab === 'translate' && <TranslatePanel />}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-md mx-0.5 transition-colors"
      style={{
        background: active ? 'var(--color-primary-light)' : 'transparent',
        color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--color-card-hover)'; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      {icon}
      {label}
    </button>
  );
}
