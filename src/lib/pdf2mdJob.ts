/**
 * PDF → Markdown conversion job API.
 *
 * Flow:
 *   1. createPdf2mdJob(doc)
 *        a. Uploads raw PDF bytes to Supabase Storage `pdf-uploads/<jobId>.pdf`
 *        b. Inserts a row in `pdf2md_jobs` table with status='pending'
 *        c. Fires trigger-pdf2md-workflow Edge Function (no-wait)
 *   2. GitHub Actions worker picks up pending jobs, runs PDF2MD, uploads result
 *      markdown to `pdf-md-results/<jobId>.md`, sets status='done' + result_url
 *   3. Frontend polls getPdf2mdJob(id) every 5s until done/error
 *   4. On done: downloadResultMarkdown() → create new doc in document store
 *   5. Job ID is persisted in localStorage per document so it survives refresh
 *
 * ── Required Supabase setup (run once in SQL Editor) ────────────────────────
 * CREATE TABLE pdf2md_jobs (
 *   id              TEXT PRIMARY KEY,
 *   document_id     TEXT NOT NULL,
 *   pdf_storage_path TEXT NOT NULL,
 *   result_url      TEXT,
 *   status          TEXT NOT NULL DEFAULT 'pending',
 *   error_msg       TEXT,
 *   created_at      TIMESTAMPTZ DEFAULT NOW()
 * );
 * ALTER TABLE pdf2md_jobs ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "insert own" ON pdf2md_jobs FOR INSERT TO authenticated WITH CHECK (true);
 * CREATE POLICY "read by id" ON pdf2md_jobs FOR SELECT USING (true);
 * CREATE POLICY "service update" ON pdf2md_jobs FOR UPDATE USING (true);
 *
 * Create two Supabase Storage buckets:
 *   - pdf-uploads      (private — only service role can read)
 *   - pdf-md-results   (public)
 * ────────────────────────────────────────────────────────────────────────────
 */

import { getSupabase } from './supabase';
import type { Document } from '@/types';

function randomId(len = 14): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const buf = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(buf, (b) => chars[b % chars.length]).join('');
}

export type Pdf2mdStatus = 'pending' | 'processing' | 'done' | 'error';

export interface Pdf2mdJob {
  id: string;
  status: Pdf2mdStatus;
  result_url?: string | null;
  error_msg?: string | null;
}

const LS_PREFIX = 'pdf2md_job_';

export function savePdf2mdJobId(documentId: string, jobId: string) {
  localStorage.setItem(LS_PREFIX + documentId, jobId);
}
export function loadPdf2mdJobId(documentId: string): string | null {
  return localStorage.getItem(LS_PREFIX + documentId);
}
export function clearPdf2mdJobId(documentId: string) {
  localStorage.removeItem(LS_PREFIX + documentId);
}

/** Upload PDF and create a conversion job. Returns job ID. Does NOT trigger workflow — caller should call triggerPdf2mdWorkflow() separately. */
export async function createPdf2mdJob(doc: Document): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase 未配置');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('请先登录以使用转换功能');

  if (!doc.pdfData) throw new Error('PDF 数据不可用');

  const id = randomId(14);
  const pdfPath = `${id}.pdf`;

  // Upload raw PDF bytes to private storage
  const { error: uploadErr } = await supabase.storage
    .from('pdf-uploads')
    .upload(pdfPath, new Uint8Array(doc.pdfData), {
      contentType: 'application/pdf',
      upsert: false,
    });
  if (uploadErr) throw new Error(`PDF 上传失败: ${uploadErr.message}`);

  // Create job record
  const { error: insertErr } = await supabase
    .from('pdf2md_jobs')
    .insert({ id, document_id: doc.id, pdf_storage_path: pdfPath, status: 'pending' });
  if (insertErr) throw new Error(`任务创建失败: ${insertErr.message}`);

  return id;
}

/**
 * Trigger GitHub Actions workflow_dispatch via Edge Function.
 * Returns a human-readable result string for logging.
 */
export async function triggerPdf2mdWorkflow(): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) return '⚠️  Supabase 未配置，跳过触发';
  try {
    const { error } = await supabase.functions.invoke('trigger-pdf2md-workflow');
    if (error) return `⚠️  触发失败: ${error.message}（cron 将在 3 分钟内自动处理）`;
    return '✅ GitHub Actions workflow 已触发';
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `⚠️  触发异常: ${msg}（cron 将在 3 分钟内自动处理）`;
  }
}

/** Poll a job's current status. */
export async function getPdf2mdJob(id: string): Promise<Pdf2mdJob | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('pdf2md_jobs')
    .select('id, status, result_url, error_msg')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return data as Pdf2mdJob;
}

/** Download the converted markdown text from the result URL. */
export async function downloadResultMarkdown(resultUrl: string): Promise<string> {
  const resp = await fetch(resultUrl);
  if (!resp.ok) throw new Error(`下载转换结果失败: ${resp.status}`);
  return resp.text();
}
