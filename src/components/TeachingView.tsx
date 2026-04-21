import { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowLeft, RefreshCw, Loader2, AlertCircle, ChevronLeft, ChevronRight, Share2, Check } from 'lucide-react';
import { useAnnotationStore, useSettingsStore } from '@/stores';
import { getAnnotationsByDocument, getDocument, getTeachingSite, saveTeachingSite, deleteTeachingSite } from '@/lib/db';
import { generateTeachingSite, type Progress, type Stage } from '@/lib/teaching/pipeline';
import type { TeachingSite } from '@/lib/teaching/templates';
import { createTeachingShare, buildTeachingShareUrl } from '@/lib/teachingShare';
import { PresentationSlide, getSteps } from './teaching/PresentationSlide';

interface TeachingViewProps {
  documentId: string;
  onClose: () => void;
}

const STAGE_LABELS: Record<Stage, string> = {
  planner: '编排结构',
  generator: '生成内容',
  reviewer: '审校校对',
};

export function TeachingView({ documentId, onClose }: TeachingViewProps) {
  const [site, setSite] = useState<TeachingSite | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [docTitle, setDocTitle] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // Share state
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  // Presentation navigation state
  const [slideIdx, setSlideIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [transKey, setTransKey] = useState(0); // increment → triggers entry animation

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
          setSlideIdx(0); setStepIdx(0); setTransKey((k) => k + 1);
          setLoading(false); setProgress(null);
          return;
        }
      } else {
        await deleteTeachingSite(documentId);
      }

      const provider = useSettingsStore.getState().getActiveProvider();
      if (!provider?.apiKey) throw new Error('尚未配置可用的 LLM Provider，请前往设置添加 API Key');

      const annotations = await getAnnotationsByDocument(documentId);
      useAnnotationStore.setState((s) => ({
        annotations: [...s.annotations.filter((a) => a.documentId !== documentId), ...annotations],
      }));

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const result = await generateTeachingSite(doc, annotations, provider, {
        signal: ctrl.signal,
        onProgress: (p) => setProgress(p),
      });
      await saveTeachingSite(result);
      setSite(result);
      setSlideIdx(0); setStepIdx(0); setTransKey((k) => k + 1);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError((e as Error).message);
    } finally {
      setLoading(false); setProgress(null);
    }
  }, [documentId]);

  useEffect(() => {
    generate(false);
    return () => { abortRef.current?.abort(); };
  }, [generate]);

  const modules = site?.modules ?? [];
  const curModule = modules[slideIdx] ?? null;
  const maxSteps = curModule ? getSteps(curModule) : 1;
  const atStart = slideIdx === 0 && stepIdx === 0;
  const atEnd = slideIdx >= modules.length - 1 && stepIdx >= maxSteps - 1;

  const goNext = useCallback(() => {
    if (!site || loading || error) return;
    if (stepIdx < maxSteps - 1) {
      setStepIdx((s) => s + 1);
    } else if (slideIdx < modules.length - 1) {
      setSlideIdx((s) => s + 1);
      setStepIdx(0);
      setTransKey((k) => k + 1);
    }
  }, [site, loading, error, slideIdx, stepIdx, maxSteps, modules.length]);

  const goPrev = useCallback(() => {
    if (!site || loading || error) return;
    if (stepIdx > 0) {
      setStepIdx((s) => s - 1);
    } else if (slideIdx > 0) {
      const prevIdx = slideIdx - 1;
      setSlideIdx(prevIdx);
      setStepIdx(getSteps(modules[prevIdx]) - 1);
      setTransKey((k) => k + 1);
    }
  }, [site, loading, error, slideIdx, stepIdx, modules]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); goNext(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev, onClose]);

  const progressFraction = modules.length > 0
    ? (slideIdx + (stepIdx + 1) / maxSteps) / modules.length
    : 0;

  const handleShare = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!site) return;
    setShareError(null);
    setShareLoading(true);
    try {
      const token = await createTeachingShare(site);
      const url = buildTeachingShareUrl(token);
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 3000);
    } catch (err) {
      setShareError((err as Error).message);
      setTimeout(() => setShareError(null), 5000);
    } finally {
      setShareLoading(false);
    }
  }, [site]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: '#08080f',
        display: 'flex', flexDirection: 'column',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif',
        WebkitFontSmoothing: 'antialiased',
        userSelect: 'none',
      }}
      onClick={!loading && !error ? goNext : undefined}
    >
      {/* ── Top bar ── */}
      <header
        onClick={(e) => e.stopPropagation()}
        style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 24px',
          background: 'rgba(8,8,15,0.80)', backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <button
          onClick={onClose}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 8, padding: '6px 14px', color: '#9090b8', fontSize: 13, cursor: 'pointer',
          }}
        >
          <ArrowLeft size={13} /> 返回笔记
        </button>

        <div style={{ textAlign: 'center', fontSize: 13 }}>
          {site ? (
            <span style={{ color: '#5050a0' }}>
              <span style={{ color: '#9090c8', fontWeight: 700 }}>{slideIdx + 1}</span>
              <span style={{ opacity: 0.5 }}> / {modules.length}{'\u3000'}</span>
              <span style={{ opacity: 0.4, fontSize: 12 }}>{site.title}</span>
            </span>
          ) : (
            <span style={{ color: '#3a3a70' }}>{docTitle || '互动学习'}</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Share button — only shown when site is ready */}
          {site && !loading && !error && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={handleShare}
                disabled={shareLoading}
                title="生成分享链接并复制到剪贴板"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: shareCopied ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.06)',
                  border: shareCopied ? '1px solid rgba(74,222,128,0.35)' : '1px solid rgba(255,255,255,0.10)',
                  borderRadius: 8, padding: '6px 14px',
                  color: shareCopied ? '#4ade80' : '#9090b8',
                  fontSize: 13, cursor: shareLoading ? 'not-allowed' : 'pointer',
                  opacity: shareLoading ? 0.6 : 1, transition: 'all 0.2s',
                }}
              >
                {shareLoading
                  ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                  : shareCopied ? <Check size={12} /> : <Share2 size={12} />
                }
                {shareCopied ? '已复制' : '分享'}
              </button>
              {shareError && (
                <div style={{
                  position: 'absolute', top: '110%', right: 0, zIndex: 20,
                  background: '#1a0a12', border: '1px solid rgba(251,113,133,0.35)',
                  borderRadius: 8, padding: '8px 14px', fontSize: 12,
                  color: '#fb7185', whiteSpace: 'nowrap', maxWidth: 260,
                }}>
                  {shareError}
                </div>
              )}
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); generate(true); }}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 8, padding: '6px 14px', color: '#9090b8', fontSize: 13,
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1,
            }}
          >
            {loading
              ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
              : <RefreshCw size={12} />
            }
            重新生成
          </button>
        </div>
      </header>

      {/* ── Progress bar ── */}
      <div style={{ height: 2, background: 'rgba(255,255,255,0.05)', flexShrink: 0 }}>
        <div style={{
          height: '100%',
          background: 'linear-gradient(90deg,#4040cc,#7070f0)',
          width: `${loading && progress ? progress.fraction * 100 : site ? progressFraction * 100 : 0}%`,
          transition: 'width 0.4s ease',
        }} />
      </div>

      {/* ── Slide / loading / error area ── */}
      {loading && progress ? (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <LoadingPane progress={progress} />
        </div>
      ) : error ? (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}
        >
          <ErrorPane error={error} onRetry={() => generate(true)} />
        </div>
      ) : site && curModule ? (
        <div
          key={transKey}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '5vh 6vw',
            animation: 'tp-enter 0.5s cubic-bezier(.16,1,.3,1) both',
          }}
        >
          <PresentationSlide module={curModule} step={stepIdx} onAdvance={goNext} />
        </div>
      ) : null}

      {/* ── Bottom nav ── */}
      {site && !loading && !error && (
        <footer
          onClick={(e) => e.stopPropagation()}
          style={{
            flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 32px',
            borderTop: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <button
            onClick={goPrev}
            disabled={atStart}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
              background: 'transparent', border: 'none', padding: '6px 12px',
              color: atStart ? '#1e1e40' : '#6060a0', cursor: atStart ? 'not-allowed' : 'pointer',
            }}
          >
            <ChevronLeft size={16} /> 上一步
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {modules.map((_, i) => (
              <div key={i} style={{
                width: i === slideIdx ? 20 : 6, height: 6, borderRadius: 3,
                background: i === slideIdx ? '#5555e8' : '#1a1a3a',
                transition: 'all 0.25s ease',
              }} />
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {!atEnd && (
              <span style={{ fontSize: 11, color: '#262650', letterSpacing: '0.04em' }}>
                Space / → 继续
              </span>
            )}
            <button
              onClick={goNext}
              disabled={atEnd}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
                background: atEnd ? 'transparent' : 'rgba(80,80,200,0.15)',
                border: atEnd ? 'none' : '1px solid rgba(80,80,200,0.35)',
                borderRadius: 8, padding: '6px 14px',
                color: atEnd ? '#1e1e40' : '#9090e0', cursor: atEnd ? 'not-allowed' : 'pointer',
              }}
            >
              {atEnd ? '演示完毕' : '下一步'}{!atEnd && <ChevronRight size={16} />}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}

// ── Loading pane ──────────────────────────────────────────────────────────────
function LoadingPane({ progress }: { progress: Progress }) {
  const stages: Stage[] = ['planner', 'generator', 'reviewer'];
  const cur = stages.indexOf(progress.stage);
  return (
    <div style={{
      maxWidth: 520, width: '100%', padding: '52px 56px', borderRadius: 24,
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 40 }}>
        <Loader2 size={22} style={{ color: '#5555e8', animation: 'spin 1s linear infinite' }} />
        <div style={{ fontSize: 18, fontWeight: 600, color: '#d0d0e8' }}>{progress.message || '生成中…'}</div>
      </div>
      <div style={{ display: 'flex', gap: 0 }}>
        {stages.map((s, i) => (
          <div key={s} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', marginBottom: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: i < cur ? '#5555e8' : i === cur ? 'rgba(85,85,232,0.20)' : 'rgba(255,255,255,0.05)',
              border: i === cur ? '2px solid #5555e8' : '2px solid transparent',
              color: i < cur ? '#fff' : i === cur ? '#9090e0' : '#30305a',
              fontSize: 14, fontWeight: 700,
            }}>{i + 1}</div>
            <div style={{ fontSize: 12, color: i === cur ? '#9090e0' : '#28284a', textAlign: 'center' }}>
              {STAGE_LABELS[s]}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 32, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
        <div style={{
          height: '100%', borderRadius: 2,
          background: 'linear-gradient(90deg,#4040cc,#7070f0)',
          width: `${Math.round(progress.fraction * 100)}%`,
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  );
}

// ── Error pane ────────────────────────────────────────────────────────────────
function ErrorPane({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div style={{
      maxWidth: 520, width: '100%', padding: '44px 48px', borderRadius: 24,
      background: 'rgba(251,113,133,0.06)', border: '1.5px solid rgba(251,113,133,0.25)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <AlertCircle size={22} style={{ color: '#fb7185', flexShrink: 0 }} />
        <div style={{ fontSize: 18, fontWeight: 600, color: '#f0d0d8' }}>生成失败</div>
      </div>
      <div style={{ fontSize: 14, color: '#906080', lineHeight: 1.7, marginBottom: 28 }}>{error}</div>
      <button
        onClick={onRetry}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(251,113,133,0.10)', border: '1px solid rgba(251,113,133,0.30)',
          borderRadius: 10, padding: '10px 20px', color: '#fb7185', fontSize: 14, cursor: 'pointer',
        }}
      >
        <RefreshCw size={14} /> 重试
      </button>
    </div>
  );
}
