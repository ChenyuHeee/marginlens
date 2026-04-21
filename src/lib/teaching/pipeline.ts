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
  /**
   * Streaming log patch for one lane. Parent should accumulate
   * { [key]: { label, text } } across all onProgress calls.
   * key format: "planner" | "gen-N" | "rev-N"
   */
  streamLane?: { key: string; label: string; text: string };
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
  /** Override max_tokens for this call (useful for Generator/Reviewer which need more output budget). */
  maxTokensOverride?: number,
): Promise<string> {
  const effectiveProvider = maxTokensOverride
    ? { ...provider, maxTokens: Math.max(provider.maxTokens, maxTokensOverride) }
    : provider;
  return new Promise((resolve, reject) => {
    let buffer = '';
    const today = new Date().toISOString().slice(0, 10);
    streamChat(
      effectiveProvider,
      messages,
      {
        onToken: (t) => {
          buffer += t;
          onChunk?.(buffer);
        },
        onDone: () => resolve(buffer),
        onError: (e) => reject(e),
        onUsage: ({ promptTokens, completionTokens }) => {
          recordApiUsage(today, effectiveProvider.id, effectiveProvider.name, effectiveProvider.model, promptTokens, completionTokens)
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
      onProgress?.({ stage: 'planner', fraction: frac, message: '编排模块结构…', streamLane: { key: 'planner', label: 'Planner', text: partial } });
    },
  );
  const plan = extractJson<PlannerOutline>(plannerRaw);
  if (!plan?.outline?.length) {
    throw new Error('Planner returned an empty outline');
  }
  onProgress?.({ stage: 'planner', fraction: 0.33, message: `编排完成（${plan.outline.length} 个模块）`, streamLane: { key: 'planner', label: 'Planner', text: plannerRaw } });

  // ─── 2) Generator (batched for large outlines) ────────────────────────────
  // Strategy: split the Planner outline into batches of BATCH_SIZE modules.
  // Each batch is a separate Generator call → output always fits within the
  // 8192-token budget even for very large notes. The source note is truncated
  // per call to keep input tokens manageable; the Planner outline has already
  // captured the full structure.
  const BATCH_SIZE = 6;
  const NOTE_MAX_CHARS = 12_000;
  const EST_CHARS_PER_MODULE = 600; // expected streaming output chars per module

  const genSource = source.note.length > NOTE_MAX_CHARS
    ? { ...source, note: source.note.slice(0, NOTE_MAX_CHARS) + '\n\n…（笔记原文超长已截断，请按 Planner 大纲生成内容）' }
    : source;
  const genSourceStr = JSON.stringify(genSource, null, 2);
  const planStr = JSON.stringify(plan, null, 2);

  // Split outline into batches
  const outlineBatches: (typeof plan.outline)[] = [];
  for (let i = 0; i < plan.outline.length; i += BATCH_SIZE) {
    outlineBatches.push(plan.outline.slice(i, i + BATCH_SIZE));
  }

  const GEN_FRAC_START = 0.36;
  const GEN_FRAC_END = 0.68;
  const totalGenBatches = outlineBatches.length;

  // Track how many generator batches have completed (for progress display)
  let genBatchesDone = 0;

  /** Run one generator batch, returning its valid modules (throws on total failure). */
  async function runGenBatch(batch: typeof plan.outline, batchIdx: number): Promise<TeachingModule[]> {
    const batchIds = batch.map((m) => m.id).join(', ');
    const batchEst = EST_CHARS_PER_MODULE * batch.length;
    const batchHint = totalGenBatches > 1
      ? `\n\nIMPORTANT: This is batch ${batchIdx + 1} of ${totalGenBatches}. Generate ONLY the following modules (by id): ${batchIds}. The full outline is provided for context only.`
      : '';
    const baseUserMsg = `Source material (JSON):\n${genSourceStr}\n\nPlanner outline:\n${planStr}${batchHint}`;

    let lastBatchError = '';
    for (let attempt = 1; attempt <= 2; attempt++) {
      const userContent = attempt === 1
        ? baseUserMsg
        : `${baseUserMsg}\n\nNOTE: Previous attempt failed because: ${lastBatchError}. Ensure all required fields are present.`;

      const genMsg = totalGenBatches > 1
        ? `并行生成批次 ${batchIdx + 1}/${totalGenBatches}（模块 ${batchIds}）…`
        : attempt === 1 ? '生成模块内容…' : '重试生成…';

      // Fractional position for this batch (based on batches completed so far)
      const fStart = GEN_FRAC_START + (genBatchesDone / totalGenBatches) * (GEN_FRAC_END - GEN_FRAC_START);
      onProgress?.({ stage: 'generator', fraction: fStart, message: genMsg });

      const raw = await chatComplete(
        provider,
        [
          { role: 'system', content: GENERATOR_SYSTEM },
          { role: 'user', content: userContent },
        ],
        signal,
        (partial) => {
          const f = fStart + Math.min(partial.length / batchEst, 1) * ((GEN_FRAC_END - GEN_FRAC_START) / totalGenBatches);
          onProgress?.({ stage: 'generator', fraction: f, message: genMsg, streamLane: { key: `gen-${batchIdx}`, label: `G${batchIdx + 1}`, text: partial } });
        },
        8192,
      );

      try {
        const parsed = extractJson<{ modules: unknown[] }>(raw);
        const rawArr: unknown[] = Array.isArray(parsed?.modules) ? parsed.modules : [];
        const valid = sanitizeModules(rawArr);
        if (valid.length < 1) {
          lastBatchError = `No valid modules in batch ${batchIdx + 1}. ${describeModuleIssues(rawArr)}`;
          console.warn('[Teaching] Generator batch', batchIdx + 1, 'validation failed:', lastBatchError);
          continue;
        }
        genBatchesDone++;
        return valid;
      } catch (e) {
        lastBatchError = (e as Error).message;
        console.warn('[Teaching] Generator batch', batchIdx + 1, 'JSON error:', lastBatchError);
      }
    }
    throw new Error(`内容生成失败（批次 ${batchIdx + 1} 已重试）：${lastBatchError}`);
  }

  // ── Run all generator batches in PARALLEL ──────────────────────────────────
  const genBatchResults = await Promise.all(
    outlineBatches.map((batch, idx) => runGenBatch(batch, idx)),
  );
  const generatedModules = genBatchResults.flat();
  onProgress?.({ stage: 'generator', fraction: GEN_FRAC_END, message: `已生成 ${generatedModules.length} 个模块` });

  // ─── 3) Reviewer (all batches in PARALLEL) ────────────────────────────────
  const REV_FRAC_START = 0.72;
  const revBatches: TeachingModule[][] = [];
  for (let i = 0; i < generatedModules.length; i += BATCH_SIZE) {
    revBatches.push(generatedModules.slice(i, i + BATCH_SIZE));
  }
  const totalRevBatches = revBatches.length;
  let revBatchesDone = 0;

  type RevResult = { modules: TeachingModule[]; notes: string[] };

  async function runRevBatch(batch: TeachingModule[], batchIdx: number): Promise<RevResult> {
    const batchEst = EST_CHARS_PER_MODULE * batch.length;
    const revMsg = totalRevBatches > 1
      ? `并行审校批次 ${batchIdx + 1}/${totalRevBatches}…`
      : '审校事实与一致性…';

    const fStart = REV_FRAC_START + (revBatchesDone / totalRevBatches) * (1 - REV_FRAC_START);
    onProgress?.({ stage: 'reviewer', fraction: fStart, message: revMsg });

    try {
      const reviewerRaw = await chatComplete(
        provider,
        [
          { role: 'system', content: REVIEWER_SYSTEM },
          {
            role: 'user',
            content: `Source material (JSON):\n${genSourceStr}\n\nGenerated modules:\n${JSON.stringify({ modules: batch }, null, 2)}`,
          },
        ],
        signal,
        (partial) => {
          const f = fStart + Math.min(partial.length / batchEst, 1) * ((1 - REV_FRAC_START) / totalRevBatches);
          onProgress?.({ stage: 'reviewer', fraction: f, message: revMsg, streamLane: { key: `rev-${batchIdx}`, label: `R${batchIdx + 1}`, text: partial } });
        },
        8192,
      );
      const reviewed = extractJson<{ modules?: unknown[]; notes?: string[] }>(reviewerRaw);
      const notes: string[] = Array.isArray(reviewed?.notes) ? (reviewed.notes as string[]) : [];
      if (Array.isArray(reviewed?.modules) && reviewed.modules.length > 0) {
        const sanitized = sanitizeModules(reviewed.modules);
        if (sanitized.length >= Math.ceil(batch.length * 0.6)) {
          revBatchesDone++;
          return { modules: sanitized, notes };
        }
        return { modules: batch, notes: [...notes, `批次 ${batchIdx + 1} 审校结果少于预期，已保留原始内容`] };
      }
      revBatchesDone++;
      return { modules: batch, notes };
    } catch (err) {
      return { modules: batch, notes: [`批次 ${batchIdx + 1} 审校失败，已使用生成结果：${(err as Error).message}`] };
    }
  }

  const revResults = await Promise.all(revBatches.map((batch, idx) => runRevBatch(batch, idx)));
  let finalModules: TeachingModule[] = revResults.flatMap((r) => r.modules);
  const reviewerNotes = revResults.flatMap((r) => r.notes).filter(Boolean) as string[] | undefined;

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
