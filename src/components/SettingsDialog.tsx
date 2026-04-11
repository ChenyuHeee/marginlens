import { useState } from 'react';
import { X, Plus, Trash2, Eye, EyeOff } from 'lucide-react';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div
        className="w-[640px] max-h-[80vh] rounded-2xl overflow-hidden flex flex-col animate-scale-in"
        style={{
          backgroundColor: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-strong)',
          boxShadow: 'var(--shadow-xl)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <h2 className="text-[16px] font-semibold tracking-tight">设置</h2>
          <button
            onClick={onClose}
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
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-6 pt-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-4 py-2.5 text-[13px] font-medium transition-all relative"
              style={{
                color: activeTab === tab.id ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              }}
            >
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full" style={{ background: 'var(--color-primary)' }} />
              )}
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
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <label className="text-[13px] font-medium">当前使用</label>
        <select
          value={settings.activeProviderId}
          onChange={(e) => updateSettings({ activeProviderId: e.target.value })}
          className="px-3 py-1.5 text-[13px] rounded-lg bg-transparent outline-none"
          style={{ border: '1px solid var(--color-border-strong)', color: 'var(--color-text)' }}
        >
          {settings.providers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {settings.providers.map((provider) => (
        <div
          key={provider.id}
          className="rounded-xl p-4 space-y-3"
          style={{
            border: provider.id === settings.activeProviderId
              ? '1.5px solid var(--color-primary)'
              : '1px solid var(--color-border)',
            background: provider.id === settings.activeProviderId
              ? 'var(--color-primary-subtle)'
              : 'transparent',
          }}
        >
          <div className="flex items-center justify-between">
            <input
              value={provider.name}
              onChange={(e) => updateProvider(provider.id, { name: e.target.value })}
              className="text-[13px] font-semibold bg-transparent outline-none border-b border-transparent focus:border-current"
              style={{ color: 'var(--color-text)' }}
            />
            {!['openai', 'deepseek', 'qwen', 'ollama'].includes(provider.id) && (
              <button
                onClick={() => handleRemoveProvider(provider.id)}
                className="p-1.5 rounded-lg transition-all"
                style={{ color: 'var(--color-danger)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,59,48,0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SettingField label="Base URL">
              <input
                value={provider.baseUrl}
                onChange={(e) => updateProvider(provider.id, { baseUrl: e.target.value })}
                className="mac-input"
                style={{ fontSize: 12 }}
              />
            </SettingField>
            <SettingField label="Model">
              <input
                value={provider.model}
                onChange={(e) => updateProvider(provider.id, { model: e.target.value })}
                className="mac-input"
                style={{ fontSize: 12 }}
              />
            </SettingField>
          </div>

          <SettingField label="API Key">
            <div className="relative">
              <input
                type={showKeyId === provider.id ? 'text' : 'password'}
                value={provider.apiKey}
                onChange={(e) => updateProvider(provider.id, { apiKey: e.target.value })}
                placeholder="sk-..."
                autoComplete="off"
                data-1p-ignore
                className="mac-input pr-10"
                style={{ fontSize: 12 }}
              />
              <button
                type="button"
                onClick={() => setShowKeyId(showKeyId === provider.id ? null : provider.id)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded transition-all"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                {showKeyId === provider.id ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </SettingField>

          <div className="grid grid-cols-2 gap-3">
            <SettingField label="Max Tokens">
              <input
                type="number"
                value={provider.maxTokens}
                onChange={(e) => updateProvider(provider.id, { maxTokens: parseInt(e.target.value) || 4096 })}
                className="mac-input"
                style={{ fontSize: 12 }}
              />
            </SettingField>
            <SettingField label="Temperature">
              <input
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={provider.temperature}
                onChange={(e) => updateProvider(provider.id, { temperature: parseFloat(e.target.value) || 0.7 })}
                className="mac-input"
                style={{ fontSize: 12 }}
              />
            </SettingField>
          </div>
        </div>
      ))}

      <button
        onClick={handleAddProvider}
        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-[13px] font-medium rounded-xl border-2 border-dashed transition-all"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-primary)';
          e.currentTarget.style.color = 'var(--color-primary)';
          e.currentTarget.style.background = 'var(--color-primary-subtle)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-border)';
          e.currentTarget.style.color = 'var(--color-text-secondary)';
          e.currentTarget.style.background = 'transparent';
        }}
      >
        <Plus size={14} />
        添加提供商
      </button>
    </div>
  );
}

function SettingField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>{label}</label>
      {children}
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
          className="rounded-xl p-3.5 space-y-2.5"
          style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)' }}
        >
          <div className="flex items-center gap-2.5">
            <input
              value={t.icon}
              onChange={(e) => handleUpdate(t.id, { icon: e.target.value })}
              className="w-8 text-center text-[15px] bg-transparent outline-none"
              maxLength={2}
            />
            <input
              value={t.name}
              onChange={(e) => handleUpdate(t.id, { name: e.target.value })}
              className="flex-1 text-[13px] font-medium bg-transparent outline-none border-b border-transparent focus:border-current"
              style={{ color: 'var(--color-text)' }}
            />
            {!t.builtin && (
              <button
                onClick={() => handleRemove(t.id)}
                className="p-1 rounded-lg transition-all"
                style={{ color: 'var(--color-danger)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,59,48,0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
          <textarea
            value={t.prompt}
            onChange={(e) => handleUpdate(t.id, { prompt: e.target.value })}
            className="mac-input resize-none"
            style={{ fontSize: 12, minHeight: 52 }}
            rows={2}
            placeholder="使用 {text} 表示选中的文本"
          />
        </div>
      ))}

      <button
        onClick={handleAdd}
        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-[13px] font-medium rounded-xl border-2 border-dashed transition-all"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-primary)';
          e.currentTarget.style.color = 'var(--color-primary)';
          e.currentTarget.style.background = 'var(--color-primary-subtle)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-border)';
          e.currentTarget.style.color = 'var(--color-text-secondary)';
          e.currentTarget.style.background = 'transparent';
        }}
      >
        <Plus size={14} />
        添加模板
      </button>
    </div>
  );
}

function DisplaySettings() {
  const { settings, updateSettings } = useSettingsStore();

  const languageOptions = ['中文', 'English', '日本語', '한국어', 'Français', 'Deutsch', 'Español'];

  return (
    <div className="space-y-6">
      <SettingField label="翻译目标语言">
        <select
          value={settings.translationLanguage || '中文'}
          onChange={(e) => updateSettings({ translationLanguage: e.target.value })}
          className="mac-input"
          style={{ fontSize: 13 }}
        >
          {languageOptions.map((lang) => (
            <option key={lang} value={lang}>{lang}</option>
          ))}
        </select>
      </SettingField>

      <div className="space-y-2">
        <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>主题</label>
        <div className="flex gap-2">
          {(['light', 'dark'] as const).map((theme) => (
            <button
              key={theme}
              onClick={() => {
                updateSettings({ theme });
                document.documentElement.classList.toggle('dark', theme === 'dark');
              }}
              className="flex-1 px-4 py-2.5 text-[13px] font-medium rounded-xl transition-all"
              style={{
                border: settings.theme === theme ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                background: settings.theme === theme ? 'var(--color-primary-light)' : 'transparent',
                color: settings.theme === theme ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              }}
            >
              {theme === 'light' ? '☀️ 浅色' : '🌙 深色'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          字体大小: <span style={{ color: 'var(--color-text)' }}>{settings.fontSize}px</span>
        </label>
        <input
          type="range"
          min="12"
          max="24"
          value={settings.fontSize}
          onChange={(e) => updateSettings({ fontSize: parseInt(e.target.value) })}
          className="w-full accent-[var(--color-primary)]"
        />
      </div>

      <div className="space-y-2">
        <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          行高: <span style={{ color: 'var(--color-text)' }}>{settings.lineHeight}</span>
        </label>
        <input
          type="range"
          min="1.2"
          max="2.4"
          step="0.1"
          value={settings.lineHeight}
          onChange={(e) => updateSettings({ lineHeight: parseFloat(e.target.value) })}
          className="w-full accent-[var(--color-primary)]"
        />
      </div>
    </div>
  );
}
