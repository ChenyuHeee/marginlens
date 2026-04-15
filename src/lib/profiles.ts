import { getSupabase } from './supabase';

export interface Profile {
  id: string;
  username: string;
  email: string | null;
  color: string;
}

const COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6',
];

function randomColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

export async function getMyProfile(): Promise<Profile | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return data as Profile | null;
}

export async function upsertProfile(username: string): Promise<{ error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Supabase not configured' };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '未登录' };

  const { error } = await supabase.from('profiles').upsert({
    id: user.id,
    username: username.trim(),
    email: user.email ?? null,
    color: randomColor(),
  }, { onConflict: 'id' });

  if (error) {
    if (error.code === '23505') return { error: '该用户名已被占用，请换一个' };
    return { error: error.message };
  }
  return {};
}

export async function searchProfiles(query: string): Promise<Profile[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const { data } = await supabase
    .from('profiles')
    .select('id, username, email, color')
    .or(`username.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(8);
  return (data ?? []) as Profile[];
}
