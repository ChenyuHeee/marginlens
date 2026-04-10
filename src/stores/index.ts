import { create } from 'zustand';
import type { Document, Annotation, ChatSession, ChatMessage, AppSettings, SelectionInfo } from '@/types';
import * as db from '@/lib/db';
import { DEFAULT_SETTINGS } from '@/lib/defaults';
import { parseAnnotationsFromMarkdown } from '@/lib/annotations';
import { v4 as uuid } from 'uuid';

// ─── Document Store ───
interface DocumentStore {
  documents: Document[];
  activeDocumentId: string | null;
  activeDocument: Document | null;
  loading: boolean;
  loadDocuments: () => Promise<void>;
  openDocument: (id: string) => Promise<void>;
  addDocument: (file: File) => Promise<string>;
  addDocumentFromText: (title: string, content: string) => Promise<string>;
  removeDocument: (id: string) => Promise<void>;
  updateDocumentContent: (id: string, content: string) => Promise<void>;
  updateDocument: (id: string, updates: Partial<Document>) => Promise<void>;
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
  },

  openDocument: async (id: string) => {
    const doc = await db.getDocument(id);
    if (doc) {
      set({ activeDocumentId: id, activeDocument: doc });
    }
  },

  addDocument: async (file: File) => {
    const isPdf = !!file.name.match(/\.pdf$/i);
    const id = uuid();
    const now = Date.now();

    let content = '';
    let embeddedAnnotations: ReturnType<typeof parseAnnotationsFromMarkdown>['annotations'] = [];
    if (!isPdf) {
      const raw = await file.text();
      const parsed = parseAnnotationsFromMarkdown(raw);
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
    return annotation;
  },

  updateAnnotation: async (id, updates) => {
    const annotations = get().annotations;
    const idx = annotations.findIndex((a) => a.id === id);
    if (idx === -1) return;
    const updated = { ...annotations[idx], ...updates, updatedAt: Date.now() };
    await db.saveAnnotation(updated);
    const newAnnotations = [...annotations];
    newAnnotations[idx] = updated;
    set({ annotations: newAnnotations });
  },

  removeAnnotation: async (id) => {
    await db.deleteAnnotation(id);
    set({ annotations: get().annotations.filter((a) => a.id !== id) });
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
  createSession: (documentId: string, title?: string) => Promise<ChatSession>;
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

  createSession: async (documentId: string, title?: string) => {
    const session: ChatSession = {
      id: uuid(),
      documentId,
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
interface UIStore {
  sidebarOpen: boolean;
  rightPanelTab: 'chat' | 'annotations';
  rightPanelWidth: number;
  toggleSidebar: () => void;
  setRightPanelTab: (tab: 'chat' | 'annotations') => void;
  setRightPanelWidth: (width: number) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarOpen: true,
  rightPanelTab: 'chat',
  rightPanelWidth: 420,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
  setRightPanelWidth: (width) => set({ rightPanelWidth: Math.max(300, Math.min(800, width)) }),
}));
