import { useState, useEffect, useCallback } from 'react';
import { X, GitBranch, Loader2, CheckCircle, AlertCircle, FolderOpen } from 'lucide-react';
import { useGitHubSyncStore } from '@/stores';
import { listRepos, pushFile, toFilename } from '@/lib/github';
import type { GitHubConfig } from '@/lib/github';

interface SyncDialogProps {
  open: boolean;
  onClose: () => void;
  /** Markdown content to sync (with annotations already serialized) */
  content: string;
  /** Document title for default filename */
  title: string;
}

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function SyncDialog({ open, onClose, content, title }: SyncDialogProps) {
  const { config, saveConfig, setSyncing, setLastSyncedAt } = useGitHubSyncStore();

  // Repo list
  const [repos, setRepos] = useState<{ full_name: string; default_branch: string }[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);

  // Per-sync choices (pre-filled from last sync)
  const [selectedRepo, setSelectedRepo] = useState('');
  const [branch, setBranch] = useState('main');
  const [path, setPath] = useState('');
  const [filename, setFilename] = useState('');
  const [date, setDate] = useState(todayString());
  const [commitMsg, setCommitMsg] = useState('');

  // Status
  const [syncing, setSyncingLocal] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Pre-fill from saved config
  useEffect(() => {
    if (open && config) {
      if (config.owner && config.repo) {
        setSelectedRepo(`${config.owner}/${config.repo}`);
      }
      if (config.branch) setBranch(config.branch);
      if (config.path) setPath(config.path);
      setFilename(toFilename(title));
      setDate(todayString());
      setCommitMsg(`Update ${title} via MarginLens`);
      setStatus('idle');
      setErrorMsg('');
    }
  }, [open, config, title]);

  // Load repos on open
  const loadRepoList = useCallback(async () => {
    if (!config?.token) return;
    setLoadingRepos(true);
    try {
      const list = await listRepos(config.token);
      setRepos(list);
      // If no repo selected yet, pick the first one
      if (!selectedRepo && list.length > 0) {
        setSelectedRepo(list[0].full_name);
        setBranch(list[0].default_branch);
      }
    } catch {
      // silent — user can still type
    } finally {
      setLoadingRepos(false);
    }
  }, [config?.token, selectedRepo]);

  useEffect(() => {
    if (open) loadRepoList();
  }, [open, loadRepoList]);

  const handleSync = async () => {
    if (!config?.token || !selectedRepo || !filename.trim()) return;
    const [owner, repo] = selectedRepo.split('/');
    if (!owner || !repo) return;

    setSyncingLocal(true);
    setSyncing(true);
    setStatus('idle');
    setErrorMsg('');

    try {
      const ghConfig: GitHubConfig = {
        token: config.token,
        owner,
        repo,
        branch,
        path: path.replace(/^\/+|\/+$/g, ''),
      };

      // Build content with frontmatter
      const frontmatter = `---\ndate: ${date}\n---\n\n`;
      const finalContent = frontmatter + content;

      await pushFile(ghConfig, filename.trim(), finalContent, commitMsg || `Update ${title} via MarginLens`);

      // Save last-used repo/branch/path for convenience
      await saveConfig({
        ...config,
        owner,
        repo,
        branch,
        path: path.replace(/^\/+|\/+$/g, ''),
      });

      setLastSyncedAt(Date.now());
      setStatus('success');
    } catch (e) {
      setStatus('error');
      setErrorMsg(e instanceof Error ? e.message : '同步失败');
    } finally {
      setSyncingLocal(false);
      setSyncing(false);
    }
  };

  if (!open) return null;

  const fullPath = [selectedRepo, branch, path, filename].filter(Boolean).join(' / ');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="w-[520px] max-h-[85vh] rounded-2xl overflow-hidden flex flex-col animate-scale-in"
        style={{
          backgroundColor: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-strong)',
          boxShadow: 'var(--shadow-xl)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center gap-2">
            <GitBranch size={15} style={{ color: 'var(--color-primary)' }} />
            <h2 className="text-[14px] font-semibold tracking-tight">推送到 GitHub</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-all"
            style={{ color: 'var(--color-text-tertiary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-card-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Target preview */}
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-mono"
            style={{
              background: 'var(--color-bg-tertiary)',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
            }}
          >
            <FolderOpen size={12} style={{ flexShrink: 0 }} />
            <span className="truncate">{fullPath || '选择目标位置...'}</span>
          </div>

          {/* Repo */}
          <Field label="仓库">
            <select
              value={selectedRepo}
              onChange={(e) => {
                setSelectedRepo(e.target.value);
                const r = repos.find((r) => r.full_name === e.target.value);
                if (r) setBranch(r.default_branch);
              }}
              className="mac-input w-full"
              style={{ fontSize: 12 }}
              disabled={loadingRepos}
            >
              {loadingRepos && <option>加载中...</option>}
              {repos.map((r) => (
                <option key={r.full_name} value={r.full_name}>{r.full_name}</option>
              ))}
            </select>
          </Field>

          {/* Branch + Path */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="分支">
              <input
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="mac-input w-full"
                style={{ fontSize: 12 }}
                placeholder="main"
              />
            </Field>
            <Field label="目录路径">
              <input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                className="mac-input w-full"
                style={{ fontSize: 12 }}
                placeholder="例如 _posts 或 notes"
              />
            </Field>
          </div>

          {/* Filename */}
          <Field label="文件名">
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="mac-input w-full"
              style={{ fontSize: 12 }}
              placeholder="my-note.md"
            />
          </Field>

          {/* Date + Commit message */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Frontmatter 日期">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mac-input w-full"
                style={{ fontSize: 12 }}
              />
            </Field>
            <Field label="Commit 信息">
              <input
                type="text"
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                className="mac-input w-full"
                style={{ fontSize: 12 }}
                placeholder="Update via MarginLens"
              />
            </Field>
          </div>

          {/* Frontmatter preview */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              文件头预览
            </label>
            <pre
              className="px-3 py-2 rounded-lg text-[11px] font-mono leading-relaxed"
              style={{
                background: 'var(--color-bg-tertiary)',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border)',
              }}
            >
              {`---\ndate: ${date}\n---`}
            </pre>
          </div>

          {/* Error */}
          {status === 'error' && (
            <div className="flex items-center gap-2 text-[12px] px-3 py-2 rounded-lg"
              style={{ color: 'var(--color-danger)', background: 'rgba(255,59,48,0.06)' }}>
              <AlertCircle size={13} />
              {errorMsg}
            </div>
          )}

          {/* Success */}
          {status === 'success' && (
            <div className="flex items-center gap-2 text-[12px] px-3 py-2 rounded-lg"
              style={{ color: 'var(--color-success, #34c759)', background: 'rgba(52,199,89,0.06)' }}>
              <CheckCircle size={13} />
              已成功推送到 {selectedRepo}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-3 flex-shrink-0"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          <button
            onClick={onClose}
            className="mac-btn"
            style={{ fontSize: 12, padding: '5px 16px' }}
          >
            {status === 'success' ? '完成' : '取消'}
          </button>
          {status !== 'success' && (
            <button
              onClick={handleSync}
              disabled={syncing || !selectedRepo || !filename.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 text-[12px] font-medium rounded-lg transition-all"
              style={{
                background: 'var(--color-primary)',
                color: '#fff',
                opacity: syncing || !selectedRepo || !filename.trim() ? 0.5 : 1,
              }}
              onMouseEnter={(e) => { if (!syncing) e.currentTarget.style.opacity = '0.85'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = (!selectedRepo || !filename.trim()) ? '0.5' : '1'; }}
            >
              {syncing ? <Loader2 size={12} className="animate-spin" /> : <GitBranch size={12} />}
              {syncing ? '推送中...' : '推送'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>{label}</label>
      {children}
    </div>
  );
}
