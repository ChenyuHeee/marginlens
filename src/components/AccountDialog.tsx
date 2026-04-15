import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, User, LogOut } from 'lucide-react';
import { getMyProfile, upsertProfile, type Profile } from '@/lib/profiles';
import { useAuthStore } from '@/stores';

interface AccountDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AccountDialog({ open, onClose }: AccountDialogProps) {
  const { user, signOut } = useAuthStore();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError('');
    setSaved(false);
    getMyProfile().then((p) => {
      setProfile(p);
      setUsername(p?.username ?? '');
      setLoading(false);
    });
  }, [open]);

  if (!open) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = username.trim();
    if (!trimmed) { setError('请输入用户名'); return; }
    if (!/^[\w\u4e00-\u9fa5-]{2,20}$/.test(trimmed)) {
      setError('用户名 2-20 位，支持字母、数字、中文、下划线、连字符');
      return;
    }
    setSaving(true);
    setError('');
    const result = await upsertProfile(trimmed);
    setSaving(false);
    if (result.error) { setError(result.error); return; }
    setProfile((prev) => prev ? { ...prev, username: trimmed } : { id: user?.id ?? '', username: trimmed, email: user?.email ?? '', color: '#6366f1', created_at: '' });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSignOut = async () => {
    onClose();
    await signOut();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-[360px] rounded-2xl p-6 animate-scale-in"
        style={{
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-strong)',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--color-primary-subtle)' }}
            >
              <User size={18} style={{ color: 'var(--color-primary)' }} />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold leading-tight" style={{ color: 'var(--color-text)' }}>
                账户信息
              </h2>
              <p className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                {user?.email}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--color-text-tertiary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
          >
            <X size={15} />
          </button>
        </div>

        {loading ? (
          <div className="py-6 flex justify-center">
            <div
              className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }}
            />
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
                昵称
              </label>
              <input
                autoFocus
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(''); setSaved(false); }}
                placeholder=""
                className="mac-input w-full text-[14px]"
                style={{ height: 40 }}
                maxLength={20}
              />
              {error && (
                <p className="text-[12px]" style={{ color: 'var(--color-danger)' }}>{error}</p>
              )}
              <p className="text-[10.5px]" style={{ color: 'var(--color-text-tertiary)' }}>
                2-20 位，用于协同编辑中的身份标识
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={saving || !username.trim() || username.trim() === profile?.username}
                className="flex-1 mac-btn justify-center py-2 text-[13px]"
                style={{
                  background: saved ? 'var(--color-success, #22c55e)' : 'var(--color-primary)',
                  color: '#fff',
                  border: 'none',
                  opacity: saving || (!username.trim() || username.trim() === profile?.username) ? 0.6 : 1,
                  transition: 'background 0.3s',
                }}
              >
                {saving ? '保存中…' : saved ? '✓ 已保存' : '保存修改'}
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="mac-btn gap-1.5 px-4 py-2 text-[13px]"
                style={{ color: 'var(--color-danger)', borderColor: 'var(--color-danger)', opacity: 0.85 }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.85'; }}
              >
                <LogOut size={13} />
                退出
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
