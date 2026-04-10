import { X, ExternalLink } from 'lucide-react';
import { useUIStore } from '@/stores';

export function ApiKeyAlert() {
  const { showApiKeyAlert, setShowApiKeyAlert } = useUIStore();

  if (!showApiKeyAlert) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40" onClick={() => setShowApiKeyAlert(false)}>
      <div
        className="w-[420px] rounded-xl shadow-2xl border overflow-hidden"
        style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <h3 className="text-[15px] font-semibold">需要配置 API Key</h3>
          <button
            onClick={() => setShowApiKeyAlert(false)}
            className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            <X size={14} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            使用 AI 功能前，请先在<strong>设置 → API 配置</strong>中填写 API Key。
          </p>
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            默认使用 DeepSeek 模型，你可以在下方链接注册并获取 API Key：
          </p>
          <a
            href="https://platform.deepseek.com/api_keys"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-medium transition-colors"
            style={{
              background: 'var(--color-primary-light)',
              color: 'var(--color-primary)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            <ExternalLink size={14} />
            DeepSeek API 平台
          </a>
        </div>
        <div className="px-5 py-3 flex justify-end" style={{ borderTop: '1px solid var(--color-border)' }}>
          <button
            onClick={() => setShowApiKeyAlert(false)}
            className="mac-btn mac-btn-primary"
            style={{ fontSize: 12, padding: '6px 16px' }}
          >
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
}
