/**
 * Cloud sync service — syncs markdown documents, annotations, chat sessions,
 * and settings to Supabase. PDFs are excluded (too large for auto-sync).
 */
import { getSupabase } from './supabase';
import * as db from './db';
import type { Document, Annotation, ChatSession, AppSettings } from '@/types';

// ─── Push: local → cloud ───

export async function pushDocuments(userId: string): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;

  const docs = await db.getAllDocuments();
  // Only sync markdown documents
  const mdDocs = docs.filter((d) => d.type === 'markdown');
  if (mdDocs.length === 0) return 0;

  const rows = mdDocs.map((d) => ({
    id: d.id,
    user_id: userId,
    title: d.title,
    type: d.type,
    content: d.content,
    file_size: d.fileSize,
    created_at: new Date(d.createdAt).toISOString(),
    updated_at: new Date(d.updatedAt).toISOString(),
  }));

  const { error } = await supabase
    .from('documents')
    .upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(`Push documents failed: ${error.message}`);
  return rows.length;
}

export async function pushAnnotations(userId: string): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;

  // Collect annotations for all documents
  const docs = await db.getAllDocuments();
  const allAnnotations: Annotation[] = [];
  for (const doc of docs) {
    const anns = await db.getAnnotationsByDocument(doc.id);
    allAnnotations.push(...anns);
  }
  if (allAnnotations.length === 0) return 0;

  const rows = allAnnotations.map((a) => ({
    id: a.id,
    user_id: userId,
    document_id: a.documentId,
    selected_text: a.selectedText,
    context_before: a.contextBefore,
    context_after: a.contextAfter,
    comment: a.comment,
    llm_response: a.llmResponse || null,
    color: a.color,
    position_hint: a.positionHint || null,
    created_at: new Date(a.createdAt).toISOString(),
    updated_at: new Date(a.updatedAt).toISOString(),
  }));

  const { error } = await supabase
    .from('annotations')
    .upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(`Push annotations failed: ${error.message}`);
  return rows.length;
}

export async function pushChatSessions(userId: string): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;

  const docs = await db.getAllDocuments();
  const allSessions: ChatSession[] = [];
  for (const doc of docs) {
    const sessions = await db.getChatSessionsByDocument(doc.id);
    allSessions.push(...sessions);
  }
  if (allSessions.length === 0) return 0;

  const rows = allSessions.map((s) => ({
    id: s.id,
    user_id: userId,
    document_id: s.documentId,
    title: s.title,
    messages: s.messages,
    created_at: new Date(s.createdAt).toISOString(),
    updated_at: new Date(s.updatedAt).toISOString(),
  }));

  const { error } = await supabase
    .from('chat_sessions')
    .upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(`Push chat sessions failed: ${error.message}`);
  return rows.length;
}

export async function pushSettings(userId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const settings = await db.getSettings();
  if (!settings) return;

  // Strip API keys before syncing to cloud
  const safeSettings = {
    ...settings,
    providers: settings.providers.map((p) => ({ ...p, apiKey: '' })),
  };

  const { error } = await supabase
    .from('user_settings')
    .upsert({
      user_id: userId,
      settings: safeSettings,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  if (error) throw new Error(`Push settings failed: ${error.message}`);
}

// ─── Pull: cloud → local ───

export async function pullDocuments(userId: string): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;

  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', userId);
  if (error) throw new Error(`Pull documents failed: ${error.message}`);
  if (!data || data.length === 0) return 0;

  let count = 0;
  for (const row of data) {
    const local = await db.getDocument(row.id);
    const cloudUpdated = new Date(row.updated_at).getTime();

    // Skip if local version is newer
    if (local && local.updatedAt >= cloudUpdated) continue;

    const doc: Document = {
      id: row.id,
      title: row.title,
      type: row.type,
      content: row.content,
      fileSize: row.file_size,
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: cloudUpdated,
    };
    await db.saveDocument(doc);
    count++;
  }
  return count;
}

export async function pullAnnotations(userId: string): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;

  const { data, error } = await supabase
    .from('annotations')
    .select('*')
    .eq('user_id', userId);
  if (error) throw new Error(`Pull annotations failed: ${error.message}`);
  if (!data || data.length === 0) return 0;

  let count = 0;
  for (const row of data) {
    const ann: Annotation = {
      id: row.id,
      documentId: row.document_id,
      selectedText: row.selected_text,
      contextBefore: row.context_before,
      contextAfter: row.context_after,
      comment: row.comment,
      llmResponse: row.llm_response || undefined,
      color: row.color,
      positionHint: row.position_hint || undefined,
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
    };
    await db.saveAnnotation(ann);
    count++;
  }
  return count;
}

export async function pullChatSessions(userId: string): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;

  const { data, error } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('user_id', userId);
  if (error) throw new Error(`Pull chat sessions failed: ${error.message}`);
  if (!data || data.length === 0) return 0;

  let count = 0;
  for (const row of data) {
    const session: ChatSession = {
      id: row.id,
      documentId: row.document_id,
      title: row.title,
      messages: row.messages,
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
    };
    await db.saveChatSession(session);
    count++;
  }
  return count;
}

export async function pullSettings(userId: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  const { data, error } = await supabase
    .from('user_settings')
    .select('settings')
    .eq('user_id', userId)
    .single();
  if (error || !data) return false;

  const cloudSettings = data.settings as AppSettings;
  const localSettings = await db.getSettings();

  if (localSettings) {
    // Merge: keep local API keys, take cloud everything else
    const merged: AppSettings = {
      ...cloudSettings,
      providers: cloudSettings.providers.map((cp) => {
        const localProvider = localSettings.providers.find((lp) => lp.id === cp.id);
        return { ...cp, apiKey: localProvider?.apiKey || cp.apiKey };
      }),
    };
    await db.saveSettings(merged);
  } else {
    await db.saveSettings(cloudSettings);
  }
  return true;
}

// ─── Full sync ───

export interface SyncResult {
  pushed: { documents: number; annotations: number; chatSessions: number; settings: boolean };
  pulled: { documents: number; annotations: number; chatSessions: number; settings: boolean };
}

export async function fullSync(userId: string): Promise<SyncResult> {
  // Pull first (cloud → local), then push (local → cloud)
  const pulled = {
    documents: await pullDocuments(userId),
    annotations: await pullAnnotations(userId),
    chatSessions: await pullChatSessions(userId),
    settings: await pullSettings(userId),
  };

  const pushed = {
    documents: await pushDocuments(userId),
    annotations: await pushAnnotations(userId),
    chatSessions: await pushChatSessions(userId),
    settings: (await pushSettings(userId), true),
  };

  return { pushed, pulled };
}

// ─── Delete cloud data for removed items ───

export async function deleteCloudDocument(docId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.from('annotations').delete().eq('document_id', docId);
  await supabase.from('chat_sessions').delete().eq('document_id', docId);
  await supabase.from('documents').delete().eq('id', docId);
}

export async function deleteCloudAnnotation(annId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.from('annotations').delete().eq('id', annId);
}

export async function deleteCloudChatSession(sessionId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.from('chat_sessions').delete().eq('id', sessionId);
}
