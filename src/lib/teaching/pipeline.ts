import type { Annotation, Document, LLMProvider } from '@/types';
import { streamChat } from '@/lib/llm';
import { PLANNER_SYSTEM, GENERATOR_SYSTEM, REVIEWER_SYSTEM } from './prompts';
import type { TeachingModule, TeachingSite } from './templates';

export type Stage = 'planner' | 'generator' | 'reviewer';
export interface Progress {
  stage: Stage;
  /** 0..1 */
  fraction: number;
  message?: string;
}

/**
 * Run a non-streaming chat completion by collecting tokens and returning the
 * full text. We reuse `streamChat` so all LLM calls go through the same
 * usage-tracking + auth path used elsewhere.
 */
async function chatComplete(
  provider: LLMProvider,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    streamChat(
      provider,
      messages,
      {
        onToken: (t) => { buffer += t; },
        onDone: () => resolve(buffer),
        onError: (e) => reject(e),
      },
      signal,
    );
  });
}

/** Extract a JSON object from arbitrary LLM output, tolerating code fences. */
function extractJson<T = unknown>(raw: string): T {
  let s = raw.trim();
  // Strip ```json ... ``` or ``` ... ``` fences
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/i);
  if (fence) s = fence[1].trim();
  // Find the first {...} block by counting braces
  const start = s.indexOf('{');
  if (start === -1) throw new Error('LLM output contains no JSON object');
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const candidate = s.slice(start, i + 1);
        return JSON.parse(candidate) as T;
      }
    }
  }
  throw new Error('LLM output JSON is unterminated');
}

// ── Runtime schema validation ─────────────────────────────────────────────────

const VALID_ACCENTS = new Set(['blue', 'purple', 'green', 'amber', 'rose', 'gray']);
const VALID_CALLOUT_VARIANTS = new Set(['note', 'tip', 'warning', 'question', 'insight']);

function str(v: unknown): v is string { return typeof v === 'string' && v.trim().length > 0; }
function arr(v: unknown): v is unknown[] { return Array.isArray(v) && v.length > 0; }

/** Validate one module; returns a (possibly lightly-patched) valid module or null. */
function validateModule(m: unknown): TeachingModule | null {
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;

  // Normalise accent / unknowns — don't reject, just discard bad values
  if (o.accent !== undefined && !VALID_ACCENTS.has(o.accent as string)) delete o.accent;

  switch (o.type) {
    case 'hero':
      if (!str(o.title)) return null;
      return o as unknown as TeachingModule;

    case 'section':
      if (!str(o.title) || !str(o.content)) return null;
      return o as unknown as TeachingModule;

    case 'keypoints':
      if (!arr(o.items) || !(o.items as unknown[]).every(s => typeof s === 'string')) return null;
      if (o.reveal !== 'one-by-one' && o.reveal !== 'all') delete o.reveal;
      return o as unknown as TeachingModule;

    case 'definition':
      if (!str(o.term) || !str(o.definition)) return null;
      return o as unknown as TeachingModule;

    case 'formula':
      if (!str(o.latex)) return null;
      return o as unknown as TeachingModule;

    case 'callout':
      if (!str(o.body)) return null;
      if (!VALID_CALLOUT_VARIANTS.has(o.variant as string)) o.variant = 'note';
      return o as unknown as TeachingModule;

    case 'qa':
      if (!str(o.question) || !str(o.answer)) return null;
      return o as unknown as TeachingModule;

    case 'quiz': {
      if (!str(o.question) || !arr(o.options) || (o.options as unknown[]).length < 2) return null;
      if (typeof o.correctIndex !== 'number') return null;
      // Clamp correctIndex into valid range
      o.correctIndex = Math.max(0, Math.min(o.correctIndex as number, (o.options as unknown[]).length - 1));
      return o as unknown as TeachingModule;
    }

    case 'summary':
      if (!arr(o.points) || !(o.points as unknown[]).every(s => typeof s === 'string')) return null;
      if (o.reveal !== 'one-by-one' && o.reveal !== 'all') delete o.reveal;
      return o as unknown as TeachingModule;

    default:
      return null; // Unknown type — discard
  }
}

/** Sanitize an array of raw LLM-produced module objects. */
function sanitizeModules(raw: unknown[]): TeachingModule[] {
  return raw.map(validateModule).filter(Boolean) as TeachingModule[];
}

/** Describe validation issues for the retry feedback message. */
function describeModuleIssues(raw: unknown[]): string {
  const issues: string[] = [];
  (raw ?? []).forEach((m, i) => {
    if (!m || typeof m !== 'object') { issues.push(`Item ${i}: not an object`); return; }
    const o = m as Record<string, unknown>;
    if (!o.type) { issues.push(`Item ${i}: missing "type"`); return; }
    if (validateModule(m) === null) issues.push(`Item ${i} (type="${o.type}"): missing required fields`);
  });
  return issues.slice(0, 8).join('; ') || 'unknown validation error';
}

function buildSourcePayload(doc: Document, annotations: Annotation[]) {
  const annLines = annotations.map((a, i) => ({
    id: a.id || `ann-${i + 1}`,
    selectedText: a.selectedText,
    comment: a.comment || '',
    llmResponse: a.llmResponse || '',
  }));
  return {
    title: doc.title,
    note: doc.content || doc.extractedText || '',
    annotations: annLines,
  };
}

interface PlannerOutline {
  title: string;
  outline: {
    id: string;
    type: TeachingModule['type'];
    intent: string;
    size?: TeachingModule['size'];
    accent?: TeachingModule['accent'];
    sourceRefs?: string[];
  }[];
}

export interface PipelineOptions {
  signal?: AbortSignal;
  onProgress?: (p: Progress) => void;
}

/** Generate a teaching site through the 3-agent pipeline. */
export async function generateTeachingSite(
  doc: Document,
  annotations: Annotation[],
  provider: LLMProvider,
  options: PipelineOptions = {},
): Promise<TeachingSite> {
  const { signal, onProgress } = options;
  const source = buildSourcePayload(doc, annotations);
  const sourceStr = JSON.stringify(source, null, 2);

  // ─── 1) Planner ───────────────────────────────────────────────
  onProgress?.({ stage: 'planner', fraction: 0.05, message: '编排模块结构…' });
  const plannerRaw = await chatComplete(
    provider,
    [
      { role: 'system', content: PLANNER_SYSTEM },
      { role: 'user', content: `Source material (JSON):\n${sourceStr}` },
    ],
    signal,
  );
  const plan = extractJson<PlannerOutline>(plannerRaw);
  if (!plan?.outline?.length) {
    throw new Error('Planner returned an empty outline');
  }
  onProgress?.({ stage: 'planner', fraction: 0.33, message: `编排完成（${plan.outline.length} 个模块）` });

  // ─── 2) Generator (with retry) ────────────────────────────────
  const genUserMsg = `Source material (JSON):\n${sourceStr}\n\nPlanner outline:\n${JSON.stringify(plan, null, 2)}`;
  type GenMsg = { role: 'system' | 'user' | 'assistant'; content: string };
  const baseGenMessages: GenMsg[] = [
    { role: 'system', content: GENERATOR_SYSTEM },
    { role: 'user', content: genUserMsg },
  ];

  let generatedModules: TeachingModule[] | null = null;
  let lastGenRaw = '';
  let lastGenError = '';

  for (let attempt = 1; attempt <= 3; attempt++) {
    const messages: GenMsg[] = attempt === 1
      ? baseGenMessages
      : [
          ...baseGenMessages,
          { role: 'assistant', content: lastGenRaw },
          {
            role: 'user',
            content: `Your previous output had these issues: ${lastGenError}.\n` +
              `Please fix them and output ONLY the corrected JSON object with a "modules" array.`,
          },
        ];

    onProgress?.({
      stage: 'generator',
      fraction: 0.38 + (attempt - 1) * 0.08,
      message: attempt === 1 ? '生成模块内容…' : `重试生成（第 ${attempt} 次）…`,
    });

    lastGenRaw = await chatComplete(provider, messages, signal);

    try {
      const parsed = extractJson<{ modules: unknown[] }>(lastGenRaw);
      const rawArr: unknown[] = Array.isArray(parsed?.modules) ? parsed.modules : [];
      const valid = sanitizeModules(rawArr);

      if (valid.length < 2) {
        lastGenError = `Only ${valid.length} module(s) passed validation out of ${rawArr.length}. ` +
          describeModuleIssues(rawArr);
        continue;
      }

      generatedModules = valid;
      break;
    } catch (e) {
      lastGenError = (e as Error).message;
    }
  }

  if (!generatedModules) {
    throw new Error(`内容生成失败（已重试 3 次）：${lastGenError}`);
  }
  onProgress?.({ stage: 'generator', fraction: 0.7, message: `已生成 ${generatedModules.length} 个模块` });

  // ─── 3) Reviewer ──────────────────────────────────────────────
  onProgress?.({ stage: 'reviewer', fraction: 0.78, message: '审校事实与一致性…' });
  let finalModules = generatedModules;
  let reviewerNotes: string[] | undefined;
  try {
    const reviewerRaw = await chatComplete(
      provider,
      [
        { role: 'system', content: REVIEWER_SYSTEM },
        {
          role: 'user',
          content: `Source material (JSON):\n${sourceStr}\n\nGenerated modules:\n${JSON.stringify({ modules: generatedModules }, null, 2)}`,
        },
      ],
      signal,
    );
    const reviewed = extractJson<{ modules?: unknown[]; notes?: string[] }>(reviewerRaw);
    if (Array.isArray(reviewed?.modules) && reviewed.modules.length > 0) {
      const sanitized = sanitizeModules(reviewed.modules);
      // Only accept the reviewer's output if it preserved most of the modules;
      // if it somehow discarded too many, fall back to generator output.
      if (sanitized.length >= Math.ceil(generatedModules.length * 0.6)) {
        finalModules = sanitized;
      } else {
        reviewerNotes = ['审校输出模块数量过少，已保留生成阶段结果'];
      }
    }
    if (Array.isArray(reviewed?.notes)) reviewerNotes = reviewed.notes;
  } catch (err) {
    // Reviewer failure is non-fatal; fall back to generator output.
    reviewerNotes = [`审校阶段失败，已使用生成结果：${(err as Error).message}`];
  }
  onProgress?.({ stage: 'reviewer', fraction: 1, message: '完成' });

  // Ensure every module has an id
  finalModules = finalModules.map((m, i) => ({ ...m, id: m.id || `m${i + 1}` }));

  return {
    documentId: doc.id,
    title: plan.title || doc.title,
    generatedAt: Date.now(),
    model: provider.model,
    modules: finalModules,
    reviewerNotes,
  };
}
