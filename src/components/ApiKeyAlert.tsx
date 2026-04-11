import { X, ExternalLink, Key } from 'lucide-react';
import { useUIStore } from '@/stores';

export function ApiKeyAlert() {
  const { showApiKeyAlert, setShowApiKeyAlert } = useUIStore();

  if (!showApiKeyAlert) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center modal-backdrop"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={() => setShowApiKeyAlert(false)}
    >
      <div
        className="w-[420px] rounded-2xl overflow-hidden animate-scale-in"
        style={{
          backgroundColor: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-strong)',
          boxShadow: 'var(--shadow-xl)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--color-warning)', color: 'white' }}
            >
              <Key size={15} />
            </div>
            <h3 className="text-[15px] font-semibold">需要配置 API Key</h3>
          </div>
          <button
            onClick={() => setShowApiKeyAlert(false)}
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
            <X size={14} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            使用 AI 功能前，请先在<strong style={{ color: 'var(--color-text)' }}>设置 → API 配置</strong>中填写 API Key。
          </p>
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            默认使用 DeepSeek 模型，你可以在下方链接注册并获取 API Key：
          </p>
          <a
            href="https://platform.deepseek.com/api_keys"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-[13px] font-medium transition-all"
            style={{
              background: 'var(--color-primary-light)',
              color: 'var(--color-primary)',
              border: '1px solid var(--color-annotation-border)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-primary-subtle)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-primary-light)')}
          >
            <ExternalLink size={14} />
            DeepSeek API 平台
          </a>
        </div>
        <div className="px-5 py-3 flex justify-end" style={{ borderTop: '1px solid var(--color-border)' }}>
          <button
            onClick={() => setShowApiKeyAlert(false)}
            className="mac-btn mac-btn-primary"
            style={{ fontSize: 12.5, padding: '7px 18px', borderRadius: 'var(--radius-sm)' }}
          >
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
}
