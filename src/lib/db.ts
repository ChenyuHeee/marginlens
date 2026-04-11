import { openDB, type IDBPDatabase } from 'idb';
import type { Document, Annotation, ChatSession, AppSettings } from '@/types';

const DB_NAME = 'marginlens';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
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
