import { MessageSquare, BookOpen, Languages, Settings, Sun, Moon, SunMoon } from 'lucide-react';
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
    const next = settings.theme === 'dark' ? 'light' : settings.theme === 'light' ? 'system' : 'dark';
    updateSettings({ theme: next });
    if (next === 'system') {
      document.documentElement.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches);
    } else {
      document.documentElement.classList.toggle('dark', next === 'dark');
    }
  };

  const tabs = [
    { id: 'chat' as const, icon: <MessageSquare size={13} />, label: '对话' },
    { id: 'annotations' as const, icon: <BookOpen size={13} />, label: '批注' },
    { id: 'translate' as const, icon: <Languages size={13} />, label: '翻译' },
  ];

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
        className="flex items-center h-[52px] flex-shrink-0 px-1.5"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <div
          className="flex items-center gap-0.5 p-1 rounded-lg"
          style={{ background: 'var(--color-bg-secondary)' }}
        >
          {tabs.map((tab) => {
            const isActive = rightPanelTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setRightPanelTab(tab.id)}
                className="flex items-center gap-1.5 px-3 py-[5px] text-[12px] font-medium rounded-md transition-all"
                style={{
                  background: isActive ? 'var(--color-bg-elevated)' : 'transparent',
                  color: isActive ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                  boxShadow: isActive ? 'var(--shadow-xs)' : 'none',
                }}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-0.5">
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-lg transition-all"
            title={`切换主题 (当前: ${settings.theme === 'light' ? '浅色' : settings.theme === 'dark' ? '深色' : '跟随系统'})`}
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
            {settings.theme === 'dark' ? <Sun size={13} /> : settings.theme === 'system' ? <SunMoon size={13} /> : <Moon size={13} />}
          </button>
          <button
            onClick={onOpenSettings}
            className="p-1.5 rounded-lg transition-all mr-1"
            title="设置"
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
            <Settings size={13} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {rightPanelTab === 'chat' && <ChatPanel />}
        {rightPanelTab === 'annotations' && <AnnotationsPanel />}
        {rightPanelTab === 'translate' && <TranslatePanel />}
      </div>
    </div>
  );
}
