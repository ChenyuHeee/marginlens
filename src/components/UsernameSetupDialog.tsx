import { useState } from 'react';
import { createPortal } from 'react-dom';
import { User } from 'lucide-react';
import { upsertProfile } from '@/lib/profiles';

interface UsernameSetupDialogProps {
  open: boolean;
  onComplete: () => void;
}

export function UsernameSetupDialog({ open, onComplete }: UsernameSetupDialogProps) {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = username.trim();
    if (!trimmed) { setError('请输入用户名'); return; }
    if (!/^[\w\u4e00-\u9fa5-]{2,20}$/.test(trimmed)) {
      setError('用户名 2-20 位，支持字母、数字、中文、下划线、连字符');
      return;
    }
    setLoading(true);
    setError('');
    const result = await upsertProfile(trimmed);
    setLoading(false);
    if (result.error) { setError(result.error); return; }
    onComplete();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="w-[360px] rounded-2xl p-6 animate-scale-in"
        style={{
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-strong)',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'var(--color-primary-subtle)' }}
          >
            <User size={18} style={{ color: 'var(--color-primary)' }} />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold" style={{ color: 'var(--color-text)' }}>设置用户名</h2>
            <p className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>用于协同编辑中的身份标识</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            autoFocus
            value={username}
            onChange={(e) => { setUsername(e.target.value); setError(''); }}
            placeholder=""
            className="mac-input w-full text-[14px]"
            style={{ height: 40 }}
            maxLength={20}
          />
          {error && (
            <p className="text-[12px]" style={{ color: 'var(--color-danger)' }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !username.trim()}
            className="w-full mac-btn justify-center py-2 text-[13px]"
            style={{
              background: 'var(--color-primary)',
              color: '#fff',
              border: 'none',
              opacity: loading || !username.trim() ? 0.6 : 1,
            }}
          >
            {loading ? '保存中…' : '确认'}
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
}
