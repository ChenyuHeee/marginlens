/**
 * PPT export job API.
 *
 * Flow:
 *   1. createPptJob(site)  → inserts row in `ppt_jobs` table, returns job ID
 *   2. GitHub Actions (scheduled) picks up pending jobs, generates .pptx,
 *      uploads to Supabase Storage `ppt-exports`, sets status='done' + pptx_url
 *   3. Frontend polls getPptJob(id) every 5 s until done/error
 *   4. Job ID is persisted in localStorage so the download link survives refresh
 *
 * Required Supabase setup (run once):
 * ─────────────────────────────────────────────────────────────────────────────
 * CREATE TABLE ppt_jobs (
 *   id          TEXT PRIMARY KEY,
 *   site_data   JSONB NOT NULL,
 *   pptx_url    TEXT,
 *   status      TEXT NOT NULL DEFAULT 'pending',
 *   error_msg   TEXT,
 *   created_at  TIMESTAMPTZ DEFAULT NOW()
 * );
 * ALTER TABLE ppt_jobs ENABLE ROW LEVEL SECURITY;
 * -- authenticated users can create jobs
 * CREATE POLICY "insert own" ON ppt_jobs FOR INSERT TO authenticated WITH CHECK (true);
 * -- anyone with the ID can poll (no secret in the ID — it's opaque)
 * CREATE POLICY "read by id" ON ppt_jobs FOR SELECT USING (true);
 *
 * Also create a Supabase Storage bucket named `ppt-exports` (set to Public).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getSupabase } from './supabase';
import type { TeachingSite } from './teaching/templates';

function randomId(len = 14): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const buf = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(buf, (b) => chars[b % chars.length]).join('');
}

export type PptStatus = 'pending' | 'processing' | 'done' | 'error';

export interface PptJob {
  id: string;
  status: PptStatus;
  pptx_url?: string | null;
  error_msg?: string | null;
}

/** Submit a new PPT export job. Returns the job ID. */
export async function createPptJob(site: TeachingSite): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase 未配置，无法导出 PPT');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('请先登录以导出 PPT');

  const id = randomId(14);
  const { error } = await supabase
    .from('ppt_jobs')
    .insert({ id, site_data: site, status: 'pending' });

  if (error) throw new Error(`PPT 任务提交失败: ${error.message}`);

  // Immediately trigger the GitHub Actions workflow so generation starts at once
  // instead of waiting for the 3-minute cron. Fire-and-forget — if it fails the
  // cron will pick it up anyway, so don't throw on trigger errors.
  supabase.functions
    .invoke('trigger-ppt-workflow')
    .catch((e) => console.warn('[PPT] workflow trigger failed (cron will retry):', e));

  return id;
}

/** Poll a job's current status + download URL. */
export async function getPptJob(id: string): Promise<PptJob | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('ppt_jobs')
    .select('id, status, pptx_url, error_msg')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return data as PptJob;
}

// ── Per-document persistence in localStorage ─────────────────────────────────
const lsKey = (docId: string) => `marginlens:ppt-job:${docId}`;

export function loadPptJobId(documentId: string): string | null {
  try { return localStorage.getItem(lsKey(documentId)); }
  catch { return null; }
}

export function savePptJobId(documentId: string, jobId: string): void {
  try { localStorage.setItem(lsKey(documentId), jobId); }
  catch { /* storage full or blocked */ }
}

export function clearPptJobId(documentId: string): void {
  try { localStorage.removeItem(lsKey(documentId)); }
  catch { /* ignore */ }
}
