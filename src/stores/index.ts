import { create } from 'zustand';
import type { Document, Annotation, ChatSession, ChatMessage, AppSettings, SelectionInfo, GitHubSyncConfig, Workspace } from '@/types';
import type { User } from '@supabase/supabase-js';
import * as db from '@/lib/db';
import { DEFAULT_SETTINGS } from '@/lib/defaults';
import { parseAnnotationsFromMarkdown } from '@/lib/annotations';
import { getSupabase } from '@/lib/supabase';
import { fullSync } from '@/lib/cloudSync';
import { v4 as uuid } from 'uuid';

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i;

interface ImageInlineResult {
  content: string;
  matchedCount: number;
  unmatchedRefs: string[];
}

interface ImageAttachResult {
  changed: boolean;
  matchedCount: number;
  unmatchedRefs: string[];
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_EXT_RE.test(file.name);
}

function normalizeAssetPath(input: string): string {
  let path = input.trim();
  try {
    path = decodeURIComponent(path);
  } catch {
    // Keep original when decodeURIComponent fails.
  }
  path = path.replace(/\\/g, '/');
  path = path.replace(/^\.\//, '');
  path = path.replace(/^\/+/, '');
  return path;
}

function stripQueryHash(input: string): string {
  return input.split('#')[0].split('?')[0];
}

function isLikelyLocalAssetRef(src: string): boolean {
  const trimmed = src.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('#')) return false;
  return !/^[a-z][a-z\d+.-]*:/i.test(trimmed);
}

function extractMarkdownDestination(rawDest: string): string {
  const trimmed = rawDest.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('<') && trimmed.includes('>')) {
    return trimmed.slice(1, trimmed.indexOf('>')).trim();
  }
  const first = trimmed.split(/\s+/)[0] ?? '';
  return first.replace(/^['"]|['"]$/g, '');
}

function findMatchingImageFile(ref: string, candidates: File[]): File | undefined {
  const normalizedRef = normalizeAssetPath(stripQueryHash(ref)).toLowerCase();
  const refSegments = normalizedRef.split('/').filter(Boolean);
  const basename = refSegments[refSegments.length - 1] || '';
  if (!normalizedRef) return undefined;

  const byPath = candidates.map((f) => ({
    file: f,
    rel: normalizeAssetPath(f.webkitRelativePath || f.name).toLowerCase(),
  }));

  const exactMatches = byPath.filter(({ rel }) => rel === normalizedRef || rel.endsWith(`/${normalizedRef}`));
  if (exactMatches.length === 1) return exactMatches[0].file;

  // Fallback: match by the last N path segments (N>=2), e.g. image/fig1.png
  if (refSegments.length >= 2) {
    for (let n = refSegments.length; n >= 2; n--) {
      const tail = refSegments.slice(-n).join('/');
      const tailMatches = byPath.filter(({ rel }) => rel.endsWith(`/${tail}`) || rel === tail);
      if (tailMatches.length === 1) return tailMatches[0].file;
    }
  }

  if (!basename) return undefined;
  const basenameMatches = byPath.filter(({ file }) => file.name.toLowerCase() === basename);
  if (basenameMatches.length === 1) return basenameMatches[0].file;
  return undefined;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error ?? new Error('Read image failed'));
    reader.readAsDataURL(file);
  });
}

async function replaceAsync(
  input: string,
  regex: RegExp,
  replacer: (match: RegExpExecArray) => Promise<string>,
): Promise<string> {
  let result = '';
  let lastIndex = 0;
  regex.lastIndex = 0;
  let match = regex.exec(input);
  while (match) {
    result += input.slice(lastIndex, match.index);
    result += await replacer(match);
    lastIndex = regex.lastIndex;
    match = regex.exec(input);
  }
  result += input.slice(lastIndex);
  return result;
}

async function inlineMarkdownLocalImages(content: string, importedFiles: File[]): Promise<ImageInlineResult> {
  const imageCandidates = importedFiles.filter((f) => isImageFile(f));
  if (imageCandidates.length === 0) {
    return { content, matchedCount: 0, unmatchedRefs: [] };
  }

  const dataUrlCache = new Map<string, string>();
  const unmatched = new Set<string>();
  let matchedCount = 0;
  const getCachedDataUrl = async (file: File): Promise<string> => {
    const key = `${file.webkitRelativePath || file.name}::${file.size}::${file.lastModified}`;
    const cached = dataUrlCache.get(key);
    if (cached) return cached;
    const value = await fileToDataUrl(file);
    dataUrlCache.set(key, value);
    return value;
  };

  // Markdown image syntax: ![alt](path)
  let output = await replaceAsync(content, /!\[([^\]]*)\]\(([^)\n]+)\)/g, async (m) => {
    const full = m[0];
    const alt = m[1] ?? '';
    const rawDest = m[2] ?? '';
    const src = extractMarkdownDestination(rawDest);
    if (!isLikelyLocalAssetRef(src)) return full;
    const file = findMatchingImageFile(src, imageCandidates);
    if (!file) {
      unmatched.add(src);
      return full;
    }
    const dataUrl = await getCachedDataUrl(file);
    matchedCount += 1;
    return `![${alt}](${dataUrl})`;
  });

  // HTML image syntax: <img src="path" ...>
  output = await replaceAsync(output, /<img\b([^>]*?)\bsrc=(["'])(.*?)\2([^>]*)>/gi, async (m) => {
    const full = m[0];
    const pre = m[1] ?? '';
    const quote = m[2] ?? '"';
    const src = m[3] ?? '';
    const post = m[4] ?? '';
    if (!isLikelyLocalAssetRef(src)) return full;
    const file = findMatchingImageFile(src, imageCandidates);
    if (!file) {
      unmatched.add(src);
      return full;
    }
    const dataUrl = await getCachedDataUrl(file);
    matchedCount += 1;
    return `<img${pre}src=${quote}${dataUrl}${quote}${post}>`;
  });

  return {
    content: output,
    matchedCount,
    unmatchedRefs: Array.from(unmatched),
  };
}

// ─── Document Store ───
interface DocumentStore {
  documents: Document[];
  activeDocumentId: string | null;
  activeDocument: Document | null;
  loading: boolean;
  loadDocuments: () => Promise<void>;
  openDocument: (id: string) => Promise<void>;
  addDocument: (file: File, importedFiles?: File[]) => Promise<string>;
  attachImagesToDocument: (documentId: string, imageFiles: File[]) => Promise<ImageAttachResult>;
  addDocumentFromText: (title: string, content: string) => Promise<string>;
  removeDocument: (id: string) => Promise<void>;
  updateDocumentContent: (id: string, content: string) => Promise<void>;
  updateDocument: (id: string, updates: Partial<Document>) => Promise<void>;
  setLiveContent: (id: string, content: string) => void;
  touchDocument: (id: string, now?: number) => Promise<void>;
  closeDocument: () => void;
}

export const useDocumentStore = create<DocumentStore>((set, get) => ({
  documents: [],
  activeDocumentId: null,
  activeDocument: null,
  loading: false,

  loadDocuments: async () => {
    set({ loading: true });
    const documents = await db.getAllDocuments();
    set({ documents, loading: false });
    // Restore last opened document
    const lastId = localStorage.getItem('marginlens:lastDocumentId');
    if (lastId && documents.some((d) => d.id === lastId)) {
      const doc = await db.getDocument(lastId);
      if (doc) set({ activeDocumentId: lastId, activeDocument: doc });
    }
  },

  openDocument: async (id: string) => {
    const doc = await db.getDocument(id);
    if (doc) {
      localStorage.setItem('marginlens:lastDocumentId', id);
      set({ activeDocumentId: id, activeDocument: doc });
    }
  },

  addDocument: async (file: File, importedFiles?: File[]) => {
    const isPdf = !!file.name.match(/\.pdf$/i);
    const id = uuid();
    const now = Date.now();

    let content = '';
    let embeddedAnnotations: ReturnType<typeof parseAnnotationsFromMarkdown>['annotations'] = [];
    if (!isPdf) {
      const raw = await file.text();
      const inlined = await inlineMarkdownLocalImages(raw, importedFiles ?? [file]);
      const parsed = parseAnnotationsFromMarkdown(inlined.content);
      content = parsed.content;
      embeddedAnnotations = parsed.annotations;
    }

    const doc: Document = {
      id,
      title: file.name.replace(/\.(md|markdown|pdf)$/i, ''),
      type: isPdf ? 'pdf' : 'markdown',
      content,
      fileSize: file.size,
      createdAt: now,
      updatedAt: now,
    };
    if (isPdf) {
      doc.pdfData = await file.arrayBuffer();
    }
    await db.saveDocument(doc);

    // Import embedded annotations
    for (const ann of embeddedAnnotations) {
      const annotation: Annotation = {
        id: uuid(),
        documentId: id,
        selectedText: ann.selectedText,
        contextBefore: '',
        contextAfter: '',
        comment: ann.comment,
        llmResponse: ann.llmResponse,
        color: ann.color || '#fef08a',
        createdAt: now,
        updatedAt: now,
      };
      await db.saveAnnotation(annotation);
    }

    const documents = await db.getAllDocuments();
    set({ documents });
    return id;
  },

  attachImagesToDocument: async (documentId: string, imageFiles: File[]) => {
    if (imageFiles.length === 0) return { changed: false, matchedCount: 0, unmatchedRefs: [] };
    const doc = await db.getDocument(documentId);
    if (!doc || doc.type !== 'markdown') return { changed: false, matchedCount: 0, unmatchedRefs: [] };

    const result = await inlineMarkdownLocalImages(doc.content, imageFiles);
    if (result.content === doc.content) {
      return { changed: false, matchedCount: result.matchedCount, unmatchedRefs: result.unmatchedRefs };
    }

    const now = Date.now();
    const updated: Document = {
      ...doc,
      content: result.content,
      fileSize: new Blob([result.content]).size,
      updatedAt: now,
    };
    await db.saveDocument(updated);

    const { activeDocumentId } = get();
    const documents = await db.getAllDocuments();
    if (activeDocumentId === documentId) {
      set({ documents, activeDocument: updated });
    } else {
      set({ documents });
    }
    return { changed: true, matchedCount: result.matchedCount, unmatchedRefs: result.unmatchedRefs };
  },

  addDocumentFromText: async (title: string, content: string) => {
    const id = uuid();
    const now = Date.now();
    const doc: Document = {
      id,
      title,
      type: 'markdown',
      content,
      fileSize: new Blob([content]).size,
      createdAt: now,
      updatedAt: now,
    };
    await db.saveDocument(doc);
    const documents = await db.getAllDocuments();
    set({ documents });
    return id;
  },

  removeDocument: async (id: string) => {
    await db.deleteDocument(id);
    const { activeDocumentId } = get();
    const documents = await db.getAllDocuments();
    if (activeDocumentId === id) {
      localStorage.removeItem('marginlens:lastDocumentId');
      set({ documents, activeDocumentId: null, activeDocument: null });
    } else {
      set({ documents });
    }
  },

  updateDocumentContent: async (id: string, content: string) => {
    const doc = await db.getDocument(id);
    if (!doc) return;
    const updated = { ...doc, content, fileSize: new Blob([content]).size, updatedAt: Date.now() };
    await db.saveDocument(updated);
    const { activeDocumentId } = get();
    if (activeDocumentId === id) {
      set({ activeDocument: updated });
    }
    const documents = await db.getAllDocuments();
    set({ documents });
  },

  updateDocument: async (id: string, updates: Partial<Document>) => {
    const doc = await db.getDocument(id);
    if (!doc) return;
    const updated = { ...doc, ...updates, updatedAt: Date.now() };
    await db.saveDocument(updated);
    const { activeDocumentId } = get();
    if (activeDocumentId === id) {
      set({ activeDocument: updated });
    }
    const documents = await db.getAllDocuments();
    set({ documents });
  },

  // Update activeDocument content in memory only (no IndexedDB write).
  // Called on every keystroke so ChatPanel always sees the latest text.
  setLiveContent: (id: string, content: string) => {
    const { activeDocument, activeDocumentId } = get();
    if (activeDocumentId === id && activeDocument) {
      set({ activeDocument: { ...activeDocument, content } });
    }
  },

  touchDocument: async (id: string, now = Date.now()) => {
    const doc = await db.getDocument(id);
    if (!doc) return;
    const updated = { ...doc, updatedAt: now };
    await db.saveDocument(updated);
    const { activeDocumentId } = get();
    const documents = (await db.getAllDocuments());
    if (activeDocumentId === id) set({ activeDocument: updated, documents });
    else set({ documents });
  },

  closeDocument: () => {
    set({ activeDocumentId: null, activeDocument: null });
  },
}));

// ─── Annotation Store ───
interface AnnotationStore {
  annotations: Annotation[];
  activeAnnotationId: string | null;
  loadAnnotations: (documentId: string) => Promise<void>;
  addAnnotation: (annotation: Omit<Annotation, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Annotation>;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => Promise<void>;
  removeAnnotation: (id: string) => Promise<void>;
  setActiveAnnotation: (id: string | null) => void;
  clearAnnotations: () => void;
}

export const useAnnotationStore = create<AnnotationStore>((set, get) => ({
  annotations: [],
  activeAnnotationId: null,

  loadAnnotations: async (documentId: string) => {
    const annotations = await db.getAnnotationsByDocument(documentId);
    set({ annotations });
  },

  addAnnotation: async (data) => {
    const now = Date.now();
    const annotation: Annotation = {
      ...data,
      id: uuid(),
      createdAt: now,
      updatedAt: now,
    };
    await db.saveAnnotation(annotation);
    set({ annotations: [...get().annotations, annotation] });
    // Bump document updatedAt so file list sort reflects the change
    await useDocumentStore.getState().touchDocument(data.documentId, now);
    return annotation;
  },

  updateAnnotation: async (id, updates) => {
    const annotations = get().annotations;
    const idx = annotations.findIndex((a) => a.id === id);
    if (idx === -1) return;
    const now = Date.now();
    const updated = { ...annotations[idx], ...updates, updatedAt: now };
    await db.saveAnnotation(updated);
    const newAnnotations = [...annotations];
    newAnnotations[idx] = updated;
    set({ annotations: newAnnotations });
    await useDocumentStore.getState().touchDocument(updated.documentId, now);
  },

  removeAnnotation: async (id) => {
    const ann = get().annotations.find((a) => a.id === id);
    await db.deleteAnnotation(id);
    set({ annotations: get().annotations.filter((a) => a.id !== id) });
    if (ann) await useDocumentStore.getState().touchDocument(ann.documentId, Date.now());
  },

  setActiveAnnotation: (id) => set({ activeAnnotationId: id }),

  clearAnnotations: () => set({ annotations: [], activeAnnotationId: null }),
}));

// ─── Chat Store ───
interface ChatStore {
  sessions: ChatSession[];
  activeSessionId: string | null;
  activeSession: ChatSession | null;
  isStreaming: boolean;
  abortController: AbortController | null;
  loadSessions: (documentId: string) => Promise<void>;
  loadWorkspaceSessions: (workspaceId: string) => Promise<void>;
  createSession: (documentId: string | null, title?: string, workspaceId?: string) => Promise<ChatSession>;
  setActiveSession: (id: string) => void;
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  updateLastMessage: (content: string) => void;
  setStreaming: (streaming: boolean, controller?: AbortController | null) => void;
  stopStreaming: () => void;
  deleteSession: (id: string) => Promise<void>;
  saveActiveSession: () => Promise<void>;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  activeSession: null,
  isStreaming: false,
  abortController: null,

  loadSessions: async (documentId: string) => {
    const sessions = await db.getChatSessionsByDocument(documentId);
    set({ sessions });
    // Auto-select last session or clear
    if (sessions.length > 0) {
      set({ activeSessionId: sessions[0].id, activeSession: sessions[0] });
    } else {
      set({ activeSessionId: null, activeSession: null });
    }
  },

  loadWorkspaceSessions: async (workspaceId: string) => {
    const all = await db.getAllChatSessions();
    const sessions = all
      .filter((s) => s.workspaceId === workspaceId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    set({ sessions });
    if (sessions.length > 0) {
      set({ activeSessionId: sessions[0].id, activeSession: sessions[0] });
    } else {
      set({ activeSessionId: null, activeSession: null });
    }
  },

  createSession: async (documentId: string | null, title?: string, workspaceId?: string) => {
    const session: ChatSession = {
      id: uuid(),
      documentId,
      workspaceId,
      title: title || `对话 ${get().sessions.length + 1}`,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.saveChatSession(session);
    set({
      sessions: [session, ...get().sessions],
      activeSessionId: session.id,
      activeSession: session,
    });
    return session;
  },

  setActiveSession: (id: string) => {
    const session = get().sessions.find((s) => s.id === id);
    if (session) {
      set({ activeSessionId: id, activeSession: session });
    }
  },

  addMessage: (msg) => {
    const session = get().activeSession;
    if (!session) return;
    const message: ChatMessage = {
      ...msg,
      id: uuid(),
      timestamp: Date.now(),
    };
    const updated = {
      ...session,
      messages: [...session.messages, message],
      updatedAt: Date.now(),
    };
    set({ activeSession: updated });
    // Update in sessions list
    const sessions = get().sessions.map((s) => (s.id === updated.id ? updated : s));
    set({ sessions });
  },

  updateLastMessage: (content: string) => {
    const session = get().activeSession;
    if (!session || session.messages.length === 0) return;
    const messages = [...session.messages];
    const last = messages[messages.length - 1];
    messages[messages.length - 1] = { ...last, content, isStreaming: true };
    const updated = { ...session, messages, updatedAt: Date.now() };
    set({ activeSession: updated });
    const sessions = get().sessions.map((s) => (s.id === updated.id ? updated : s));
    set({ sessions });
  },

  setStreaming: (streaming, controller) => {
    set({
      isStreaming: streaming,
      abortController: controller ?? (streaming ? get().abortController : null),
    });
    if (!streaming) {
      // Mark last message as not streaming
      const session = get().activeSession;
      if (session && session.messages.length > 0) {
        const messages = [...session.messages];
        const last = messages[messages.length - 1];
        messages[messages.length - 1] = { ...last, isStreaming: false };
        const updated = { ...session, messages };
        set({ activeSession: updated });
        const sessions = get().sessions.map((s) => (s.id === updated.id ? updated : s));
        set({ sessions });
      }
    }
  },

  stopStreaming: () => {
    const { abortController } = get();
    if (abortController) abortController.abort();
    get().setStreaming(false);
  },

  deleteSession: async (id: string) => {
    await db.deleteChatSession(id);
    const sessions = get().sessions.filter((s) => s.id !== id);
    const { activeSessionId } = get();
    if (activeSessionId === id) {
      set({
        sessions,
        activeSessionId: sessions.length > 0 ? sessions[0].id : null,
        activeSession: sessions.length > 0 ? sessions[0] : null,
      });
    } else {
      set({ sessions });
    }
  },

  saveActiveSession: async () => {
    const session = get().activeSession;
    if (session) await db.saveChatSession(session);
  },
}));

// ─── Selection Store ───
interface SelectionStore {
  selection: SelectionInfo | null;
  setSelection: (selection: SelectionInfo | null) => void;
}

export const useSelectionStore = create<SelectionStore>((set) => ({
  selection: null,
  setSelection: (selection) => set({ selection }),
}));

// ─── Settings Store ───
interface SettingsStore {
  settings: AppSettings;
  loaded: boolean;
  loadSettings: () => Promise<void>;
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;
  updateProvider: (id: string, updates: Partial<import('@/types').LLMProvider>) => Promise<void>;
  getActiveProvider: () => import('@/types').LLMProvider | undefined;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,

  loadSettings: async () => {
    const saved = await db.getSettings();
    if (saved) {
      set({ settings: { ...DEFAULT_SETTINGS, ...saved }, loaded: true });
    } else {
      await db.saveSettings(DEFAULT_SETTINGS);
      set({ loaded: true });
    }
  },

  updateSettings: async (updates) => {
    const settings = { ...get().settings, ...updates };
    set({ settings });
    await db.saveSettings(settings);
  },

  updateProvider: async (id, updates) => {
    const settings = get().settings;
    const providers = settings.providers.map((p) =>
      p.id === id ? { ...p, ...updates } : p,
    );
    const newSettings = { ...settings, providers };
    set({ settings: newSettings });
    await db.saveSettings(newSettings);
  },

  getActiveProvider: () => {
    const { settings } = get();
    return settings.providers.find((p) => p.id === settings.activeProviderId);
  },
}));

// ─── UI Store ───
export interface PdfOutlineItem {
  title: string;
  dest: unknown;
  items?: PdfOutlineItem[];
  children: PdfOutlineItem[];
}

interface UIStore {
  sidebarOpen: boolean;
  rightPanelTab: 'chat' | 'annotations' | 'translate';
  rightPanelWidth: number;
  showApiKeyAlert: boolean;
  pdfOutline: PdfOutlineItem[];
  sidebarTab: 'docs' | 'outline' | 'workspaces';
  activeWorkspaceId: string | null;
  scrollToPdfPage: ((page: number) => void) | null;
  focusMode: boolean;
  tagFilter: string | null;
  highlightColor: string;
  annotationColorFilter: string | null;
  toggleSidebar: () => void;
  setRightPanelTab: (tab: 'chat' | 'annotations' | 'translate') => void;
  setRightPanelWidth: (width: number) => void;
  setShowApiKeyAlert: (show: boolean) => void;
  setPdfOutline: (outline: PdfOutlineItem[]) => void;
  setSidebarTab: (tab: 'docs' | 'outline' | 'workspaces') => void;
  setActiveWorkspaceId: (id: string | null) => void;
  registerScrollToPdfPage: (fn: ((page: number) => void) | null) => void;
  toggleFocusMode: () => void;
  setTagFilter: (tag: string | null) => void;
  setHighlightColor: (color: string) => void;
  setAnnotationColorFilter: (color: string | null) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarOpen: true,
  rightPanelTab: 'chat',
  rightPanelWidth: 420,
  showApiKeyAlert: false,
  pdfOutline: [],
  sidebarTab: 'docs',
  activeWorkspaceId: null,
  scrollToPdfPage: null,
  focusMode: false,
  tagFilter: null,
  highlightColor: '#fef08a',
  annotationColorFilter: null,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
  setRightPanelWidth: (width) => set({ rightPanelWidth: Math.max(300, Math.min(800, width)) }),
  setShowApiKeyAlert: (show) => set({ showApiKeyAlert: show }),
  setPdfOutline: (outline) => set({ pdfOutline: outline }),
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),
  registerScrollToPdfPage: (fn) => set({ scrollToPdfPage: fn }),
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
  setTagFilter: (tag) => set({ tagFilter: tag }),
  setHighlightColor: (color) => set({ highlightColor: color }),
  setAnnotationColorFilter: (color) => set({ annotationColorFilter: color }),
}));

// ─── Workspace Store ───
interface WorkspaceStore {
  workspaces: Workspace[];
  loadWorkspaces: () => Promise<void>;
  createWorkspace: (name: string) => Promise<Workspace>;
  updateWorkspace: (id: string, updates: Partial<Workspace>) => Promise<void>;
  removeWorkspace: (id: string) => Promise<void>;
  addDocumentToWorkspace: (workspaceId: string, documentId: string) => Promise<void>;
  removeDocumentFromWorkspace: (workspaceId: string, documentId: string) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspaces: [],

  loadWorkspaces: async () => {
    const workspaces = await db.getAllWorkspaces();
    set({ workspaces });
  },

  createWorkspace: async (name: string) => {
    const ws: Workspace = {
      id: uuid(),
      name,
      documentIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.saveWorkspace(ws);
    set({ workspaces: [ws, ...get().workspaces] });
    return ws;
  },

  updateWorkspace: async (id, updates) => {
    const ws = get().workspaces.find((w) => w.id === id);
    if (!ws) return;
    const updated = { ...ws, ...updates, updatedAt: Date.now() };
    await db.saveWorkspace(updated);
    set({ workspaces: get().workspaces.map((w) => (w.id === id ? updated : w)) });
  },

  removeWorkspace: async (id) => {
    await db.deleteWorkspace(id);
    set({ workspaces: get().workspaces.filter((w) => w.id !== id) });
  },

  addDocumentToWorkspace: async (workspaceId, documentId) => {
    const ws = get().workspaces.find((w) => w.id === workspaceId);
    if (!ws || ws.documentIds.includes(documentId)) return;
    await get().updateWorkspace(workspaceId, { documentIds: [...ws.documentIds, documentId] });
  },

  removeDocumentFromWorkspace: async (workspaceId, documentId) => {
    const ws = get().workspaces.find((w) => w.id === workspaceId);
    if (!ws) return;
    await get().updateWorkspace(workspaceId, {
      documentIds: ws.documentIds.filter((id) => id !== documentId),
    });
  },
}));

// ─── GitHub Sync Store ───
interface GitHubSyncStore {
  config: GitHubSyncConfig | null;
  syncing: boolean;
  lastSyncedAt: number | null;
  loadConfig: () => Promise<void>;
  saveConfig: (config: GitHubSyncConfig) => Promise<void>;
  clearConfig: () => Promise<void>;
  setSyncing: (v: boolean) => void;
  setLastSyncedAt: (t: number) => void;
}

export const useGitHubSyncStore = create<GitHubSyncStore>((set) => ({
  config: null,
  syncing: false,
  lastSyncedAt: null,

  loadConfig: async () => {
    const d = await (await db.getDB()).get('settings', 'github_sync');
    if (d) {
      const { id: _, ...config } = d;
      set({ config: config as GitHubSyncConfig });
    }
  },

  saveConfig: async (config) => {
    await (await db.getDB()).put('settings', { ...config, id: 'github_sync' });
    set({ config });
  },

  clearConfig: async () => {
    await (await db.getDB()).delete('settings', 'github_sync');
    set({ config: null, lastSyncedAt: null });
  },

  setSyncing: (v) => set({ syncing: v }),
  setLastSyncedAt: (t) => set({ lastSyncedAt: t }),
}));

// ─── Auth Store ───
interface AuthStore {
  user: User | null;
  loading: boolean;
  syncing: boolean;
  lastSyncedAt: number | null;
  syncError: string | null;
  init: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ error?: string }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  loading: true,
  syncing: false,
  lastSyncedAt: null,
  syncError: null,

  init: async () => {
    const supabase = getSupabase();
    if (!supabase) {
      set({ loading: false });
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    set({ user: session?.user ?? null, loading: false });

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ user: session?.user ?? null });
    });
  },

  signUp: async (email, password) => {
    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase 未配置' };

    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    return {};
  },

  signIn: async (email, password) => {
    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase 未配置' };

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };

    set({ user: data.user });

    // Auto-sync on login
    get().syncNow();
    return {};
  },

  signOut: async () => {
    const supabase = getSupabase();
    if (supabase) await supabase.auth.signOut();
    set({ user: null, lastSyncedAt: null, syncError: null });
  },

  syncNow: async () => {
    const { user, syncing } = get();
    if (!user || syncing) return;

    set({ syncing: true, syncError: null });
    try {
      await fullSync(user.id);
      set({ lastSyncedAt: Date.now() });
      // Reload local stores after sync
      await useDocumentStore.getState().loadDocuments();
      await useSettingsStore.getState().loadSettings();
    } catch (e) {
      set({ syncError: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ syncing: false });
    }
  },
}));
