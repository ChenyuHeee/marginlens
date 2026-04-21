import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { ChevronDown, Check, X, BookOpen, Lightbulb, AlertTriangle, HelpCircle, Sparkles, Sigma } from 'lucide-react';
import type {
  TeachingModule, ModuleAccent, HeroModule, SectionModule, KeyPointsModule,
  DefinitionModule, FormulaModule, CalloutModule, QAModule, QuizModule, SummaryModule,
} from '@/lib/teaching/templates';

const ACCENT_VARS: Record<ModuleAccent, { fg: string; bg: string; border: string }> = {
  blue:   { fg: '#3478f6', bg: 'rgba(52,120,246,0.08)',  border: 'rgba(52,120,246,0.30)' },
  purple: { fg: '#a855f7', bg: 'rgba(168,85,247,0.08)',  border: 'rgba(168,85,247,0.30)' },
  green:  { fg: '#22c55e', bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.30)' },
  amber:  { fg: '#f59e0b', bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.35)' },
  rose:   { fg: '#f43f5e', bg: 'rgba(244,63,94,0.08)',   border: 'rgba(244,63,94,0.30)' },
  gray:   { fg: '#6e6e73', bg: 'rgba(120,120,128,0.08)', border: 'rgba(120,120,128,0.25)' },
};

function accentFor(a?: ModuleAccent) { return ACCENT_VARS[a ?? 'blue']; }

function MD({ children }: { children: string }) {
  return (
    <div className="md-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

function Card({ children, accent, className = '', anchor }: {
  children: React.ReactNode;
  accent?: ModuleAccent;
  className?: string;
  anchor?: string;
}) {
  const a = accentFor(accent);
  return (
    <section
      id={anchor}
      className={`rounded-2xl p-6 md:p-8 ${className}`}
      style={{
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border-strong)',
        boxShadow: 'var(--shadow-sm)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: a.fg, opacity: 0.7,
        }}
      />
      {children}
    </section>
  );
}

// ─── Hero ────────────────────────────────────────────────────────
export function HeroBlock({ m }: { m: HeroModule }) {
  const a = accentFor(m.accent);
  return (
    <section
      id={m.anchor}
      className="rounded-3xl p-10 md:p-14"
      style={{
        background: `linear-gradient(135deg, ${a.bg}, transparent 70%)`,
        border: '1px solid var(--color-border-strong)',
      }}
    >
      <div className="text-xs uppercase tracking-widest mb-3" style={{ color: a.fg }}>
        互动学习
      </div>
      <h1 className="text-3xl md:text-5xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>
        {m.title}
      </h1>
      {m.subtitle && (
        <p className="text-base md:text-lg mt-3" style={{ color: 'var(--color-text-secondary)' }}>
          {m.subtitle}
        </p>
      )}
      {m.summary && <div className="mt-6 text-[15px]"><MD>{m.summary}</MD></div>}
      {m.chips?.length ? (
        <div className="mt-6 flex flex-wrap gap-2">
          {m.chips.map((c, i) => (
            <span key={i}
              className="text-[11px] px-3 py-1 rounded-full"
              style={{ background: a.bg, color: a.fg, border: `1px solid ${a.border}` }}>
              {c}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

// ─── Section ─────────────────────────────────────────────────────
export function SectionBlock({ m }: { m: SectionModule }) {
  const Tag = (`h${Math.max(2, Math.min(4, (m.level ?? 1) + 1))}`) as 'h2' | 'h3' | 'h4';
  return (
    <Card accent={m.accent} anchor={m.anchor}>
      <Tag className="font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
        {m.title}
      </Tag>
      <div className="mt-3"><MD>{m.content}</MD></div>
    </Card>
  );
}

// ─── KeyPoints ───────────────────────────────────────────────────
export function KeyPointsBlock({ m }: { m: KeyPointsModule }) {
  const a = accentFor(m.accent);
  return (
    <Card accent={m.accent} anchor={m.anchor}>
      {m.title && (
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={16} style={{ color: a.fg }} />
          <h3 className="text-lg font-semibold">{m.title}</h3>
        </div>
      )}
      <ul className="space-y-2">
        {m.items.map((it, i) => (
          <li key={i} className="flex items-start gap-3">
            <span
              className="mt-2 w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: a.fg }}
            />
            <div className="flex-1"><MD>{it}</MD></div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ─── Definition ──────────────────────────────────────────────────
export function DefinitionBlock({ m }: { m: DefinitionModule }) {
  const a = accentFor(m.accent ?? 'purple');
  return (
    <Card accent={m.accent ?? 'purple'} anchor={m.anchor}>
      <div className="flex items-center gap-2 mb-3">
        <BookOpen size={16} style={{ color: a.fg }} />
        <h3 className="text-base font-semibold">{m.term}</h3>
      </div>
      <div className="text-[15px]"><MD>{m.definition}</MD></div>
      {m.example && (
        <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <div className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
            示例
          </div>
          <MD>{m.example}</MD>
        </div>
      )}
    </Card>
  );
}

// ─── Formula ─────────────────────────────────────────────────────
export function FormulaBlock({ m }: { m: FormulaModule }) {
  const a = accentFor(m.accent ?? 'blue');
  const latex = `$$${m.latex}$$`;
  return (
    <Card accent={m.accent ?? 'blue'} anchor={m.anchor}>
      <div className="flex items-center gap-2 mb-3">
        <Sigma size={16} style={{ color: a.fg }} />
        <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
          {m.caption || '公式'}
        </span>
      </div>
      <div className="overflow-x-auto py-2"><MD>{latex}</MD></div>
      {m.explanation && (
        <div className="mt-4 text-[14px]" style={{ color: 'var(--color-text-secondary)' }}>
          <MD>{m.explanation}</MD>
        </div>
      )}
    </Card>
  );
}

// ─── Callout ─────────────────────────────────────────────────────
const CALLOUT_ICONS = {
  note:     { icon: BookOpen,      accent: 'blue'   as ModuleAccent },
  tip:      { icon: Lightbulb,     accent: 'green'  as ModuleAccent },
  warning:  { icon: AlertTriangle, accent: 'amber'  as ModuleAccent },
  question: { icon: HelpCircle,    accent: 'purple' as ModuleAccent },
  insight:  { icon: Sparkles,      accent: 'rose'   as ModuleAccent },
};

export function CalloutBlock({ m }: { m: CalloutModule }) {
  const cfg = CALLOUT_ICONS[m.variant] || CALLOUT_ICONS.note;
  const a = accentFor(m.accent ?? cfg.accent);
  const Icon = cfg.icon;
  return (
    <section
      id={m.anchor}
      className="rounded-2xl p-5 md:p-6 flex gap-4"
      style={{ background: a.bg, border: `1px solid ${a.border}` }}
    >
      <div className="flex-shrink-0 mt-0.5"><Icon size={18} style={{ color: a.fg }} /></div>
      <div className="flex-1 min-w-0">
        {m.title && <div className="font-semibold mb-1" style={{ color: a.fg }}>{m.title}</div>}
        <MD>{m.body}</MD>
      </div>
    </section>
  );
}

// ─── Q & A ───────────────────────────────────────────────────────
export function QABlock({ m }: { m: QAModule }) {
  const [open, setOpen] = useState(!m.reveal);
  const a = accentFor(m.accent ?? 'purple');
  return (
    <Card accent={m.accent ?? 'purple'} anchor={m.anchor}>
      <div className="flex items-center gap-2 mb-3">
        <HelpCircle size={16} style={{ color: a.fg }} />
        <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
          疑问与解答
        </span>
      </div>
      <div className="text-[15px] font-medium" style={{ color: 'var(--color-text)' }}>
        {m.question}
      </div>
      {m.source && (
        <blockquote
          className="mt-3 mb-3 pl-3 text-[13px] italic"
          style={{ color: 'var(--color-text-secondary)', borderLeft: `3px solid ${a.border}` }}
        >
          “{m.source}”
        </blockquote>
      )}
      {m.reveal && !open ? (
        <button
          onClick={() => setOpen(true)}
          className="mt-3 inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full"
          style={{ background: a.bg, color: a.fg, border: `1px solid ${a.border}` }}
        >
          <ChevronDown size={12} /> 显示答案
        </button>
      ) : (
        <div className="mt-3"><MD>{m.answer}</MD></div>
      )}
    </Card>
  );
}

// ─── Quiz ────────────────────────────────────────────────────────
export function QuizBlock({ m }: { m: QuizModule }) {
  const [picked, setPicked] = useState<number | null>(null);
  const a = accentFor(m.accent ?? 'green');
  return (
    <Card accent={m.accent ?? 'green'} anchor={m.anchor}>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={16} style={{ color: a.fg }} />
        <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
          小测
        </span>
      </div>
      <div className="text-[15px] font-medium mb-4">{m.question}</div>
      <div className="space-y-2">
        {m.options.map((opt, i) => {
          const isPicked = picked === i;
          const isCorrect = i === m.correctIndex;
          const showState = picked !== null;
          let bg = 'transparent';
          let border = 'var(--color-border-strong)';
          let icon: React.ReactNode = null;
          if (showState && isPicked) {
            bg = isCorrect ? 'rgba(34,197,94,0.10)' : 'rgba(244,63,94,0.10)';
            border = isCorrect ? 'rgba(34,197,94,0.5)' : 'rgba(244,63,94,0.5)';
            icon = isCorrect
              ? <Check size={14} className="text-green-500" />
              : <X size={14} className="text-rose-500" />;
          } else if (showState && isCorrect) {
            bg = 'rgba(34,197,94,0.06)';
            border = 'rgba(34,197,94,0.3)';
            icon = <Check size={14} className="text-green-500" />;
          }
          return (
            <button
              key={i}
              disabled={picked !== null}
              onClick={() => setPicked(i)}
              className="w-full text-left text-[14px] px-4 py-3 rounded-lg flex items-center justify-between transition-colors"
              style={{ background: bg, border: `1px solid ${border}`, color: 'var(--color-text)' }}
            >
              <span>{opt}</span>
              {icon}
            </button>
          );
        })}
      </div>
      {picked !== null && m.explanation && (
        <div className="mt-4 p-3 rounded-lg text-[13px]" style={{ background: 'var(--color-bg-tertiary)' }}>
          <MD>{m.explanation}</MD>
        </div>
      )}
    </Card>
  );
}

// ─── Summary ─────────────────────────────────────────────────────
export function SummaryBlock({ m }: { m: SummaryModule }) {
  const a = accentFor(m.accent ?? 'amber');
  return (
    <Card accent={m.accent ?? 'amber'} anchor={m.anchor}>
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={16} style={{ color: a.fg }} />
        <h3 className="text-lg font-semibold">{m.title || '关键回顾'}</h3>
      </div>
      <ol className="space-y-2 list-decimal list-inside">
        {m.points.map((p, i) => (
          <li key={i} className="text-[14px]"><MD>{p}</MD></li>
        ))}
      </ol>
    </Card>
  );
}

// ─── Dispatcher ──────────────────────────────────────────────────
export function ModuleRenderer({ module: m }: { module: TeachingModule }) {
  switch (m.type) {
    case 'hero':       return <HeroBlock m={m} />;
    case 'section':    return <SectionBlock m={m} />;
    case 'keypoints':  return <KeyPointsBlock m={m} />;
    case 'definition': return <DefinitionBlock m={m} />;
    case 'formula':    return <FormulaBlock m={m} />;
    case 'callout':    return <CalloutBlock m={m} />;
    case 'qa':         return <QABlock m={m} />;
    case 'quiz':       return <QuizBlock m={m} />;
    case 'summary':    return <SummaryBlock m={m} />;
    default:           return null;
  }
}
