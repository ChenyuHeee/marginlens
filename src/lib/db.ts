import { openDB, type IDBPDatabase } from 'idb';
import type { Document, Annotation, ChatSession, AppSettings, ApiUsageRecord } from '@/types';

const DB_NAME = 'marginlens';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains('documents')) {
            const docStore = db.createObjectStore('documents', { keyPath: 'id' });
            docStore.createIndex('updatedAt', 'updatedAt');
            docStore.createIndex('type', 'type');
          }
          if (!db.objectStoreNames.contains('annotations')) {
            const annStore = db.createObjectStore('annotations', { keyPath: 'id' });
            annStore.createIndex('documentId', 'documentId');
          }
          if (!db.objectStoreNames.contains('chatSessions')) {
            const chatStore = db.createObjectStore('chatSessions', { keyPath: 'id' });
            chatStore.createIndex('documentId', 'documentId');
          }
          if (!db.objectStoreNames.contains('settings')) {
            db.createObjectStore('settings', { keyPath: 'id' });
          }
        }
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains('apiUsage')) {
            const usageStore = db.createObjectStore('apiUsage', { keyPath: 'id' });
            usageStore.createIndex('date', 'date');
          }
        }
      },
    });
  }
  return dbPromise;
}

// Documents
export async function getAllDocuments(): Promise<Document[]> {
  const db = await getDB();
  const docs = await db.getAll('documents');
  return docs.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDocument(id: string): Promise<Document | undefined> {
  const db = await getDB();
  return db.get('documents', id);
}

export async function saveDocument(doc: Document): Promise<void> {
  const db = await getDB();
  await db.put('documents', doc);
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['documents', 'annotations', 'chatSessions'], 'readwrite');
  await tx.objectStore('documents').delete(id);
  // Clean up related annotations and chats
  const annIndex = tx.objectStore('annotations').index('documentId');
  let annCursor = await annIndex.openCursor(id);
  while (annCursor) {
    await annCursor.delete();
    annCursor = await annCursor.continue();
  }
  const chatIndex = tx.objectStore('chatSessions').index('documentId');
  let chatCursor = await chatIndex.openCursor(id);
  while (chatCursor) {
    await chatCursor.delete();
    chatCursor = await chatCursor.continue();
  }
  await tx.done;
}

// Annotations
export async function getAnnotationsByDocument(documentId: string): Promise<Annotation[]> {
  const db = await getDB();
  const index = db.transaction('annotations').store.index('documentId');
  return index.getAll(documentId);
}

export async function saveAnnotation(annotation: Annotation): Promise<void> {
  const db = await getDB();
  await db.put('annotations', annotation);
}

export async function deleteAnnotation(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('annotations', id);
}

// Chat Sessions
export async function getChatSessionsByDocument(documentId: string): Promise<ChatSession[]> {
  const db = await getDB();
  const index = db.transaction('chatSessions').store.index('documentId');
  const sessions = await index.getAll(documentId);
  return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveChatSession(session: ChatSession): Promise<void> {
  const db = await getDB();
  await db.put('chatSessions', session);
}

export async function deleteChatSession(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('chatSessions', id);
}

// Settings
export async function getSettings(): Promise<AppSettings | undefined> {
  const db = await getDB();
  return db.get('settings', 'app');
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await getDB();
  await db.put('settings', { ...settings, id: 'app' });
}

// API Usage
export async function getAllApiUsage(): Promise<ApiUsageRecord[]> {
  const db = await getDB();
  const records = await db.getAll('apiUsage');
  return records.sort((a, b) => a.date.localeCompare(b.date));
}

/** Accumulate token usage into the appropriate daily record. */
export async function recordApiUsage(
  date: string,
  providerId: string,
  providerName: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
): Promise<void> {
  const db = await getDB();
  const id = `${date}__${providerId}`;
  const existing: ApiUsageRecord | undefined = await db.get('apiUsage', id);
  const record: ApiUsageRecord = existing
    ? {
        ...existing,
        promptTokens: existing.promptTokens + promptTokens,
        completionTokens: existing.completionTokens + completionTokens,
        totalTokens: existing.totalTokens + promptTokens + completionTokens,
        calls: existing.calls + 1,
      }
    : {
        id,
        date,
        providerId,
        providerName,
        model,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        calls: 1,
      };
  await db.put('apiUsage', record);
}

export async function clearApiUsage(): Promise<void> {
  const db = await getDB();
  await db.clear('apiUsage');
}
