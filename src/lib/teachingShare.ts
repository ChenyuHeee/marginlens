import { getSupabase } from './supabase';
import type { TeachingSite } from './teaching/templates';

/** Generate a random short token */
function randomToken(len = 10): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  const arr = crypto.getRandomValues(new Uint8Array(len));
  for (const byte of arr) result += chars[byte % chars.length];
  return result;
}

/**
 * Upload a TeachingSite to Supabase and return the share token.
 * Requires the user to be signed in.
 */
export async function createTeachingShare(site: TeachingSite): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase 未配置，无法生成分享链接');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('请先登录以分享演示文稿');

  const id = randomToken(10);
  const author_name = user.user_metadata?.full_name || user.user_metadata?.name || user.email || null;

  const { error } = await supabase.from('shared_teaching_sites').insert({
    id,
    title: site.title,
    site_data: site,
    created_by: user.id,
    author_name,
  });

  if (error) throw new Error(`分享失败: ${error.message}`);
  return id;
}

/**
 * Load a shared TeachingSite by token. No auth required (public read).
 */
export async function loadTeachingShare(token: string): Promise<{ site: TeachingSite; author_name: string | null } | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('shared_teaching_sites')
    .select('site_data, author_name')
    .eq('id', token)
    .single();

  if (error || !data) return null;
  return { site: data.site_data as TeachingSite, author_name: data.author_name };
}

/**
 * Delete a teaching share. Only the creator can do this (enforced by RLS).
 */
export async function deleteTeachingShare(token: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase 未配置');
  const { error } = await supabase.from('shared_teaching_sites').delete().eq('id', token);
  if (error) throw new Error(`删除分享失败: ${error.message}`);
}

/** Build the full share URL for a given token */
export function buildTeachingShareUrl(token: string): string {
  const base = window.location.origin + window.location.pathname;
  return `${base}?teach-share=${token}`;
}
