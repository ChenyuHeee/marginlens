import { getSupabase } from './supabase';
import type { Annotation } from '@/types';

export type ShareMode = 'readonly' | 'import';
export type AccessMode = 'public' | 'restricted';

export interface SharedDocument {
  id: string;
  title: string;
  content: string;
  annotations: Pick<Annotation, 'id' | 'selectedText' | 'contextBefore' | 'contextAfter' | 'comment' | 'llmResponse' | 'color' | 'positionHint'>[];
  author_name: string | null;
  share_mode: ShareMode;
  access_mode: AccessMode;
  allowed_emails: string[];
  created_at: string;
}

export interface ShareOptions {
  shareMode?: ShareMode;
  accessMode?: AccessMode;
  allowedEmails?: string[];
}

/** Generate a random short token */
function randomToken(len = 10): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  const arr = crypto.getRandomValues(new Uint8Array(len));
  for (const byte of arr) result += chars[byte % chars.length];
  return result;
}

/**
 * Create a share for a markdown document. Returns the share token.
 * Requires the user to be signed in.
 */
export async function createShare(
  title: string,
  content: string,
  annotations: Annotation[],
  options: ShareOptions = {},
): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase not configured');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('请先登录以分享文档');

  const { shareMode = 'readonly', accessMode = 'public', allowedEmails = [] } = options;

  const id = randomToken(10);
  const annData = annotations.map(({ id: aId, selectedText, contextBefore, contextAfter, comment, llmResponse, color, positionHint }) => ({
    id: aId, selectedText, contextBefore, contextAfter, comment, llmResponse, color, positionHint,
  }));

  const author_name = user.user_metadata?.full_name || user.user_metadata?.name || user.email || null;

  const { error } = await supabase.from('shared_documents').insert({
    id,
    title,
    content,
    annotations: annData,
    created_by: user.id,
    author_name,
    share_mode: shareMode,
    access_mode: accessMode,
    allowed_emails: allowedEmails,
  });

  if (error) throw new Error(`分享失败: ${error.message}`);
  return id;
}

/**
 * Load a shared document by token. No auth required.
 */
export async function loadShare(token: string): Promise<SharedDocument | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('shared_documents')
    .select('id, title, content, annotations, author_name, share_mode, access_mode, allowed_emails, created_at')
    .eq('id', token)
    .single();

  if (error || !data) return null;
  return data as SharedDocument;
}

/**
 * Delete a share. Only possible if the calling user is the creator (enforced by RLS).
 */
export async function deleteShare(token: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('shared_documents').delete().eq('id', token);
  if (error) throw new Error(`删除分享失败: ${error.message}`);
}

/** Build the full share URL for a given token */
export function buildShareUrl(token: string): string {
  const base = window.location.origin + window.location.pathname;
  return `${base}?share=${token}`;
}
