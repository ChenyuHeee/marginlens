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

  // ─── 2) Generator ─────────────────────────────────────────────
  onProgress?.({ stage: 'generator', fraction: 0.4, message: '生成模块内容…' });
  const generatorRaw = await chatComplete(
    provider,
    [
      { role: 'system', content: GENERATOR_SYSTEM },
      { role: 'user', content: `Source material (JSON):\n${sourceStr}\n\nPlanner outline:\n${JSON.stringify(plan, null, 2)}` },
    ],
    signal,
  );
  const generated = extractJson<{ modules: TeachingModule[] }>(generatorRaw);
  if (!generated?.modules?.length) {
    throw new Error('Generator returned no modules');
  }
  onProgress?.({ stage: 'generator', fraction: 0.7, message: `已生成 ${generated.modules.length} 个模块` });

  // ─── 3) Reviewer ──────────────────────────────────────────────
  onProgress?.({ stage: 'reviewer', fraction: 0.78, message: '审校事实与一致性…' });
  let finalModules = generated.modules;
  let reviewerNotes: string[] | undefined;
  try {
    const reviewerRaw = await chatComplete(
      provider,
      [
        { role: 'system', content: REVIEWER_SYSTEM },
        {
          role: 'user',
          content: `Source material (JSON):\n${sourceStr}\n\nGenerated modules:\n${JSON.stringify(generated, null, 2)}`,
        },
      ],
      signal,
    );
    const reviewed = extractJson<{ modules?: TeachingModule[]; notes?: string[] }>(reviewerRaw);
    if (Array.isArray(reviewed?.modules) && reviewed.modules.length > 0) {
      finalModules = reviewed.modules;
    }
    reviewerNotes = reviewed?.notes;
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
