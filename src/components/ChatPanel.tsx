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
} from 'lucide-react';
import {
  useChatStore,
  useSettingsStore,
  useDocumentStore,
  useAnnotationStore,
  useUIStore,
} from '@/stores';
import { buildSystemMessage } from '@/lib/context';
import { streamChat } from '@/lib/llm';

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
  const { activeDocument } = useDocumentStore();
  const { getActiveProvider } = useSettingsStore();
  const { addAnnotation } = useAnnotationStore();
  const { setRightPanelTab } = useUIStore();

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming || !activeDocument) return;

    const prompt = input.trim();
    setInput('');

    let session = activeSession;
    if (!session) {
      session = await createSession(activeDocument.id);
    }

    // Inject document context + annotations as system message on first user message
    const allAnnotations = useAnnotationStore.getState().annotations.filter(a => a.documentId === activeDocument.id);
    if (session.messages.length === 0) {
      addMessage({
        role: 'system',
        content: buildSystemMessage(activeDocument.content, allAnnotations),
      });
    }

    addMessage({ role: 'user', content: prompt });

    const provider = getActiveProvider();
    if (!provider || !provider.apiKey) {
      addMessage({
        role: 'assistant',
        content: '⚠️ 请先在设置中配置 API Key。',
      });
      return;
    }

    const controller = new AbortController();
    setStreaming(true, controller);
    addMessage({ role: 'assistant', content: '' });

    const currentSession = useChatStore.getState().activeSession;
    if (!currentSession) return;

    const apiMessages = currentSession.messages.slice(0, -1).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let fullContent = '';
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
      },
      controller.signal,
    );
  };

  const handlePinAsAnnotation = (content: string, selectedText?: string, userQuestion?: string) => {
    if (!activeDocument) return;
    // Use the user's question as the annotation title, fall back to selected text
    const title = userQuestion || selectedText || '批注';
    addAnnotation({
      documentId: activeDocument.id,
      selectedText: selectedText || title,
      contextBefore: '',
      contextAfter: '',
      comment: userQuestion && selectedText ? `Q: ${userQuestion}` : '',
      llmResponse: content,
      color: '#fef08a',
    });
    setRightPanelTab('annotations');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!activeDocument) {
    return (
      <div className="h-full flex items-center justify-center text-[13px]" style={{ color: 'var(--color-text-tertiary)' }}>
        请先打开一个文档
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Session tabs */}
      <div
        className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto flex-shrink-0"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSession(s.id)}
            className="group flex items-center gap-1 px-2 py-1 text-[11px] rounded-md whitespace-nowrap transition-colors"
            style={{
              background: activeSession?.id === s.id ? 'var(--color-primary-light)' : 'transparent',
              color: activeSession?.id === s.id ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            }}
          >
            <MessageSquare size={9} />
            <span>{s.title}</span>
            <span
              onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
              className="ml-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 cursor-pointer"
            >
              <Trash2 size={9} />
            </span>
          </button>
        ))}
        <button
          onClick={() => createSession(activeDocument.id)}
          className="p-1 rounded-md transition-colors"
          title="新建对话"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-card-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <Plus size={13} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {(!activeSession || activeSession.messages.filter(m => m.role !== 'system').length === 0) && (
          <div className="text-center py-10" style={{ color: 'var(--color-text-tertiary)' }}>
            <MessageSquare size={28} className="mx-auto mb-3 opacity-20" />
            <p className="text-[12px]">选中文本提问，或直接在下方输入</p>
            <p className="text-[11px] mt-1">LLM 将自动获取文档全文作为上下文</p>
          </div>
        )}

        {activeSession?.messages.filter(m => m.role !== 'system').map((msg, idx, filtered) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[88%] text-[13px] leading-relaxed ${
                msg.role === 'user'
                  ? 'rounded-2xl rounded-br-md px-3.5 py-2'
                  : 'rounded-2xl rounded-bl-md px-3.5 py-2'
              }`}
              style={
                msg.role === 'user'
                  ? { background: 'var(--color-primary)', color: 'white' }
                  : { background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }
              }
            >
              {msg.selectedText && msg.role === 'user' && (
                <div className="mb-1.5 px-2 py-1 rounded-md text-[11px] flex items-start gap-1" style={{ background: 'rgba(255,255,255,0.15)' }}>
                  <Quote size={9} className="mt-0.5 flex-shrink-0 opacity-70" />
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
                // Find the preceding user message to get the question
                const prevUserMsg = filtered.slice(0, idx).reverse().find(m => m.role === 'user');
                return (
                  <div className="mt-1.5 flex justify-end">
                    <button
                      onClick={() => handlePinAsAnnotation(msg.content, prevUserMsg?.selectedText, prevUserMsg?.content)}
                      className="flex items-center gap-1 text-[10px] opacity-40 hover:opacity-80 transition-opacity"
                      title="钉为批注"
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
      <div className="p-2.5 flex-shrink-0" style={{ borderTop: '1px solid var(--color-border)' }}>
        <div className="flex items-end gap-1.5">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入问题... (Enter 发送)"
            rows={1}
            className="mac-input"
            style={{
              maxHeight: 100,
              minHeight: 34,
              resize: 'none',
              borderRadius: 'var(--radius-md)',
              padding: '7px 10px',
              fontSize: 13,
            }}
            onInput={(e) => {
              const t = e.target as HTMLTextAreaElement;
              t.style.height = 'auto';
              t.style.height = Math.min(t.scrollHeight, 100) + 'px';
            }}
          />
          {isStreaming ? (
            <button onClick={stopStreaming} className="mac-btn" style={{ padding: '7px 8px', borderColor: 'transparent', color: '#ff3b30' }} title="停止">
              <StopCircle size={15} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="mac-btn mac-btn-primary disabled:opacity-30"
              style={{ padding: '7px 8px' }}
              title="发送"
            >
              <Send size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
