import type { Annotation, Document, LLMProvider } from '@/types';
import { streamChat } from '@/lib/llm';
import { recordApiUsage } from '@/lib/db';
import { PLANNER_SYSTEM, GENERATOR_SYSTEM, REVIEWER_SYSTEM } from './prompts';
import type { TeachingModule, TeachingSite } from './templates';

export type Stage = 'planner' | 'generator' | 'reviewer';
export interface Progress {
  stage: Stage;
  /** 0..1 */
  fraction: number;
  message?: string;
  /** Live partial output from the current LLM call — for streaming log display */
  streamBuffer?: string;
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
  onChunk?: (partial: string) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const today = new Date().toISOString().slice(0, 10);
    streamChat(
      provider,
      messages,
      {
        onToken: (t) => {
          buffer += t;
          onChunk?.(buffer);
        },
        onDone: () => resolve(buffer),
        onError: (e) => reject(e),
        onUsage: ({ promptTokens, completionTokens }) => {
          recordApiUsage(today, provider.id, provider.name, provider.model, promptTokens, completionTokens)
            .catch(() => { /* non-fatal */ });
        },
      },
      signal,
    );
  });
}

/** Extract a JSON object from arbitrary LLM output, tolerating code fences. */
function extractJson<T = unknown>(raw: string): T {
  let s = raw.trim();
  // Strip ```json ... ``` or ``` ... ``` fences (they may appear anywhere in the string)
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // Prefer a JSON object block first...
  const objStart = s.indexOf('{');
  // ...but also look for a bare array (LLM sometimes skips the wrapper object)
  const arrStart = s.indexOf('[');
  const start = objStart === -1
    ? arrStart
    : arrStart !== -1 && arrStart < objStart
      ? arrStart
      : objStart;
  if (start === -1) throw new Error('LLM output contains no JSON');
  const opener = s[start];
  const closer = opener === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === opener) depth++;
    else if (ch === closer) {
      depth--;
      if (depth === 0) {
        const candidate = s.slice(start, i + 1);
        const parsed = JSON.parse(candidate) as T;
        // If we got a bare array, wrap it in { modules: [...] } for the Generator caller
        if (Array.isArray(parsed)) return { modules: parsed } as unknown as T;
        return parsed;
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

/** Coerce an array that may contain objects with a `.text` field into string[]. */
function coerceStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const result: string[] = [];
  for (const item of v) {
    if (typeof item === 'string' && item.trim()) result.push(item);
    else if (item && typeof item === 'object') {
      const s = (item as Record<string, unknown>).text ?? (item as Record<string, unknown>).content ?? (item as Record<string, unknown>).value;
      if (typeof s === 'string' && s.trim()) result.push(s);
      else return null; // Can't auto-repair
    } else return null;
  }
  return result.length ? result : null;
}

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
      // Accept common field name aliases
      if (!str(o.content)) o.content = o.body ?? o.text;
      if (!str(o.title) || !str(o.content)) return null;
      return o as unknown as TeachingModule;

    case 'keypoints': {
      // Accept "points" as alias for "items"
      if (!arr(o.items) && arr(o.points)) o.items = o.points;
      const fixed = coerceStringArray(o.items);
      if (!fixed) return null;
      o.items = fixed;
      if (o.reveal !== 'one-by-one' && o.reveal !== 'all') delete o.reveal;
      return o as unknown as TeachingModule;
    }

    case 'definition':
      if (!str(o.definition)) o.definition = o.description ?? o.body ?? o.text;
      if (!str(o.term) || !str(o.definition)) return null;
      return o as unknown as TeachingModule;

    case 'formula':
      if (!str(o.latex)) o.latex = o.formula ?? o.equation;
      if (!str(o.latex)) return null;
      return o as unknown as TeachingModule;

    case 'callout':
      if (!str(o.body)) o.body = o.text ?? o.content;
      if (!str(o.body)) return null;
      if (!VALID_CALLOUT_VARIANTS.has(o.variant as string)) o.variant = 'note';
      return o as unknown as TeachingModule;

    case 'qa':
      if (!str(o.answer)) o.answer = o.response ?? o.text ?? o.body;
      if (!str(o.question) || !str(o.answer)) return null;
      return o as unknown as TeachingModule;

    case 'quiz': {
      if (!str(o.question) || !arr(o.options) || (o.options as unknown[]).length < 2) return null;
      if (typeof o.correctIndex !== 'number') return null;
      // Clamp correctIndex into valid range
      o.correctIndex = Math.max(0, Math.min(o.correctIndex as number, (o.options as unknown[]).length - 1));
      return o as unknown as TeachingModule;
    }

    case 'summary': {
      // Accept "items" as alias for "points"
      if (!arr(o.points) && arr(o.items)) o.points = o.items;
      const fixedPts = coerceStringArray(o.points);
      if (!fixedPts) return null;
      o.points = fixedPts;
      if (o.reveal !== 'one-by-one' && o.reveal !== 'all') delete o.reveal;
      return o as unknown as TeachingModule;
    }

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
  // Estimate ~1500 chars for planner output; fraction interpolates 0.03→0.30
  const PLANNER_EST = 1500;
  onProgress?.({ stage: 'planner', fraction: 0.03, message: '编排模块结构…' });
  const plannerRaw = await chatComplete(
    provider,
    [
      { role: 'system', content: PLANNER_SYSTEM },
      { role: 'user', content: `Source material (JSON):\n${sourceStr}` },
    ],
    signal,
    (partial) => {
      const frac = 0.03 + Math.min(partial.length / PLANNER_EST, 1) * 0.27;
      onProgress?.({ stage: 'planner', fraction: frac, message: '编排模块结构…', streamBuffer: partial });
    },
  );
  const plan = extractJson<PlannerOutline>(plannerRaw);
  if (!plan?.outline?.length) {
    throw new Error('Planner returned an empty outline');
  }
  onProgress?.({ stage: 'planner', fraction: 0.33, message: `编排完成（${plan.outline.length} 个模块）`, streamBuffer: plannerRaw });

  // ─── 2) Generator (with retry) ────────────────────────────────
  const genUserMsg = `Source material (JSON):\n${sourceStr}\n\nPlanner outline:\n${JSON.stringify(plan, null, 2)}`;
  type GenMsg = { role: 'system' | 'user' | 'assistant'; content: string };

  let generatedModules: TeachingModule[] | null = null;
  let lastGenError = '';

  for (let attempt = 1; attempt <= 2; attempt++) {
    // Retry uses a fresh conversation (not appending previous output) to avoid
    // context bloat. Error hint is prepended to the user turn instead.
    const userContent = attempt === 1
      ? genUserMsg
      : `${genUserMsg}\n\nNOTE: A previous attempt was rejected because: ${lastGenError}. ` +
        `Ensure every module has all required fields as specified in the schema.`;

    const messages: GenMsg[] = [
      { role: 'system', content: GENERATOR_SYSTEM },
      { role: 'user', content: userContent },
    ];

    // Generator output estimated ~8000 chars; each attempt spans 0.12 of the bar
    const GEN_EST = 8000;
    const genBase = 0.36 + (attempt - 1) * 0.14;
    const genMsg = attempt === 1 ? '生成模块内容…' : `重试生成（第 ${attempt} 次）…`;
    onProgress?.({ stage: 'generator', fraction: genBase, message: genMsg });

    const raw = await chatComplete(provider, messages, signal, (partial) => {
      const frac = genBase + Math.min(partial.length / GEN_EST, 1) * 0.22;
      onProgress?.({ stage: 'generator', fraction: frac, message: genMsg, streamBuffer: partial });
    });

    try {
      const parsed = extractJson<{ modules: unknown[] }>(raw);
      const rawArr: unknown[] = Array.isArray(parsed?.modules) ? parsed.modules : [];
      const valid = sanitizeModules(rawArr);

      if (valid.length < 2) {
        lastGenError = `Only ${valid.length} module(s) passed validation out of ${rawArr.length}. ` +
          describeModuleIssues(rawArr);
        console.warn('[Teaching] Generator validation failed (attempt', attempt, '):', lastGenError, '\nFirst 500 chars:', raw.slice(0, 500));
        continue;
      }

      generatedModules = valid;
      break;
    } catch (e) {
      lastGenError = (e as Error).message;
      console.warn('[Teaching] Generator JSON parse error (attempt', attempt, '):', lastGenError, '\nFirst 500 chars:', raw.slice(0, 500));
    }
  }

  if (!generatedModules) {
    throw new Error(`内容生成失败（已重试）：${lastGenError}`);
  }
  onProgress?.({ stage: 'generator', fraction: 0.70, message: `已生成 ${generatedModules.length} 个模块` });

  // ─── 3) Reviewer ──────────────────────────────────────────────
  // Reviewer output estimated ~8000 chars; fraction spans 0.72→0.97
  const REV_EST = 8000;
  onProgress?.({ stage: 'reviewer', fraction: 0.72, message: '审校事实与一致性…' });
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
      (partial) => {
        const frac = 0.72 + Math.min(partial.length / REV_EST, 1) * 0.25;
        onProgress?.({ stage: 'reviewer', fraction: frac, message: '审校事实与一致性…', streamBuffer: partial });
      },
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
