export interface Document {
  id: string;
  title: string;
  type: 'markdown' | 'pdf';
  content: string; // raw markdown text or empty for pdf
  /** Binary PDF data stored in IndexedDB */
  pdfData?: ArrayBuffer;
  /** Extracted plain text from PDF for LLM context */
  extractedText?: string;
  fileSize: number;
  createdAt: number;
  updatedAt: number;
  /** Non-zero timestamp means the document is pinned (higher = pinned later) */
  pinnedAt?: number;
  /** User-defined tags */
  tags?: string[];
}

export interface Annotation {
  id: string;
  documentId: string;
  selectedText: string;
  /** Surrounding context for relocating the highlight */
  contextBefore: string;
  contextAfter: string;
  comment: string;
  /** LLM-generated response pinned as annotation */
  llmResponse?: string;
  color: string;
  createdAt: number;
  updatedAt: number;
  /** Position info for rendering margin markers */
  positionHint?: {
    paragraphIndex: number;
    startOffset: number;
    endOffset: number;
    /** Index of the rendered Markdown chunk this annotation lives in */
    chunkIndex?: number;
  };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** Hidden context prepended to content when sent to LLM (not displayed) */
  hiddenContext?: string;
  /** The selected text that triggered this message */
  selectedText?: string;
  /** Position hint for anchoring annotations back to the correct occurrence */
  positionHint?: {
    paragraphIndex: number;
    startOffset: number;
    endOffset: number;
    /** Index of the rendered Markdown chunk this annotation lives in */
    chunkIndex?: number;
  };
  timestamp: number;
  /** Whether the message is currently streaming */
  isStreaming?: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  /** Ordered list of document IDs belonging to this workspace */
  documentIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ChatSession {
  id: string;
  /** null for workspace-level sessions */
  documentId: string | null;
  /** Set when this session belongs to a workspace */
  workspaceId?: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface LLMProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface PromptTemplate {
  id: string;
  name: string;
  icon: string;
  prompt: string;
  /** Whether this is a built-in template */
  builtin: boolean;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  activeProviderId: string;
  providers: LLMProvider[];
  promptTemplates: PromptTemplate[];
  fontSize: number;
  lineHeight: number;
  translationLanguage: string;
}

export interface SelectionInfo {
  text: string;
  contextBefore: string;
  contextAfter: string;
  rect: DOMRect;
  paragraphIndex: number;
  startOffset: number;
  endOffset: number;
  /** Chunk index within a chunked Markdown document */
  chunkIndex?: number;
}

export interface GitHubSyncConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  path: string;       // directory in repo, e.g. 'notes'
  username: string;    // authenticated GitHub username
}

/** One record per (date × provider). Accumulated in-place on each API call. */
export interface ApiUsageRecord {
  /** Composite key: `${YYYY-MM-DD}__${providerId}` */
  id: string;
  date: string;           // YYYY-MM-DD
  providerId: string;
  providerName: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  calls: number;
}
