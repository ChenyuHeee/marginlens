import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Eye, EyeOff, GitFork, CheckCircle, AlertCircle, Loader2, Unlink, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { useSettingsStore, useGitHubSyncStore } from '@/stores';
import type { LLMProvider, PromptTemplate } from '@/types';
import { validateToken } from '@/lib/github';
import { v4 as uuid } from 'uuid';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<'providers' | 'templates' | 'display' | 'github'>('providers');

  if (!open) return null;

  const tabs = [
    { id: 'providers' as const, label: 'API 配置' },
    { id: 'templates' as const, label: '提示模板' },
    { id: 'display' as const, label: '显示设置' },
    { id: 'github' as const, label: 'GitHub 推送' },
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
          {activeTab === 'github' && <GitHubSettings />}
        </div>
      </div>
    </div>
  );
}

// Metadata for built-in providers to guide users
const PROVIDER_META: Record<string, { emoji: string; tagline: string; keyLink: string; keyLinkLabel: string; noKey?: boolean }> = {
  openai: {
    emoji: '🤖',
    tagline: 'GPT-4o · 能力强大',
    keyLink: 'https://platform.openai.com/api-keys',
    keyLinkLabel: '获取 OpenAI API Key',
  },
  deepseek: {
    emoji: '🐳',
    tagline: '国内可用 · 性价比高',
    keyLink: 'https://platform.deepseek.com/api_keys',
    keyLinkLabel: '获取 DeepSeek API Key',
  },
  qwen: {
    emoji: '🌐',
    tagline: '阿里通义千问 · 国内免费额度',
    keyLink: 'https://bailian.console.aliyun.com/',
    keyLinkLabel: '获取通义千问 API Key',
  },
  ollama: {
    emoji: '🦙',
    tagline: '本地运行 · 完全免费 · 隐私安全',
    keyLink: 'https://ollama.com/download',
    keyLinkLabel: '下载 Ollama',
    noKey: true,
  },
};

function ProvidersSettings() {
  const { settings, updateSettings, updateProvider } = useSettingsStore();
  const [showKey, setShowKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const active = settings.providers.find((p) => p.id === settings.activeProviderId)
    || settings.providers[0];

  const meta = active ? PROVIDER_META[active.id] : null;
  const isOllama = active?.id === 'ollama';

  const handleAddProvider = () => {
    const newProvider: LLMProvider = {
      id: uuid(),
      name: '自定义',
      baseUrl: 'https://api.example.com/v1',
      apiKey: '',
      model: 'gpt-4o-mini',
      maxTokens: 4096,
      temperature: 0.7,
    };
    updateSettings({
      providers: [...settings.providers, newProvider],
      activeProviderId: newProvider.id,
    });
  };

  const handleRemoveProvider = (id: string) => {
    const remaining = settings.providers.filter((p) => p.id !== id);
    updateSettings({
      providers: remaining,
      activeProviderId: settings.activeProviderId === id
        ? (remaining[0]?.id || '')
        : settings.activeProviderId,
    });
  };

  return (
    <div className="space-y-5">
      {/* Step 1: Choose provider */}
      <div>
        <p className="text-[11px] font-medium mb-2.5" style={{ color: 'var(--color-text-tertiary)' }}>
          第一步 · 选择 AI 提供商
        </p>
        <div className="grid grid-cols-2 gap-2">
          {settings.providers.map((p) => {
            const m = PROVIDER_META[p.id];
            const isActive = p.id === settings.activeProviderId;
            const hasKey = !!p.apiKey && p.apiKey !== 'ollama';
            return (
              <button
                key={p.id}
                onClick={() => updateSettings({ activeProviderId: p.id })}
                className="flex items-start gap-2.5 p-3 rounded-xl text-left transition-all"
                style={{
                  border: isActive ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                  background: isActive ? 'var(--color-primary-subtle)' : 'var(--color-bg)',
                }}
              >
                <span style={{ fontSize: 20, lineHeight: 1 }}>{m?.emoji ?? '⚙️'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-semibold truncate" style={{ color: 'var(--color-text)' }}>{p.name}</span>
                    {hasKey && (
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--color-success, #22c55e)' }} title="已配置 Key" />
                    )}
                  </div>
                  {m && <p className="text-[10px] mt-0.5 leading-tight" style={{ color: 'var(--color-text-tertiary)' }}>{m.tagline}</p>}
                  {!m && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemoveProvider(p.id); }}
                      className="text-[10px] mt-0.5"
                      style={{ color: 'var(--color-danger)' }}
                    >
                      删除
                    </button>
                  )}
                </div>
              </button>
            );
          })}
          <button
            onClick={handleAddProvider}
            className="flex items-center justify-center gap-1.5 p-3 rounded-xl transition-all border-dashed"
            style={{ border: '1px dashed var(--color-border)', color: 'var(--color-text-tertiary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.color = 'var(--color-primary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
          >
            <Plus size={13} />
            <span className="text-[12px]">自定义</span>
          </button>
        </div>
      </div>

      {/* Step 2: API Key */}
      {active && (
        <div
          className="rounded-xl p-4 space-y-3"
          style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)' }}
        >
          <p className="text-[11px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
            第二步 · {isOllama ? '确保 Ollama 已在本地运行' : '输入 API Key'}
          </p>

          {isOllama ? (
            <div className="text-[12px] space-y-2" style={{ color: 'var(--color-text-secondary)' }}>
              <p>Ollama 在本地运行，无需 API Key，完全免费且数据不会上传。</p>
              <ol className="list-decimal list-inside space-y-1 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                <li>下载并安装 Ollama</li>
                <li>运行 <code className="px-1 rounded" style={{ background: 'var(--color-bg-elevated)', fontFamily: 'monospace' }}>ollama pull llama3</code></li>
                <li>保持 Ollama 后台运行即可使用</li>
              </ol>
              {meta && (
                <a href={meta.keyLink} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px]"
                  style={{ color: 'var(--color-primary)' }}
                >
                  <ExternalLink size={11} />
                  {meta.keyLinkLabel}
                </a>
              )}
            </div>
          ) : (
            <>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={active.apiKey}
                  onChange={(e) => updateProvider(active.id, { apiKey: e.target.value })}
                  placeholder="粘贴你的 API Key…"
                  autoComplete="off"
                  data-1p-ignore
                  className="mac-input pr-10 text-[13px]"
                  style={{ height: 38 }}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {meta && (
                <a href={meta.keyLink} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px]"
                  style={{ color: 'var(--color-primary)' }}
                >
                  <ExternalLink size={11} />
                  {meta.keyLinkLabel} →
                </a>
              )}
            </>
          )}

          {/* Advanced settings collapse */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-[11px] mt-1"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            {showAdvanced ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            高级设置（Base URL · 模型 · Token 数）
          </button>

          {showAdvanced && (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-2 gap-3">
                <SettingField label="Base URL">
                  <input
                    value={active.baseUrl}
                    onChange={(e) => updateProvider(active.id, { baseUrl: e.target.value })}
                    className="mac-input"
                    style={{ fontSize: 12 }}
                  />
                </SettingField>
                <SettingField label="Model">
                  <input
                    value={active.model}
                    onChange={(e) => updateProvider(active.id, { model: e.target.value })}
                    className="mac-input"
                    style={{ fontSize: 12 }}
                  />
                </SettingField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <SettingField label="Max Tokens">
                  <input
                    type="number"
                    value={active.maxTokens}
                    onChange={(e) => updateProvider(active.id, { maxTokens: parseInt(e.target.value) || 4096 })}
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
                    value={active.temperature}
                    onChange={(e) => updateProvider(active.id, { temperature: parseFloat(e.target.value) || 0.7 })}
                    className="mac-input"
                    style={{ fontSize: 12 }}
                  />
                </SettingField>
              </div>
              {active.id !== 'openai' && active.id !== 'deepseek' && active.id !== 'qwen' && active.id !== 'ollama' && (
                <button
                  onClick={() => handleRemoveProvider(active.id)}
                  className="text-[11px] flex items-center gap-1"
                  style={{ color: 'var(--color-danger)' }}
                >
                  <Trash2 size={11} />
                  删除此提供商
                </button>
              )}
            </div>
          )}
        </div>
      )}
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
          {(['light', 'dark', 'system'] as const).map((theme) => (
            <button
              key={theme}
              onClick={() => {
                updateSettings({ theme });
                if (theme === 'system') {
                  document.documentElement.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches);
                } else {
                  document.documentElement.classList.toggle('dark', theme === 'dark');
                }
              }}
              className="flex-1 px-3 py-2.5 text-[12px] font-medium rounded-xl transition-all"
              style={{
                border: settings.theme === theme ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                background: settings.theme === theme ? 'var(--color-primary-light)' : 'transparent',
                color: settings.theme === theme ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              }}
            >
              {theme === 'light' ? '☀️ 浅色' : theme === 'dark' ? '🌙 深色' : '🌓 跟随系统'}
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

function GitHubSettings() {
  const { config, saveConfig, clearConfig, loadConfig } = useGitHubSyncStore();
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [status, setStatus] = useState<'idle' | 'validating' | 'valid' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [username, setUsername] = useState('');

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Pre-fill from existing config
  useEffect(() => {
    if (config) {
      setToken(config.token);
      setUsername(config.username);
      setStatus('valid');
    }
  }, [config]);

  const handleValidateAndSave = async () => {
    if (!token.trim()) return;
    setStatus('validating');
    setErrorMsg('');
    try {
      const user = await validateToken(token.trim());
      setUsername(user);
      await saveConfig({
        token: token.trim(),
        owner: config?.owner || '',
        repo: config?.repo || '',
        branch: config?.branch || 'main',
        path: config?.path || '',
        username: user,
      });
      setStatus('valid');
    } catch (e) {
      setStatus('error');
      setErrorMsg(e instanceof Error ? e.message : '验证失败');
    }
  };

  const handleDisconnect = async () => {
    await clearConfig();
    setToken('');
    setUsername('');
    setStatus('idle');
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 mb-3">
        <GitFork size={16} style={{ color: 'var(--color-text)' }} />
        <span className="text-[13px] font-medium">将笔记推送到 GitHub 仓库</span>
      </div>

      <p className="text-[12px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
        配置 Token 后，在编辑器工具栏点击「推送」按钮，每次可选择目标仓库和路径。
      </p>

      {/* Current connection status */}
      {config && status === 'valid' && (
        <div
          className="flex items-center justify-between p-3 rounded-xl"
          style={{ background: 'var(--color-success-subtle, rgba(52,199,89,0.08))', border: '1px solid var(--color-success, #34c759)' }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle size={14} style={{ color: 'var(--color-success, #34c759)' }} />
            <span className="text-[12px]">
              已连接 <strong>@{username}</strong>
            </span>
          </div>
          <button
            onClick={handleDisconnect}
            className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg transition-all"
            style={{ color: 'var(--color-danger)', background: 'rgba(255,59,48,0.08)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,59,48,0.15)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,59,48,0.08)')}
          >
            <Unlink size={11} />
            断开
          </button>
        </div>
      )}

      {/* Token input */}
      <SettingField label="Personal Access Token">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={(e) => { setToken(e.target.value); if (status !== 'idle') setStatus('idle'); }}
              className="mac-input w-full pr-8"
              style={{ fontSize: 12 }}
              placeholder="ghp_xxxx 或 github_pat_xxxx"
            />
            <button
              onClick={() => setShowToken(!showToken)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              {showToken ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
          <button
            onClick={handleValidateAndSave}
            disabled={!token.trim() || status === 'validating'}
            className="mac-btn flex items-center gap-1 whitespace-nowrap"
            style={{ fontSize: 12, padding: '4px 12px', opacity: !token.trim() ? 0.5 : 1 }}
          >
            {status === 'validating' ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
            {config ? '更新' : '验证并保存'}
          </button>
        </div>
        <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
          需要 <code className="text-[10px]" style={{ background: 'var(--color-bg-tertiary)', padding: '1px 4px', borderRadius: 3 }}>Contents: Read and write</code> 权限。
          <a
            href="https://github.com/settings/tokens?type=beta"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1"
            style={{ color: 'var(--color-primary)' }}
          >
            创建 Token →
          </a>
        </p>
      </SettingField>

      {/* Error */}
      {status === 'error' && (
        <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--color-danger)' }}>
          <AlertCircle size={13} />
          {errorMsg}
        </div>
      )}
    </div>
  );
}
