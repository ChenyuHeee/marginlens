import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, User, LogOut, Pencil, Check, Mail, KeyRound } from 'lucide-react';
import { getMyProfile, upsertProfile, type Profile } from '@/lib/profiles';
import { useAuthStore } from '@/stores';
import { getSupabase } from '@/lib/supabase';

interface AccountDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AccountDialog({ open, onClose }: AccountDialogProps) {
  const { user, signOut } = useAuthStore();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);

  // Nickname edit state
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState('');

  // Password reset state
  const [pwSent, setPwSent] = useState(false);
  const [pwSending, setPwSending] = useState(false);
  const [pwError, setPwError] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setEditingName(false);
    setPwSent(false);
    setPwError('');
    setNameError('');
    getMyProfile().then((p) => {
      setProfile(p);
      setNameValue(p?.username ?? '');
      setLoading(false);
    });
  }, [open]);

  if (!open) return null;

  const handleSaveName = async () => {
    const trimmed = nameValue.trim();
    if (!trimmed) { setNameError('请输入昵称'); return; }
    if (!/^[\w\u4e00-\u9fa5-]{2,20}$/.test(trimmed)) {
      setNameError('2-20 位，支持字母、数字、中文、下划线、连字符');
      return;
    }
    setNameSaving(true);
    setNameError('');
    const result = await upsertProfile(trimmed);
    setNameSaving(false);
    if (result.error) { setNameError(result.error); return; }
    setProfile((prev) => prev ? { ...prev, username: trimmed } : null);
    setEditingName(false);
  };

  const handleResetPassword = async () => {
    if (!user?.email) return;
    const supabase = getSupabase();
    if (!supabase) return;
    setPwSending(true);
    setPwError('');
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    setPwSending(false);
    if (error) { setPwError(error.message); return; }
    setPwSent(true);
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
        className="w-[380px] rounded-2xl overflow-hidden animate-scale-in"
        style={{
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-strong)',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-[15px] font-bold"
              style={{ background: profile?.color ?? 'var(--color-primary-subtle)', color: profile?.color ? '#fff' : 'var(--color-primary)' }}
            >
              {profile?.username ? profile.username.slice(0, 1).toUpperCase() : <User size={18} />}
            </div>
            <div>
              <h2 className="text-[15px] font-semibold leading-tight" style={{ color: 'var(--color-text)' }}>
                账户信息
              </h2>
              <p className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                管理你的个人资料与安全设置
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
          <div className="py-10 flex justify-center">
            <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
          </div>
        ) : (
          <div
            className="divide-y"
            style={{ borderTop: '1px solid var(--color-border)', '--tw-divide-opacity': 1 } as React.CSSProperties}
          >
            {/* Nickname row */}
            <div className="px-5 py-4">
              <div className="flex items-center gap-2 mb-1">
                <User size={13} style={{ color: 'var(--color-text-tertiary)' }} />
                <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>昵称</span>
              </div>
              {editingName ? (
                <div className="space-y-1.5 mt-2">
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={nameValue}
                      onChange={(e) => { setNameValue(e.target.value); setNameError(''); }}
                      className="mac-input flex-1 text-[13px]"
                      style={{ height: 34 }}
                      maxLength={20}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
                    />
                    <button
                      onClick={handleSaveName}
                      disabled={nameSaving || !nameValue.trim()}
                      className="mac-btn px-3 gap-1 text-[12px]"
                      style={{ height: 34, background: 'var(--color-primary)', color: '#fff', border: 'none', opacity: nameSaving || !nameValue.trim() ? 0.6 : 1 }}
                    >
                      <Check size={12} />
                      {nameSaving ? '保存…' : '确认'}
                    </button>
                    <button
                      onClick={() => { setEditingName(false); setNameValue(profile?.username ?? ''); setNameError(''); }}
                      className="mac-btn px-3 text-[12px]"
                      style={{ height: 34 }}
                    >
                      取消
                    </button>
                  </div>
                  {nameError && <p className="text-[11px]" style={{ color: 'var(--color-danger)' }}>{nameError}</p>}
                  <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>2-20 位，支持中文、字母、数字、下划线、连字符</p>
                </div>
              ) : (
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[14px] font-medium" style={{ color: profile?.username ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}>
                    {profile?.username ?? '未设置'}
                  </span>
                  <button
                    onClick={() => { setEditingName(true); setNameValue(profile?.username ?? ''); }}
                    className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md transition-colors"
                    style={{ color: 'var(--color-primary)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-primary-subtle)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
                  >
                    <Pencil size={11} />
                    修改
                  </button>
                </div>
              )}
            </div>

            {/* Email row */}
            <div className="px-5 py-4">
              <div className="flex items-center gap-2 mb-1">
                <Mail size={13} style={{ color: 'var(--color-text-tertiary)' }} />
                <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>邮箱</span>
              </div>
              <p className="text-[14px] mt-1" style={{ color: 'var(--color-text)' }}>{user?.email}</p>
            </div>

            {/* Password row */}
            <div className="px-5 py-4">
              <div className="flex items-center gap-2 mb-1">
                <KeyRound size={13} style={{ color: 'var(--color-text-tertiary)' }} />
                <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>密码</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
                  {pwSent ? '✓ 重置邮件已发送，请查收' : '通过邮件链接重置密码'}
                </span>
                {!pwSent && (
                  <button
                    onClick={handleResetPassword}
                    disabled={pwSending}
                    className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md transition-colors"
                    style={{ color: 'var(--color-primary)', opacity: pwSending ? 0.6 : 1 }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-primary-subtle)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
                  >
                    {pwSending ? '发送中…' : '发送重置邮件'}
                  </button>
                )}
              </div>
              {pwError && <p className="text-[11px] mt-1" style={{ color: 'var(--color-danger)' }}>{pwError}</p>}
            </div>

            {/* Sign out */}
            <div className="px-5 py-4">
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 text-[13px] px-2 py-1.5 rounded-lg transition-colors w-full"
                style={{ color: 'var(--color-danger)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.06)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
              >
                <LogOut size={14} />
                退出登录
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
