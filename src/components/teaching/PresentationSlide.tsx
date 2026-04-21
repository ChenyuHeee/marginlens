/**
 * Presentation-mode slide renderer.
 * Each TeachingModule maps to a full-screen "slide" that reveals content
 * step-by-step as the user clicks.  getSteps() tells the controller how
 * many clicks are needed before advancing to the next module.
 */
import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import {
  Check, X, HelpCircle, BookOpen, Lightbulb,
  AlertTriangle, Sparkles, Sigma, ChevronDown, ChevronRight,
} from 'lucide-react';
import type {
  TeachingModule, ModuleAccent,
  HeroModule, SectionModule, KeyPointsModule,
  DefinitionModule, FormulaModule, CalloutModule,
  QAModule, QuizModule, SummaryModule,
} from '@/lib/teaching/templates';

// ── Overflow-safe scroll wrapper ──────────────────────────────────────────────
/**
 * Wraps slide content so it can scroll vertically when content overflows the
 * viewport. Detects overflow via ResizeObserver and shows a bottom fade-out
 * gradient with a hint label. The header (≈54px) + progress bar (2px) +
 * footer (≈56px) + vertical padding (2×5vh ≈ 96px on 1080p) ≈ 210px.
 */
const MAX_SLIDE_H = 'calc(100vh - 220px)';

function SlideScroller({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [atBottom, setAtBottom] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      // Use a generous threshold to avoid false positives from sub-pixel rounding
      const scrollable = el.scrollHeight > el.clientHeight + 12;
      setOverflows(scrollable);
      setAtBottom(scrollable && el.scrollTop + el.clientHeight >= el.scrollHeight - 12);
    };
    check();
    // Watch both the scroll container AND its inner content so that late-rendering
    // children (KaTeX, images, custom fonts) trigger a re-check once laid out.
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (innerRef.current) ro.observe(innerRef.current);
    el.addEventListener('scroll', check, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener('scroll', check); };
  }, []);

  return (
    <div style={{ position: 'relative', maxHeight: MAX_SLIDE_H, width: '100%', display: 'flex' }}>
      <div
        ref={ref}
        style={{
          flex: 1,
          maxHeight: MAX_SLIDE_H,
          overflowY: 'auto',
          paddingRight: 6,
          /* subtle dark scrollbar */
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.08) transparent',
        }}
      >
        <div ref={innerRef}>{children}</div>
      </div>
      {/* Bottom fade + scroll hint — only when truly overflowing and not yet at bottom */}
      {overflows && !atBottom && (
        <div
          style={{
            position: 'absolute', bottom: 0, left: 0, right: 6,
            height: 72, pointerEvents: 'none',
            background: 'linear-gradient(to bottom, transparent, #08080f)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            paddingBottom: 6,
          }}
        >
          <span style={{ fontSize: 11, color: '#3a3a6a', letterSpacing: '0.06em' }}>
            ↓ 向下滚动
          </span>
        </div>
      )}
    </div>
  );
}


const AC: Record<ModuleAccent, string> = {
  blue:   '#5b9cf8',
  purple: '#b06af4',
  green:  '#4ade80',
  amber:  '#fbbf24',
  rose:   '#fb7185',
  gray:   '#94a3b8',
};
function ac(a?: ModuleAccent) { return AC[a ?? 'blue']; }

// ── How many click-steps does this module need? ───────────────────────────────
export function getSteps(m: TeachingModule): number {
  switch (m.type) {
    case 'keypoints': return m.reveal === 'all' ? 1 : Math.max(1, m.items.length);
    case 'summary':   return m.reveal === 'all' ? 1 : Math.max(1, m.points.length);
    case 'qa':        return 2;
    case 'definition': return m.example ? 2 : 1;
    case 'formula':    return m.explanation ? 2 : 1;
    default:           return 1;
  }
}

// ── Step-reveal style ─────────────────────────────────────────────────────────
// maxHeight collapses hidden items to zero height so they don't contribute to
// scrollHeight — preventing the SlideScroller from showing a false overflow hint.
function rv(shown: boolean): React.CSSProperties {
  return {
    opacity: shown ? 1 : 0,
    maxHeight: shown ? '1000px' : '0',
    overflow: 'hidden',
    transform: shown ? 'translateY(0)' : 'translateY(16px)',
    transition: 'opacity 0.45s cubic-bezier(.16,1,.3,1), transform 0.45s cubic-bezier(.16,1,.3,1), max-height 0.45s cubic-bezier(.16,1,.3,1)',
    pointerEvents: shown ? 'auto' : 'none',
  };
}

// ── Dark-safe Markdown ────────────────────────────────────────────────────────
function MD({ children, large }: { children: string; large?: boolean }) {
  return (
    <div className="teach-md" style={{ fontSize: large ? '1.2rem' : '1.05rem', lineHeight: 1.75 }}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

function Label({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div style={{
      fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.14em',
      textTransform: 'uppercase', color, marginBottom: '1.8rem', opacity: 0.75,
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      {children}
    </div>
  );
}

// ── HERO ─────────────────────────────────────────────────────────────────────
function HeroSlide({ m }: { m: HeroModule }) {
  const color = ac(m.accent);
  return (
    <SlideScroller>
      <div style={{ textAlign: 'center', maxWidth: 900, padding: '0 20px' }}>
      {m.chips?.length ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 36 }}>
          {m.chips.map((c, i) => (
            <span key={i} style={{
              fontSize: 12, fontWeight: 600, padding: '5px 16px', borderRadius: 100,
              background: `${color}1a`, color, border: `1px solid ${color}44`,
            }}>{c}</span>
          ))}
        </div>
      ) : (
        <Label color={color}>互动学习</Label>
      )}
      <h1 style={{
        fontSize: 'clamp(2.6rem, 7vw, 5.5rem)', fontWeight: 850, lineHeight: 1.05,
        letterSpacing: '-0.04em', color: '#f0f0f8', marginBottom: '1.6rem',
      }}>
        {m.title}
      </h1>
      {m.subtitle && (
        <p style={{ fontSize: 'clamp(1.05rem, 2.5vw, 1.45rem)', color: '#7070a0', marginBottom: '2rem' }}>
          {m.subtitle}
        </p>
      )}
      {m.summary && (
        <div style={{ maxWidth: 660, margin: '0 auto', fontSize: '1.05rem', color: '#9090b8' }}>
          <MD>{m.summary}</MD>
        </div>
      )}
      </div>
    </SlideScroller>
  );
}

// ── SECTION ──────────────────────────────────────────────────────────────────
function SectionSlide({ m }: { m: SectionModule }) {
  const color = ac(m.accent);
  return (
    <SlideScroller>
      <div style={{ maxWidth: 900, width: '100%', padding: '0 20px' }}>
      <div style={{ width: 52, height: 4, borderRadius: 2, background: color, marginBottom: 32 }} />
      <h2 style={{
        fontSize: 'clamp(2rem, 5vw, 3.8rem)', fontWeight: 750, letterSpacing: '-0.03em',
        color: '#f0f0f8', marginBottom: '2.2rem', lineHeight: 1.1,
      }}>
        {m.title}
      </h2>
      <div style={{ maxWidth: 720, fontSize: '1.2rem', color: '#b8b8d4', lineHeight: 1.85 }}>
        <MD large>{m.content}</MD>
      </div>
      </div>
    </SlideScroller>
  );
}

// ── KEYPOINTS ────────────────────────────────────────────────────────────────
function KeyPointsSlide({ m, step }: { m: KeyPointsModule; step: number }) {
  const color = ac(m.accent);
  const allAtOnce = m.reveal === 'all';
  return (
    <SlideScroller>
      <div style={{ maxWidth: 860, width: '100%', padding: '0 20px' }}>
      <Label color={color}>{m.title || '要点'}</Label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {m.items.map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 18, alignItems: 'flex-start', ...rv(allAtOnce || i <= step) }}>
            <div style={{
              flexShrink: 0, width: 30, height: 30, borderRadius: '50%',
              background: `${color}1a`, border: `1.5px solid ${color}50`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 800, color, marginTop: 4,
            }}>{i + 1}</div>
            <div style={{ fontSize: '1.2rem', color: '#d0d0e8', lineHeight: 1.75, flex: 1 }}>
              <MD>{item}</MD>
            </div>
          </div>
        ))}
      </div>
      </div>
    </SlideScroller>
  );
}

// ── DEFINITION ───────────────────────────────────────────────────────────────
function DefinitionSlide({ m, step }: { m: DefinitionModule; step: number }) {
  const color = ac(m.accent ?? 'purple');
  return (
    <SlideScroller>
      <div style={{ maxWidth: 860, width: '100%', padding: '0 20px' }}>
      <Label color={color}><BookOpen size={14} />定义</Label>
      <div style={{
        fontSize: 'clamp(2rem, 5vw, 3.6rem)', fontWeight: 800,
        letterSpacing: '-0.03em', color, marginBottom: 28, lineHeight: 1.1,
      }}>
        {m.term}
      </div>
      <div style={{ fontSize: '1.2rem', color: '#c8c8e0', lineHeight: 1.85, maxWidth: 720 }}>
        <MD large>{m.definition}</MD>
      </div>
      {m.example && (
        <div style={{
          marginTop: 36, padding: '22px 28px', borderRadius: 14,
          background: `${color}10`, border: `1px solid ${color}30`, maxWidth: 720,
          ...rv(step >= 1),
        }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color, marginBottom: 10, fontWeight: 700 }}>示例</div>
          <div style={{ fontSize: '1.1rem', color: '#c0c0d8', lineHeight: 1.75 }}>
            <MD>{m.example}</MD>
          </div>
        </div>
      )}
      </div>
    </SlideScroller>
  );
}

// ── FORMULA ──────────────────────────────────────────────────────────────────
function FormulaSlide({ m, step }: { m: FormulaModule; step: number }) {
  const color = ac(m.accent ?? 'blue');
  return (
    <SlideScroller>
      <div style={{ maxWidth: 860, width: '100%', padding: '0 20px', textAlign: 'center' }}>
      <Label color={color} ><Sigma size={14} />{m.caption || '公式'}</Label>
      <div style={{
        fontSize: '2rem', padding: '44px 32px',
        background: 'rgba(255,255,255,0.03)', borderRadius: 18,
        border: '1px solid rgba(255,255,255,0.07)', marginBottom: 36,
      }}>
        <MD large>{`$$${m.latex}$$`}</MD>
      </div>
      {m.explanation && (
        <div style={{
          fontSize: '1.1rem', color: '#a8a8cc', lineHeight: 1.85,
          textAlign: 'left', maxWidth: 720, margin: '0 auto', ...rv(step >= 1),
        }}>
          <MD>{m.explanation}</MD>
        </div>
      )}
      </div>
    </SlideScroller>
  );
}

// ── CALLOUT ──────────────────────────────────────────────────────────────────
const CALLOUT_CFG = {
  note:     { Icon: BookOpen,      accent: 'blue'   as ModuleAccent, label: '笔记' },
  tip:      { Icon: Lightbulb,     accent: 'green'  as ModuleAccent, label: '提示' },
  warning:  { Icon: AlertTriangle, accent: 'amber'  as ModuleAccent, label: '注意' },
  question: { Icon: HelpCircle,    accent: 'purple' as ModuleAccent, label: '疑问' },
  insight:  { Icon: Sparkles,      accent: 'rose'   as ModuleAccent, label: '洞见' },
};

function CalloutSlide({ m }: { m: CalloutModule }) {
  const cfg = CALLOUT_CFG[m.variant] ?? CALLOUT_CFG.note;
  const color = ac(m.accent ?? cfg.accent);
  const { Icon } = cfg;
  return (
    <SlideScroller>
      <div style={{
        maxWidth: 820, padding: '52px 60px', borderRadius: 24,
        background: `${color}0f`, border: `1.5px solid ${color}35`,
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <Icon size={30} style={{ color }} />
        <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color }}>
          {m.title || cfg.label}
        </div>
      </div>
      <div style={{ fontSize: '1.3rem', color: '#d8d8ef', lineHeight: 1.85 }}>
        <MD large>{m.body}</MD>
      </div>
      </div>
    </SlideScroller>
  );
}

// ── Q & A ────────────────────────────────────────────────────────────────────
function QASlide({ m, step }: { m: QAModule; step: number }) {
  const color = ac(m.accent ?? 'purple');
  const revealed = step >= 1;
  return (
    <SlideScroller>
      <div style={{ maxWidth: 860, width: '100%', padding: '0 20px' }}>
      <Label color={color}><HelpCircle size={14} />疑问与解答</Label>
      {m.source && (
        <div style={{
          fontSize: '0.95rem', fontStyle: 'italic', color: '#6060a0',
          borderLeft: `3px solid ${color}44`, paddingLeft: 18, marginBottom: 28,
        }}>
          "{m.source}"
        </div>
      )}
      <div style={{
        fontSize: 'clamp(1.2rem, 3vw, 2.2rem)', fontWeight: 650,
        color: '#f0f0f8', lineHeight: 1.45, marginBottom: 36,
      }}>
        {m.question}
      </div>
      {!revealed ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#404080', fontSize: '1rem' }}>
          <ChevronDown size={16} /><span>点击继续查看答案</span>
        </div>
      ) : (
        <div style={{
          padding: '28px 34px', borderRadius: 16,
          background: `${color}0e`, border: `1px solid ${color}30`,
          fontSize: '1.2rem', color: '#d0d0e8', lineHeight: 1.8,
          ...rv(true),
        }}>
          <MD large>{m.answer}</MD>
        </div>
      )}
      </div>
    </SlideScroller>
  );
}

// ── QUIZ ─────────────────────────────────────────────────────────────────────
function QuizSlide({ m, onAdvance }: { m: QuizModule; onAdvance?: () => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const color = ac(m.accent ?? 'green');
  return (
    <SlideScroller>
      <div style={{ maxWidth: 860, width: '100%', padding: '0 20px' }}>
      <Label color={color}><Sparkles size={14} />小测验</Label>
      <div style={{
        fontSize: 'clamp(1.2rem, 3vw, 2rem)', fontWeight: 650,
        color: '#f0f0f8', lineHeight: 1.45, marginBottom: 36,
      }}>
        {m.question}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {m.options.map((opt, i) => {
          const isCorrect = i === m.correctIndex;
          const isPicked = picked === i;
          const shown = picked !== null;
          let bg = 'rgba(255,255,255,0.04)';
          let border = 'rgba(255,255,255,0.10)';
          if (shown && isPicked && isCorrect)  { bg = 'rgba(74,222,128,0.14)'; border = 'rgba(74,222,128,0.45)'; }
          if (shown && isPicked && !isCorrect) { bg = 'rgba(251,113,133,0.14)'; border = 'rgba(251,113,133,0.45)'; }
          if (shown && !isPicked && isCorrect) { bg = 'rgba(74,222,128,0.06)'; border = 'rgba(74,222,128,0.3)'; }
          return (
            <button key={i} disabled={picked !== null}
              onClick={(e) => { e.stopPropagation(); setPicked(i); }}
              style={{
                textAlign: 'left', padding: '16px 22px', borderRadius: 12,
                background: bg, border: `1.5px solid ${border}`,
                color: '#d0d0e8', fontSize: '1.15rem', cursor: picked === null ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                transition: 'background 0.2s, border-color 0.2s',
              }}
            >
              <span>{opt}</span>
              {shown && isPicked && (isCorrect ? <Check size={18} color="#4ade80" /> : <X size={18} color="#fb7185" />)}
              {shown && !isPicked && isCorrect && <Check size={18} color="#4ade80" />}
            </button>
          );
        })}
      </div>
      {picked !== null && m.explanation && (
        <div style={{
          marginTop: 24, padding: '18px 22px', borderRadius: 12,
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          fontSize: '1rem', color: '#9090b8', lineHeight: 1.75,
        }}>
          <MD>{m.explanation}</MD>
        </div>
      )}
      {/* After answering, show a Continue button — the outer click area is blocked by stopPropagation */}
      {picked !== null && onAdvance && (
        <div style={{ marginTop: 32, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={(e) => { e.stopPropagation(); onAdvance(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(80,80,200,0.18)', border: '1px solid rgba(80,80,200,0.45)',
              borderRadius: 10, padding: '10px 24px',
              color: '#9090e0', fontSize: '1rem', cursor: 'pointer',
              animation: 'tp-enter 0.35s cubic-bezier(.16,1,.3,1) both',
            }}
          >
            继续 <ChevronRight size={16} />
          </button>
        </div>
      )}
      </div>
    </SlideScroller>
  );
}

// ── SUMMARY ──────────────────────────────────────────────────────────────────
function SummarySlide({ m, step }: { m: SummaryModule; step: number }) {
  const color = ac(m.accent ?? 'amber');
  const allAtOnce = m.reveal === 'all';
  return (
    <SlideScroller>
      <div style={{ maxWidth: 860, width: '100%', padding: '0 20px' }}>
      <Label color={color}>{m.title || '关键回顾'}</Label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {m.points.map((pt, i) => (
          <div key={i} style={{ display: 'flex', gap: 18, alignItems: 'flex-start', ...rv(allAtOnce || i <= step) }}>
            <div style={{
              flexShrink: 0, width: 34, height: 34, borderRadius: '50%',
              background: `${color}1a`, border: `1.5px solid ${color}50`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 800, color, marginTop: 2,
            }}>{i + 1}</div>
            <div style={{ fontSize: '1.2rem', color: '#d0d0e8', lineHeight: 1.8, flex: 1 }}>
              <MD>{pt}</MD>
            </div>
          </div>
        ))}
      </div>
      </div>
    </SlideScroller>
  );
}

// ── Dispatcher ───────────────────────────────────────────────────────────────
export function PresentationSlide({
  module: m, step, onAdvance,
}: {
  module: TeachingModule;
  step: number;
  onAdvance?: () => void;
}) {
  switch (m.type) {
    case 'hero':       return <HeroSlide m={m} />;
    case 'section':    return <SectionSlide m={m} />;
    case 'keypoints':  return <KeyPointsSlide m={m} step={step} />;
    case 'definition': return <DefinitionSlide m={m} step={step} />;
    case 'formula':    return <FormulaSlide m={m} step={step} />;
    case 'callout':    return <CalloutSlide m={m} />;
    case 'qa':         return <QASlide m={m} step={step} />;
    case 'quiz':       return <QuizSlide m={m} onAdvance={onAdvance} />;
    case 'summary':    return <SummarySlide m={m} step={step} />;
    default:           return null;
  }
}
