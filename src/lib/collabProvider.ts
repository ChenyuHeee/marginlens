/**
 * Supabase Realtime provider for Y.js.
 *
 * Architecture:
 * - Each collab document has a Realtime Broadcast channel keyed by the share token.
 * - When the local Y.doc changes, we broadcast the incremental update to all peers.
 * - When we receive a broadcast, we apply the update to the local Y.doc.
 * - On init, we load the persisted snapshot from `collab_documents` and apply it.
 * - Periodically (every SNAPSHOT_INTERVAL ms), we persist the full state to Supabase.
 * - Realtime Presence tracks online users (username + cursor color).
 */

import * as Y from 'yjs';
import { getSupabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

const SNAPSHOT_INTERVAL = 10_000; // persist every 10s

export interface PresenceUser {
  userId: string;
  username: string;
  color: string;
}

export interface CollabProvider {
  doc: Y.Doc;
  awareness: Map<string, PresenceUser>; // clientId → user
  onAwarenessChange: (cb: (users: PresenceUser[]) => void) => () => void;
  destroy: () => void;
}

export async function createCollabProvider(
  shareId: string,
  selfUser: PresenceUser,
): Promise<CollabProvider> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase not configured');

  const doc = new Y.Doc();
  let channel: RealtimeChannel | null = null;
  let snapshotTimer: ReturnType<typeof setInterval> | null = null;
  const awarenessMap = new Map<string, PresenceUser>();
  const awarenessListeners = new Set<(users: PresenceUser[]) => void>();

  function notifyAwareness() {
    const users = Array.from(awarenessMap.values());
    for (const cb of awarenessListeners) cb(users);
  }

  // ── 1. Load persisted snapshot ──────────────────────────────────────────
  const { data: snap } = await supabase
    .from('collab_documents')
    .select('ydoc_state')
    .eq('id', shareId)
    .single();

  if (snap?.ydoc_state) {
    try {
      // ydoc_state is stored as base64 string in Supabase (bytea → text via JS)
      const bytes = Uint8Array.from(atob(snap.ydoc_state as unknown as string), (c) => c.charCodeAt(0));
      Y.applyUpdate(doc, bytes);
    } catch {
      // corrupt snapshot — ignore, start fresh
    }
  }

  // ── 2. Subscribe to Realtime Broadcast ─────────────────────────────────
  channel = supabase.channel(`collab:${shareId}`, {
    config: { broadcast: { self: false }, presence: { key: selfUser.userId } },
  });

  channel
    .on('broadcast', { event: 'ydoc-update' }, ({ payload }) => {
      try {
        const bytes = Uint8Array.from(atob(payload.update as string), (c) => c.charCodeAt(0));
        Y.applyUpdate(doc, bytes, 'remote');
      } catch { /* ignore malformed */ }
    })
    .on('presence', { event: 'sync' }, () => {
      const state = channel!.presenceState<PresenceUser>();
      awarenessMap.clear();
      for (const [key, presences] of Object.entries(state)) {
        if (presences.length > 0) awarenessMap.set(key, presences[0] as unknown as PresenceUser);
      }
      notifyAwareness();
    })
    .on('presence', { event: 'join' }, ({ key, newPresences }) => {
      if (newPresences.length > 0) awarenessMap.set(key, newPresences[0] as unknown as PresenceUser);
      notifyAwareness();
    })
    .on('presence', { event: 'leave' }, ({ key }) => {
      awarenessMap.delete(key);
      notifyAwareness();
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel!.track(selfUser);
      }
    });

  // ── 3. Broadcast local changes to peers ────────────────────────────────
  doc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === 'remote') return; // don't re-broadcast received updates
    if (!channel) return;
    const b64 = btoa(String.fromCharCode(...update));
    channel.send({ type: 'broadcast', event: 'ydoc-update', payload: { update: b64 } });
  });

  // ── 4. Periodic snapshot persistence ───────────────────────────────────
  const persistSnapshot = async () => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    const state = Y.encodeStateAsUpdate(doc);
    const b64 = btoa(String.fromCharCode(...state));
    await supabase.from('collab_documents').upsert({
      id: shareId,
      ydoc_state: b64,
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    }, { onConflict: 'id' });
  };

  snapshotTimer = setInterval(persistSnapshot, SNAPSHOT_INTERVAL);

  return {
    doc,
    awareness: awarenessMap,
    onAwarenessChange: (cb) => {
      awarenessListeners.add(cb);
      return () => awarenessListeners.delete(cb);
    },
    destroy: () => {
      if (snapshotTimer) clearInterval(snapshotTimer);
      persistSnapshot(); // final save on unmount
      channel?.unsubscribe();
      doc.destroy();
    },
  };
}
