import { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowLeft, RefreshCw, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { useAnnotationStore, useSettingsStore } from '@/stores';
import { getAnnotationsByDocument, getDocument, getTeachingSite, saveTeachingSite, deleteTeachingSite } from '@/lib/db';
import { generateTeachingSite, type Progress, type Stage } from '@/lib/teaching/pipeline';
import type { TeachingSite } from '@/lib/teaching/templates';
import { ModuleRenderer } from './teaching/Modules';

interface TeachingViewProps {
  documentId: string;
  onClose: () => void;
}

const STAGE_LABELS: Record<Stage, string> = {
  planner: '编排',
  generator: '生成',
  reviewer: '审校',
};

export function TeachingView({ documentId, onClose }: TeachingViewProps) {
  const [site, setSite] = useState<TeachingSite | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [docTitle, setDocTitle] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(async (force = false) => {
    setError(null);
    setLoading(true);
    setProgress({ stage: 'planner', fraction: 0, message: '加载笔记…' });

    try {
      const doc = await getDocument(documentId);
      if (!doc) throw new Error('找不到该笔记');
      setDocTitle(doc.title);

      if (!force) {
        const cached = await getTeachingSite(documentId);
        if (cached) {
          setSite(cached);
          setLoading(false);
          setProgress(null);
          return;
        }
      } else {
        await deleteTeachingSite(documentId);
      }

      const provider = useSettingsStore.getState().getActiveProvider();
      if (!provider || !provider.apiKey) {
        throw new Error('尚未配置可用的 LLM Provider，请前往设置添加 API Key');
      }

      const annotations = await getAnnotationsByDocument(documentId);
      // also seed annotation store so subsequent reads are consistent
      useAnnotationStore.setState((s) => ({
        annotations: [
          ...s.annotations.filter((a) => a.documentId !== documentId),
          ...annotations,
        ],
      }));

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const result = await generateTeachingSite(doc, annotations, provider, {
        signal: ctrl.signal,
        onProgress: (p) => setProgress(p),
      });
      await saveTeachingSite(result);
      setSite(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }, [documentId]);

  useEffect(() => {
    generate(false);
    return () => { abortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  return (
    <div className="h-full overflow-auto" style={{ background: 'var(--color-bg)' }}>
      {/* Top bar */}
      <header
        className="sticky top-0 z-10 flex items-center justify-between px-6 py-3"
        style={{
          background: 'color-mix(in srgb, var(--color-bg) 88%, transparent)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <button
          onClick={onClose}
          className="mac-btn flex items-center gap-1"
          style={{ fontSize: 12, padding: '4px 12px' }}
        >
          <ArrowLeft size={12} /> 返回笔记
        </button>
        <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
          <Sparkles size={12} />
          <span className="truncate max-w-[40vw]">{site?.title || docTitle || '互动学习'}</span>
        </div>
        <button
          onClick={() => generate(true)}
          disabled={loading}
          className="mac-btn flex items-center gap-1 disabled:opacity-50"
          style={{ fontSize: 12, padding: '4px 12px' }}
          title="重新由三个 Agent 生成"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          重新生成
        </button>
      </header>

      {/* Body */}
      <main className="max-w-4xl mx-auto px-6 py-10 space-y-6">
        {loading && progress && (
          <ProgressPanel progress={progress} />
        )}

        {error && (
          <div
            className="rounded-2xl p-6 flex items-start gap-3"
            style={{ background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.30)' }}
          >
            <AlertCircle size={18} className="text-rose-500 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold mb-1" style={{ color: 'var(--color-text)' }}>生成失败</div>
              <div className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>{error}</div>
              <button
                onClick={() => generate(true)}
                className="mt-3 mac-btn flex items-center gap-1"
                style={{ fontSize: 12, padding: '4px 12px' }}
              >
                <RefreshCw size={12} /> 重试
              </button>
            </div>
          </div>
        )}

        {!loading && !error && site && site.modules.length > 0 && (
          <>
            {site.modules.map((m, i) => (
              <ModuleRenderer key={m.id || i} module={m} />
            ))}
            {site.reviewerNotes && site.reviewerNotes.length > 0 && (
              <details
                className="rounded-2xl p-4 text-[12px]"
                style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)' }}
              >
                <summary className="cursor-pointer font-medium" style={{ color: 'var(--color-text)' }}>
                  审校记录（{site.reviewerNotes.length}）
                </summary>
                <ul className="mt-2 list-disc list-inside space-y-1">
                  {site.reviewerNotes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              </details>
            )}
            <footer className="text-center text-[11px] pt-4" style={{ color: 'var(--color-text-tertiary)' }}>
              由 {site.model || 'LLM'} 生成 · {new Date(site.generatedAt).toLocaleString()}
            </footer>
          </>
        )}
      </main>
    </div>
  );
}

function ProgressPanel({ progress }: { progress: Progress }) {
  const stages: Stage[] = ['planner', 'generator', 'reviewer'];
  const currentIdx = stages.indexOf(progress.stage);
  return (
    <div
      className="rounded-2xl p-8"
      style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-strong)' }}
    >
      <div className="flex items-center gap-3 mb-6">
        <Loader2 size={18} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
        <div className="text-[15px] font-medium">{progress.message || '生成中…'}</div>
      </div>
      <div className="flex items-center gap-3">
        {stages.map((s, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          return (
            <div key={s} className="flex-1 flex items-center gap-3">
              <div
                className="flex items-center gap-2 text-[12px] flex-1"
                style={{ color: active || done ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}
              >
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold"
                  style={{
                    background: done ? 'var(--color-primary)' : active ? 'var(--color-primary-light)' : 'var(--color-bg-tertiary)',
                    color: done ? '#fff' : active ? 'var(--color-primary)' : 'var(--color-text-tertiary)',
                  }}
                >
                  {i + 1}
                </span>
                {STAGE_LABELS[s]}
              </div>
              {i < stages.length - 1 && (
                <div className="flex-1 h-px" style={{ background: 'var(--color-border-strong)' }} />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-6 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-bg-tertiary)' }}>
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${Math.round(progress.fraction * 100)}%`, background: 'var(--color-primary)' }}
        />
      </div>
    </div>
  );
}
