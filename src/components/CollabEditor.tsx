/**
 * CollabEditor — Milkdown editor with Y.js collaboration via Supabase Realtime.
 *
 * Milkdown's @milkdown/plugin-collab integrates y-prosemirror, so the
 * existing Crepe editor gains real-time sync without replacing the editor.
 */
import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { Crepe, CrepeFeature } from '@milkdown/crepe';
import { collab, collabServiceCtx } from '@milkdown/plugin-collab';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import { createCollabProvider, type CollabProvider, type PresenceUser } from '@/lib/collabProvider';
import { getMyProfile } from '@/lib/profiles';

interface CollabEditorProps {
  shareId: string;
  initialContent: string;
}

interface InnerProps {
  doc: Y.Doc;
  initialContent: string;
}

function CollabEditorInner({ doc, initialContent }: InnerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const root = containerRef.current;

    const crepe = new Crepe({
      root,
      defaultValue: initialContent,
      features: {
        [CrepeFeature.CodeMirror]: true,
        [CrepeFeature.ListItem]: true,
        [CrepeFeature.LinkTooltip]: true,
        [CrepeFeature.Cursor]: true,
        [CrepeFeature.BlockEdit]: true,
        [CrepeFeature.Toolbar]: true,
        [CrepeFeature.Placeholder]: true,
        [CrepeFeature.Table]: true,
        [CrepeFeature.Latex]: true,
        [CrepeFeature.ImageBlock]: false,
        [CrepeFeature.TopBar]: false,
      },
      featureConfigs: {
        [CrepeFeature.Placeholder]: { text: '开始输入 Markdown...' },
      },
    });

    crepe.editor.use(collab);

    crepe.create().then(() => {
      crepe.editor.action((ctx) => {
        const service = ctx.get(collabServiceCtx);
        service.bindDoc(doc).connect();
      });
    });

    return () => {
      crepe.destroy();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  return <div ref={containerRef} className="h-full" />;
}

interface AvatarBarProps {
  users: PresenceUser[];
}

function AvatarBar({ users }: AvatarBarProps) {
  if (users.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 px-3" title="当前在线">
      {users.map((u) => (
        <div
          key={u.userId}
          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
          style={{ background: u.color }}
          title={u.username}
        >
          {u.username.slice(0, 1).toUpperCase()}
        </div>
      ))}
      <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
        {users.length} 人在线
      </span>
    </div>
  );
}

export function CollabEditor({ shareId, initialContent }: CollabEditorProps) {
  const [provider, setProvider] = useState<CollabProvider | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);
  const [error, setError] = useState('');
  const destroyRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await getMyProfile();
        if (!profile) {
          setError('请先设置用户名才能参与协同编辑');
          return;
        }
        const p = await createCollabProvider(shareId, {
          userId: profile.id,
          username: profile.username,
          color: profile.color,
        });
        if (cancelled) { p.destroy(); return; }
        setProvider(p);
        destroyRef.current = p.destroy.bind(p);
        const unsub = p.onAwarenessChange(setOnlineUsers);
        return () => unsub();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '连接失败');
      }
    })();
    return () => {
      cancelled = true;
      destroyRef.current?.();
    };
  }, [shareId]);

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[13px]" style={{ color: 'var(--color-danger)' }}>{error}</p>
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="h-full flex items-center justify-center" style={{ color: 'var(--color-text-tertiary)' }}>
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin mx-auto mb-2"
            style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
          <p className="text-[12px]">连接协同服务器…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Online presence bar */}
      <div
        className="flex items-center h-8 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)' }}
      >
        <AvatarBar users={onlineUsers} />
        <span className="ml-auto px-3 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
          协同编辑模式 · 自动保存
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="live-editor-wrapper h-full">
          <CollabEditorInner doc={provider.doc} initialContent={initialContent} />
        </div>
      </div>
    </div>
  );
}
