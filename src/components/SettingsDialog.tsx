import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { useSettingsStore } from '@/stores';
import type { LLMProvider, PromptTemplate } from '@/types';
import { v4 as uuid } from 'uuid';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<'providers' | 'templates' | 'display'>('providers');

  if (!open) return null;

  const tabs = [
    { id: 'providers' as const, label: 'API 配置' },
    { id: 'templates' as const, label: '提示模板' },
    { id: 'display' as const, label: '显示设置' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-[640px] max-h-[80vh] rounded-xl shadow-2xl border overflow-hidden flex flex-col"
        style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <h2 className="text-lg font-semibold">设置</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-slate-700">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-4" style={{ borderColor: 'var(--color-border)' }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent hover:bg-gray-50 dark:hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'providers' && <ProvidersSettings />}
          {activeTab === 'templates' && <TemplatesSettings />}
          {activeTab === 'display' && <DisplaySettings />}
        </div>
      </div>
    </div>
  );
}

function ProvidersSettings() {
  const { settings, updateSettings, updateProvider } = useSettingsStore();
  const [showKeyId, setShowKeyId] = useState<string | null>(null);

  const handleAddProvider = () => {
    const newProvider: LLMProvider = {
      id: uuid(),
      name: '新提供商',
      baseUrl: 'https://api.example.com/v1',
      apiKey: '',
      model: 'gpt-4o-mini',
      maxTokens: 4096,
      temperature: 0.7,
    };
    updateSettings({
      providers: [...settings.providers, newProvider],
    });
  };

  const handleRemoveProvider = (id: string) => {
    updateSettings({
      providers: settings.providers.filter((p) => p.id !== id),
      activeProviderId: settings.activeProviderId === id
        ? settings.providers[0]?.id || ''
        : settings.activeProviderId,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">当前使用</label>
        <select
          value={settings.activeProviderId}
          onChange={(e) => updateSettings({ activeProviderId: e.target.value })}
          className="px-3 py-1.5 text-sm border rounded-md bg-transparent outline-none"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {settings.providers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {settings.providers.map((provider) => (
        <div
          key={provider.id}
          className="border rounded-lg p-4 space-y-3"
          style={{ borderColor: provider.id === settings.activeProviderId ? 'var(--color-primary)' : 'var(--color-border)' }}
        >
          <div className="flex items-center justify-between">
            <input
              value={provider.name}
              onChange={(e) => updateProvider(provider.id, { name: e.target.value })}
              className="text-sm font-medium bg-transparent outline-none border-b border-transparent focus:border-indigo-500"
            />
            {!['openai', 'deepseek', 'qwen', 'ollama'].includes(provider.id) && (
              <button
                onClick={() => handleRemoveProvider(provider.id)}
                className="p-1 rounded hover:bg-red-50 text-red-500"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Base URL</label>
              <input
                value={provider.baseUrl}
                onChange={(e) => updateProvider(provider.id, { baseUrl: e.target.value })}
                className="w-full px-2 py-1.5 text-xs border rounded-md bg-transparent outline-none focus:ring-1 focus:ring-indigo-500"
                style={{ borderColor: 'var(--color-border)' }}
              />
            </div>
            <div>
              <label className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Model</label>
              <input
                value={provider.model}
                onChange={(e) => updateProvider(provider.id, { model: e.target.value })}
                className="w-full px-2 py-1.5 text-xs border rounded-md bg-transparent outline-none focus:ring-1 focus:ring-indigo-500"
                style={{ borderColor: 'var(--color-border)' }}
              />
            </div>
          </div>

          <div>
            <label className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>API Key</label>
            <div className="relative">
              <input
                type={showKeyId === provider.id ? 'text' : 'password'}
                value={provider.apiKey}
                onChange={(e) => updateProvider(provider.id, { apiKey: e.target.value })}
                placeholder="sk-..."
                autoComplete="off"
                data-1p-ignore
                className="w-full px-2 py-1.5 pr-12 text-xs border rounded-md bg-transparent outline-none focus:ring-1 focus:ring-indigo-500"
                style={{ borderColor: 'var(--color-border)' }}
              />
              <button
                type="button"
                onClick={() => setShowKeyId(showKeyId === provider.id ? null : provider.id)}
                className="absolute right-1 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] rounded hover:bg-gray-100 dark:hover:bg-slate-700"
              >
                {showKeyId === provider.id ? '隐藏' : '显示'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Max Tokens</label>
              <input
                type="number"
                value={provider.maxTokens}
                onChange={(e) => updateProvider(provider.id, { maxTokens: parseInt(e.target.value) || 4096 })}
                className="w-full px-2 py-1.5 text-xs border rounded-md bg-transparent outline-none focus:ring-1 focus:ring-indigo-500"
                style={{ borderColor: 'var(--color-border)' }}
              />
            </div>
            <div>
              <label className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Temperature</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={provider.temperature}
                onChange={(e) => updateProvider(provider.id, { temperature: parseFloat(e.target.value) || 0.7 })}
                className="w-full px-2 py-1.5 text-xs border rounded-md bg-transparent outline-none focus:ring-1 focus:ring-indigo-500"
                style={{ borderColor: 'var(--color-border)' }}
              />
            </div>
          </div>
        </div>
      ))}

      <button
        onClick={handleAddProvider}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm border border-dashed rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <Plus size={14} />
        <span>添加提供商</span>
      </button>
    </div>
  );
}

function TemplatesSettings() {
  const { settings, updateSettings } = useSettingsStore();
  const templates = settings.promptTemplates;

  const handleUpdate = (id: string, updates: Partial<PromptTemplate>) => {
    updateSettings({
      promptTemplates: templates.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    });
  };

  const handleAdd = () => {
    const newTemplate: PromptTemplate = {
      id: uuid(),
      name: '新模板',
      icon: '📌',
      prompt: '{text}',
      builtin: false,
    };
    updateSettings({ promptTemplates: [...templates, newTemplate] });
  };

  const handleRemove = (id: string) => {
    updateSettings({ promptTemplates: templates.filter((t) => t.id !== id) });
  };

  return (
    <div className="space-y-3">
      {templates.map((t) => (
        <div
          key={t.id}
          className="border rounded-lg p-3 space-y-2"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center gap-2">
            <input
              value={t.icon}
              onChange={(e) => handleUpdate(t.id, { icon: e.target.value })}
              className="w-8 text-center bg-transparent outline-none"
              maxLength={2}
            />
            <input
              value={t.name}
              onChange={(e) => handleUpdate(t.id, { name: e.target.value })}
              className="flex-1 text-sm bg-transparent outline-none border-b border-transparent focus:border-indigo-500"
            />
            {!t.builtin && (
              <button onClick={() => handleRemove(t.id)} className="p-1 rounded hover:bg-red-50 text-red-500">
                <Trash2 size={12} />
              </button>
            )}
          </div>
          <textarea
            value={t.prompt}
            onChange={(e) => handleUpdate(t.id, { prompt: e.target.value })}
            className="w-full px-2 py-1.5 text-xs border rounded-md bg-transparent outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            style={{ borderColor: 'var(--color-border)' }}
            rows={2}
            placeholder="使用 {text} 表示选中的文本"
          />
        </div>
      ))}

      <button
        onClick={handleAdd}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm border border-dashed rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <Plus size={14} />
        <span>添加模板</span>
      </button>
    </div>
  );
}

function DisplaySettings() {
  const { settings, updateSettings } = useSettingsStore();

  const languageOptions = ['中文', 'English', '日本語', '한국어', 'Français', 'Deutsch', 'Español'];

  return (
    <div className="space-y-6">
      <div>
        <label className="text-sm font-medium">翻译目标语言</label>
        <select
          value={settings.translationLanguage || '中文'}
          onChange={(e) => updateSettings({ translationLanguage: e.target.value })}
          className="w-full mt-2 px-3 py-2 text-sm border rounded-md bg-transparent outline-none focus:ring-1 focus:ring-indigo-500"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {languageOptions.map((lang) => (
            <option key={lang} value={lang}>{lang}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-sm font-medium">主题</label>
        <div className="flex gap-2 mt-2">
          {(['light', 'dark'] as const).map((theme) => (
            <button
              key={theme}
              onClick={() => {
                updateSettings({ theme });
                document.documentElement.classList.toggle('dark', theme === 'dark');
              }}
              className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                settings.theme === theme
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-600'
                  : 'hover:bg-gray-50 dark:hover:bg-slate-800'
              }`}
              style={{ borderColor: settings.theme === theme ? undefined : 'var(--color-border)' }}
            >
              {theme === 'light' ? '☀️ 浅色' : '🌙 深色'}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">字体大小: {settings.fontSize}px</label>
        <input
          type="range"
          min="12"
          max="24"
          value={settings.fontSize}
          onChange={(e) => updateSettings({ fontSize: parseInt(e.target.value) })}
          className="w-full mt-2"
        />
      </div>

      <div>
        <label className="text-sm font-medium">行高: {settings.lineHeight}</label>
        <input
          type="range"
          min="1.2"
          max="2.4"
          step="0.1"
          value={settings.lineHeight}
          onChange={(e) => updateSettings({ lineHeight: parseFloat(e.target.value) })}
          className="w-full mt-2"
        />
      </div>
    </div>
  );
}
