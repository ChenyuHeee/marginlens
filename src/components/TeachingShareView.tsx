/**
 * Read-only PPT presentation view for a shared teaching site.
 * Loaded when URL has ?teach-share=<token>
 */
import { useEffect, useCallback, useState } from 'react';
import { ArrowLeft, Loader2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { loadTeachingShare } from '@/lib/teachingShare';
import type { TeachingSite } from '@/lib/teaching/templates';
import { PresentationSlide, getSteps } from './teaching/PresentationSlide';

interface TeachingShareViewProps {
  token: string;
}

export function TeachingShareView({ token }: TeachingShareViewProps) {
  const [site, setSite] = useState<TeachingSite | null>(null);
  const [authorName, setAuthorName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Presentation navigation
  const [slideIdx, setSlideIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [transKey, setTransKey] = useState(0);

  useEffect(() => {
    loadTeachingShare(token)
      .then((res) => {
        if (!res) { setError('链接已失效或演示文稿不存在'); return; }
        setSite(res.site);
        setAuthorName(res.author_name);
      })
      .catch(() => setError('加载失败，请稍后重试'))
      .finally(() => setLoading(false));
  }, [token]);

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
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev]);

  const progressFraction = modules.length > 0
    ? (slideIdx + (stepIdx + 1) / maxSteps) / modules.length
    : 0;

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
        {/* Back to home */}
        <button
          onClick={() => { window.location.href = window.location.origin + window.location.pathname; }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 8, padding: '6px 14px', color: '#9090b8', fontSize: 13, cursor: 'pointer',
          }}
        >
          <ArrowLeft size={13} /> 打开 MarginLens
        </button>

        <div style={{ textAlign: 'center', fontSize: 13 }}>
          {site ? (
            <span style={{ color: '#5050a0' }}>
              <span style={{ color: '#9090c8', fontWeight: 700 }}>{slideIdx + 1}</span>
              <span style={{ opacity: 0.5 }}> / {modules.length}{'\u3000'}</span>
              <span style={{ opacity: 0.4, fontSize: 12 }}>{site.title}</span>
            </span>
          ) : (
            <span style={{ color: '#3a3a70' }}>互动学习</span>
          )}
        </div>

        {/* Author attribution */}
        <div style={{ fontSize: 12, color: '#2e2e60', minWidth: 120, textAlign: 'right' }}>
          {authorName ? `由 ${authorName} 制作` : '\u00a0'}
        </div>
      </header>

      {/* ── Progress bar ── */}
      <div style={{ height: 2, background: 'rgba(255,255,255,0.05)', flexShrink: 0 }}>
        <div style={{
          height: '100%',
          background: 'linear-gradient(90deg,#4040cc,#7070f0)',
          width: `${site ? progressFraction * 100 : 0}%`,
          transition: 'width 0.4s ease',
        }} />
      </div>

      {/* ── Slide / loading / error area ── */}
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <Loader2 size={32} style={{ color: '#5555e8', animation: 'spin 1s linear infinite' }} />
            <div style={{ fontSize: 14, color: '#4040a0' }}>加载中…</div>
          </div>
        </div>
      ) : error ? (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}
        >
          <div style={{
            maxWidth: 480, width: '100%', padding: '44px 48px', borderRadius: 24,
            background: 'rgba(251,113,133,0.06)', border: '1.5px solid rgba(251,113,133,0.25)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <AlertCircle size={22} style={{ color: '#fb7185' }} />
              <div style={{ fontSize: 18, fontWeight: 600, color: '#f0d0d8' }}>无法加载</div>
            </div>
            <div style={{ fontSize: 14, color: '#906080', lineHeight: 1.7 }}>{error}</div>
          </div>
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
            onClick={goPrev} disabled={atStart}
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
              onClick={goNext} disabled={atEnd}
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
