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

  const handleSend = async () => {
    if (!input.trim() || isStreaming || !activeDocument) return;

    const prompt = input.trim();
    setInput('');

    let session = activeSession;
    if (!session) {
      session = await createSession(activeDocument.id);
    }

    const allAnnotations = useAnnotationStore.getState().annotations.filter(a => a.documentId === activeDocument.id);
    if (session.messages.length === 0) {
      const docText = activeDocument.content || activeDocument.extractedText || '';
      addMessage({
        role: 'system',
        content: buildSystemMessage(docText, allAnnotations),
      });
    }

    addMessage({ role: 'user', content: prompt });

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
          onClick={() => createSession(activeDocument.id)}
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
              <Sparkles size={20} style={{ color: 'var(--color-primary)' }} />
            </div>
            <p className="text-[13px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              开始对话
            </p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
              选中文本提问，或直接在下方输入
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
                  <div className="mt-2 pt-1.5 flex justify-end" style={{ borderTop: '1px solid var(--color-border)' }}>
                    <button
                      onClick={() => handlePinAsAnnotation(msg.content, prevUserMsg?.selectedText, prevUserMsg?.content)}
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
        <div
          className="flex items-end gap-2 p-1.5 rounded-xl"
          style={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入问题... (Enter 发送)"
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
