import { useState } from 'react';
import { useAuthStore } from '@/stores';
import { X, Mail, Lock, Loader2, LogIn, UserPlus } from 'lucide-react';

interface AuthDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AuthDialog({ open, onClose }: AuthDialogProps) {
  const { signIn, signUp } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email.trim() || !password.trim()) {
      setError('请填写邮箱和密码');
      return;
    }

    if (mode === 'signup') {
      if (password.length < 6) {
        setError('密码至少需要 6 个字符');
        return;
      }
      if (password !== confirmPassword) {
        setError('两次输入的密码不一致');
        return;
      }
    }

    setLoading(true);
    const result = mode === 'login'
      ? await signIn(email, password)
      : await signUp(email, password);

    setLoading(false);

    if (result.error) {
      setError(result.error);
    } else if (mode === 'signup') {
      setSuccess('注册成功！请检查邮箱以确认账号，然后登录。');
      setMode('login');
    } else {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-[380px] rounded-2xl shadow-2xl animate-fade-in overflow-hidden"
        style={{
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <div>
            <h2 className="text-[15px] font-semibold" style={{ color: 'var(--color-text)' }}>
              {mode === 'login' ? '登录' : '注册'}
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
              登录后可自动备份文档和设置到云端
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--color-text-tertiary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-card-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>
              邮箱
            </label>
            <div className="relative">
              <Mail size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-tertiary)' }} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
                className="mac-input w-full"
                style={{
                  fontSize: 12.5,
                  padding: '8px 10px 8px 30px',
                  borderRadius: 'var(--radius-sm)',
                }}
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>
              密码
            </label>
            <div className="relative">
              <Lock size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-tertiary)' }} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                className="mac-input w-full"
                style={{
                  fontSize: 12.5,
                  padding: '8px 10px 8px 30px',
                  borderRadius: 'var(--radius-sm)',
                }}
              />
            </div>
          </div>

          {mode === 'signup' && (
            <div>
              <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>
                确认密码
              </label>
              <div className="relative">
                <Lock size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-tertiary)' }} />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••"
                  className="mac-input w-full"
                  style={{
                    fontSize: 12.5,
                    padding: '8px 10px 8px 30px',
                    borderRadius: 'var(--radius-sm)',
                  }}
                />
              </div>
            </div>
          )}

          {error && (
            <p className="text-[11.5px] px-1" style={{ color: 'var(--color-danger)' }}>{error}</p>
          )}
          {success && (
            <p className="text-[11.5px] px-1" style={{ color: 'var(--color-primary)' }}>{success}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mac-btn-primary w-full justify-center gap-2"
            style={{
              fontSize: 12.5,
              padding: '9px 0',
              borderRadius: 'var(--radius-sm)',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : mode === 'login' ? <LogIn size={14} /> : <UserPlus size={14} />}
            {mode === 'login' ? '登录' : '注册'}
          </button>
        </form>

        {/* Footer switch */}
        <div
          className="px-5 py-3 text-center"
          style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)' }}
        >
          <button
            type="button"
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setSuccess(''); }}
            className="text-[11.5px]"
            style={{ color: 'var(--color-primary)' }}
          >
            {mode === 'login' ? '没有账号？立即注册' : '已有账号？立即登录'}
          </button>
        </div>
      </div>
    </div>
  );
}
