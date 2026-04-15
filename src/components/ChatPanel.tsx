import { useRef, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import {
  Send,
  StopCircle,
  Plus,
  Trash2,
  MessageSquare,
  Quote,
  Pin,
  Sparkles,
  FolderOpen,
  FilePlus,
} from 'lucide-react';
import {
  useChatStore,
  useSettingsStore,
  useDocumentStore,
  useAnnotationStore,
  useUIStore,
  useWorkspaceStore,
} from '@/stores';
import { buildChatSystemMessage, buildWorkspaceSystemMessage, parseAtMentions, buildMentionContext } from '@/lib/context';
import { streamChat } from '@/lib/llm';
import { recordApiUsage, getAnnotationsByDocument } from '@/lib/db';

export function ChatPanel() {
  const {
    activeSession,
    sessions,
    isStreaming,
    createSession,
    setActiveSession,
    addMessage,
    updateLastMessage,
    setStreaming,
    stopStreaming,
    deleteSession,
    saveActiveSession,
  } = useChatStore();
  const { activeDocument, documents, addDocumentFromText } = useDocumentStore();
  const { getActiveProvider } = useSettingsStore();
  const { addAnnotation } = useAnnotationStore();
  const { setRightPanelTab, activeWorkspaceId } = useUIStore();
  const { workspaces, addDocumentToWorkspace } = useWorkspaceStore();

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;
  const workspaceDocs = activeWorkspace
    ? documents.filter((d) => activeWorkspace.documentIds.includes(d.id))
    : [];

  const [input, setInput] = useState('');
  const [atSuggestions, setAtSuggestions] = useState<typeof documents>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToHighlight = (text: string) => {
    const container = document.getElementById('markdown-scroll-container');
    if (!container) return;
    const highlights = container.querySelectorAll('.annotation-highlight');
    for (const el of highlights) {
      if (el.textContent?.includes(text.slice(0, 30))) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('active');
        setTimeout(() => el.classList.remove('active'), 2000);
        return;
      }
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages]);

  // Detect @mention as user types - show autocomplete suggestions
  const handleInputChange = (value: string) => {
    setInput(value);
    if (activeWorkspace) {
      const atMatch = value.match(/@([\w\u4e00-\u9fff][\w\u4e00-\u9fff\s.\-:]*)$/);
      if (atMatch) {
        const query = atMatch[1].toLowerCase();
        setAtSuggestions(workspaceDocs.filter((d) => d.title.toLowerCase().includes(query)));
      } else {
        setAtSuggestions([]);
      }
    }
  };

  const applyAtSuggestion = (doc: typeof documents[0]) => {
    setInput((prev) => prev.replace(/@([\w\u4e00-\u9fff][\w\u4e00-\u9fff\s.\-:]*)$/, `@${doc.title} `));
    setAtSuggestions([]);
  };

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;
    if (!activeDocument && !activeWorkspace) return;

    const prompt = input.trim();
    setInput('');
    setAtSuggestions([]);

    let session = activeSession;
    if (!session) {
      if (activeWorkspace) {
        session = await createSession(null, undefined, activeWorkspace.id);
      } else {
        session = await createSession(activeDocument!.id);
      }
    }

    // Build system message on first turn; refresh document snapshot on every turn for doc sessions
    if (session.messages.length === 0) {
      if (activeWorkspace && session.workspaceId) {
        // Collect all annotations for workspace docs
        const annotationsByDoc: Record<string, Awaited<ReturnType<typeof getAnnotationsByDocument>>> = {};
        await Promise.all(
          workspaceDocs.map(async (doc) => {
            annotationsByDoc[doc.id] = await getAnnotationsByDocument(doc.id);
          })
        );
        addMessage({
          role: 'system',
          content: buildWorkspaceSystemMessage(activeWorkspace, workspaceDocs, annotationsByDoc),
        });
      } else {
        const allAnnotations = useAnnotationStore.getState().annotations.filter(
          (a) => a.documentId === activeDocument!.id
        );
        const docText = activeDocument!.content || activeDocument!.extractedText || '';
        addMessage({ role: 'system', content: buildChatSystemMessage(docText, allAnnotations) });
      }
    } else if (!activeWorkspace && activeDocument) {
      // Refresh system message so AI always sees the latest document content
      const allAnnotations = useAnnotationStore.getState().annotations.filter(
        (a) => a.documentId === activeDocument.id
      );
      const docText = activeDocument.content || activeDocument.extractedText || '';
      const newSystemContent = buildChatSystemMessage(docText, allAnnotations);
      const currentSession = useChatStore.getState().activeSession;
      if (currentSession && currentSession.messages[0]?.role === 'system') {
        const messages = [...currentSession.messages];
        messages[0] = { ...messages[0], content: newSystemContent };
        useChatStore.setState({
          activeSession: { ...currentSession, messages },
          sessions: useChatStore.getState().sessions.map((s) =>
            s.id === currentSession.id ? { ...currentSession, messages } : s
          ),
        });
      }
    }

    // Resolve @mentions in workspace mode → build hidden context
    let hiddenContext = '';
    if (activeWorkspace) {
      const mentioned = parseAtMentions(prompt, workspaceDocs);
      for (const doc of mentioned) {
        hiddenContext += buildMentionContext(doc);
      }
    }

    addMessage({ role: 'user', content: prompt, hiddenContext: hiddenContext || undefined });

    const provider = getActiveProvider();
    if (!provider || !provider.apiKey) {
      useUIStore.getState().setShowApiKeyAlert(true);
      return;
    }

    const controller = new AbortController();
    setStreaming(true, controller);
    addMessage({ role: 'assistant', content: '' });

    const currentSession = useChatStore.getState().activeSession;
    if (!currentSession) return;

    const apiMessages = currentSession.messages.slice(0, -1).map((m) => ({
      role: m.role,
      content: m.hiddenContext ? m.hiddenContext + '\n' + m.content : m.content,
    }));

    let fullContent = '';
    const today = new Date().toISOString().slice(0, 10);
    await streamChat(
      provider,
      apiMessages,
      {
        onToken: (token) => {
          fullContent += token;
          updateLastMessage(fullContent);
        },
        onDone: () => {
          setStreaming(false);
          saveActiveSession();
        },
        onError: (error) => {
          updateLastMessage(fullContent + `\n\n⚠️ 错误: ${error.message}`);
          setStreaming(false);
          saveActiveSession();
        },
        onUsage: ({ promptTokens, completionTokens }) => {
          recordApiUsage(today, provider.id, provider.name, provider.model, promptTokens, completionTokens);
        },
      },
      controller.signal,
    );
  };

  const handlePinAsAnnotation = async (
    content: string,
    selectedText?: string,
    userQuestion?: string,
    positionHint?: { paragraphIndex: number; startOffset: number; endOffset: number },
  ) => {
    if (!activeDocument) return;
    const title = userQuestion || selectedText || '批注';
    const annotation = await addAnnotation({
      documentId: activeDocument.id,
      selectedText: selectedText || title,
      contextBefore: '',
      contextAfter: '',
      comment: userQuestion && selectedText ? `Q: ${userQuestion}` : '',
      llmResponse: content,
      color: '#fef08a',
      positionHint,
    });
    useAnnotationStore.getState().setActiveAnnotation(annotation.id);
    setRightPanelTab('annotations');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSaveAsDocument = async (content: string) => {
    if (!activeWorkspace) return;
    // Use first heading line as title, or generic name
    const firstLine = content.split('\n').find((l) => l.trim());
    const title = firstLine?.startsWith('#')
      ? firstLine.replace(/^#+\s*/, '').trim()
      : `AI 生成 · ${new Date().toLocaleDateString('zh-CN')}`;
    const docId = await addDocumentFromText(title, content);
    await addDocumentToWorkspace(activeWorkspace.id, docId);
  };

  if (!activeDocument && !activeWorkspace) {
    return (
      <div className="h-full flex items-center justify-center text-[13px]" style={{ color: 'var(--color-text-tertiary)' }}>
        请先打开一个文档或工作区
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Workspace indicator */}
      {activeWorkspace && (
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 flex-shrink-0 text-[11px]"
          style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)', borderBottom: '1px solid var(--color-primary)' }}
        >
          <FolderOpen size={11} />
          <span className="font-medium truncate">{activeWorkspace.name}</span>
          <span className="opacity-60 ml-auto flex-shrink-0">{workspaceDocs.length} 个文档</span>
        </div>
      )}

      {/* Session tabs */}
      <div
        className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto flex-shrink-0"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSession(s.id)}
            className="group flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md whitespace-nowrap transition-all"
            style={{
              background: activeSession?.id === s.id ? 'var(--color-primary-light)' : 'transparent',
              color: activeSession?.id === s.id ? 'var(--color-primary)' : 'var(--color-text-tertiary)',
            }}
          >
            <MessageSquare size={10} />
            <span>{s.title}</span>
            <span
              onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
              className="ml-0.5 opacity-0 group-hover:opacity-50 hover:!opacity-100 cursor-pointer transition-opacity"
            >
              <Trash2 size={9} />
            </span>
          </button>
        ))}
        <button
          onClick={() => {
            if (activeWorkspace) {
              createSession(null, undefined, activeWorkspace.id);
            } else if (activeDocument) {
              createSession(activeDocument.id);
            }
          }}
          className="p-1 rounded-md transition-all"
          title="新建对话"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--color-card-hover)';
            e.currentTarget.style.color = 'var(--color-text-secondary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--color-text-tertiary)';
          }}
        >
          <Plus size={13} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {(!activeSession || activeSession.messages.filter(m => m.role !== 'system').length === 0) && (
          <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: 'var(--color-primary-light)' }}
            >
              {activeWorkspace ? <FolderOpen size={20} style={{ color: 'var(--color-primary)' }} /> : <Sparkles size={20} style={{ color: 'var(--color-primary)' }} />}
            </div>
            <p className="text-[13px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {activeWorkspace ? `工作区对话` : '开始对话'}
            </p>
            <p className="text-[11px] mt-1 text-center px-4" style={{ color: 'var(--color-text-tertiary)' }}>
              {activeWorkspace
                ? `已加载 ${workspaceDocs.length} 个文档。用 @文档名 引用特定文档全文`
                : '选中文本提问，或直接在下方输入'}
            </p>
          </div>
        )}

        {activeSession?.messages.filter(m => m.role !== 'system').map((msg, idx, filtered) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}>
            <div
              className={`max-w-[85%] text-[13px] leading-relaxed ${
                msg.role === 'user'
                  ? 'rounded-2xl rounded-br-sm px-3.5 py-2.5'
                  : 'rounded-2xl rounded-bl-sm px-3.5 py-2.5'
              }`}
              style={
                msg.role === 'user'
                  ? {
                      background: 'var(--color-primary)',
                      color: 'white',
                      boxShadow: '0 1px 3px rgba(52, 120, 246, 0.2)',
                    }
                  : {
                      background: 'var(--color-bg-secondary)',
                      border: '1px solid var(--color-border)',
                    }
              }
            >
              {msg.selectedText && msg.role === 'user' && (
                <div
                  className="mb-2 px-2.5 py-1.5 rounded-lg text-[11px] flex items-start gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ background: 'rgba(255,255,255,0.15)' }}
                  onClick={(e) => { e.stopPropagation(); scrollToHighlight(msg.selectedText!); }}
                  title="点击跳转到原文"
                >
                  <Quote size={10} className="mt-0.5 flex-shrink-0 opacity-60" />
                  <span className="line-clamp-2 opacity-90">{msg.selectedText}</span>
                </div>
              )}
              {msg.role === 'assistant' ? (
                <div className={`markdown-body ${msg.isStreaming ? 'streaming-cursor' : ''}`} style={{ fontSize: 13 }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {msg.content || '思考中...'}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="whitespace-pre-wrap">{msg.content}</div>
              )}
              {msg.role === 'assistant' && !msg.isStreaming && msg.content && (() => {
                const prevUserMsg = filtered.slice(0, idx).reverse().find(m => m.role === 'user');
                return (
                  <div className="mt-2 pt-1.5 flex justify-end gap-2" style={{ borderTop: '1px solid var(--color-border)' }}>
                    {activeWorkspace && (
                      <button
                        onClick={() => handleSaveAsDocument(msg.content)}
                        className="flex items-center gap-1 text-[10px] font-medium opacity-40 hover:opacity-80 transition-opacity"
                        title="保存为工作区文档"
                        style={{ color: 'var(--color-success, #16a34a)' }}
                      >
                        <FilePlus size={9} />
                        保存为文档
                      </button>
                    )}
                    <button
                      onClick={() => handlePinAsAnnotation(msg.content, prevUserMsg?.selectedText, prevUserMsg?.content, prevUserMsg?.positionHint)}
                      className="flex items-center gap-1 text-[10px] font-medium opacity-40 hover:opacity-80 transition-opacity"
                      title="钉为批注"
                      style={{ color: 'var(--color-primary)' }}
                    >
                      <Pin size={9} />
                      钉为批注
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 flex-shrink-0" style={{ borderTop: '1px solid var(--color-border)' }}>
        {/* @mention dropdown */}
        {atSuggestions.length > 0 && (
          <div
            className="mb-1.5 rounded-lg overflow-hidden shadow-lg"
            style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
          >
            {atSuggestions.slice(0, 6).map((doc) => (
              <button
                key={doc.id}
                onMouseDown={(e) => { e.preventDefault(); applyAtSuggestion(doc); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-left transition-colors"
                style={{ color: 'var(--color-text)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-card-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ color: 'var(--color-text-tertiary)', fontSize: 10 }}>{doc.type === 'pdf' ? '📑' : '📄'}</span>
                {doc.title}
              </button>
            ))}
          </div>
        )}
        <div
          className="flex items-end gap-2 p-1.5 rounded-xl"
          style={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
          }}
        >
          <textarea
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={activeWorkspace ? '输入问题，用 @文档名 引用文档... (Enter 发送)' : '输入问题... (Enter 发送)'}
            rows={1}
            className="flex-1 bg-transparent border-none outline-none resize-none"
            style={{
              maxHeight: 100,
              minHeight: 32,
              padding: '6px 8px',
              fontSize: 13,
              color: 'var(--color-text)',
            }}
            onInput={(e) => {
              const t = e.target as HTMLTextAreaElement;
              t.style.height = 'auto';
              t.style.height = Math.min(t.scrollHeight, 100) + 'px';
            }}
          />
          {isStreaming ? (
            <button
              onClick={stopStreaming}
              className="p-2 rounded-lg transition-all flex-shrink-0"
              style={{ color: 'var(--color-danger)' }}
              title="停止"
            >
              <StopCircle size={16} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="p-2 rounded-lg transition-all flex-shrink-0 disabled:opacity-20"
              style={{
                background: input.trim() ? 'var(--color-primary)' : 'transparent',
                color: input.trim() ? 'white' : 'var(--color-text-tertiary)',
              }}
              title="发送"
            >
              <Send size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
