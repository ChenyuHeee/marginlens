import { useState } from 'react';
import { MessageSquarePlus, Sparkles, ArrowRight, Languages } from 'lucide-react';
import { useChatStore, useAnnotationStore, useSelectionStore, useSettingsStore, useUIStore, useDocumentStore } from '@/stores';
import { buildSystemMessage } from '@/lib/context';
import type { SelectionInfo } from '@/types';
import { streamChat } from '@/lib/llm';

interface SelectionPopupProps {
  selection: SelectionInfo;
  onClose: () => void;
  documentId: string;
}

export function SelectionPopup({ selection, onClose, documentId }: SelectionPopupProps) {
  const { settings } = useSettingsStore();
  const templates = settings.promptTemplates;
  const [showTemplates, setShowTemplates] = useState(false);
  const [customQuestion, setCustomQuestion] = useState('');

  const { setRightPanelTab } = useUIStore();
  const chatStore = useChatStore();
  const annotationStore = useAnnotationStore();
  const selectionStore = useSelectionStore();

  const top = Math.min(selection.rect.bottom + 8, window.innerHeight - 300);
  const left = Math.max(12, Math.min(selection.rect.left, window.innerWidth - 340));

  const handleAskWithTemplate = async (templatePrompt: string) => {
    const prompt = templatePrompt.replace('{text}', selection.text);
    await sendToChat(prompt, selection.text);
    onClose();
  };

  const handleAskCustom = async () => {
    if (!customQuestion.trim()) return;
    await sendToChat(customQuestion.trim(), selection.text);
    setCustomQuestion('');
    onClose();
  };

  const sendToChat = async (prompt: string, selectedText: string) => {
    setRightPanelTab('chat');

    let session = chatStore.activeSession;
    if (!session) {
      session = await chatStore.createSession(documentId);
    }

    const activeDoc = useDocumentStore.getState().activeDocument;
    const allAnnotations = useAnnotationStore.getState().annotations.filter(a => a.documentId === documentId);
    if (activeDoc && session.messages.length === 0) {
      const docText = activeDoc.content || activeDoc.extractedText || '';
      chatStore.addMessage({
        role: 'system',
        content: buildSystemMessage(docText, allAnnotations),
      });
    }

    let hiddenContext = '';
    if (selectedText) {
      hiddenContext += `用户选中的文本：\n"${selectedText}"\n\n`;
      if (selection.contextBefore) {
        hiddenContext += `前文：...${selection.contextBefore.slice(-100)}\n`;
      }
      if (selection.contextAfter) {
        hiddenContext += `后文：${selection.contextAfter.slice(0, 100)}...\n`;
      }
    }

    chatStore.addMessage({
      role: 'user',
      content: prompt,
      hiddenContext: hiddenContext || undefined,
      selectedText,
      positionHint: {
        paragraphIndex: selection.paragraphIndex,
        startOffset: selection.startOffset,
        endOffset: selection.endOffset,
      },
    });

    const provider = useSettingsStore.getState().getActiveProvider();
    if (!provider || !provider.apiKey) {
      useUIStore.getState().setShowApiKeyAlert(true);
      return;
    }

    const controller = new AbortController();
    chatStore.setStreaming(true, controller);
    chatStore.addMessage({ role: 'assistant', content: '' });

    const session2 = useChatStore.getState().activeSession;
    if (!session2) return;

    const apiMessages = session2.messages.slice(0, -1).map((m) => ({
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
          chatStore.updateLastMessage(fullContent);
        },
        onDone: () => {
          chatStore.setStreaming(false);
          chatStore.saveActiveSession();
        },
        onError: (error) => {
          chatStore.updateLastMessage(fullContent + `\n\n⚠️ 错误: ${error.message}`);
          chatStore.setStreaming(false);
          chatStore.saveActiveSession();
        },
      },
      controller.signal,
    );
  };

  const handleAddAnnotation = () => {
    annotationStore.addAnnotation({
      documentId,
      selectedText: selection.text,
      contextBefore: selection.contextBefore,
      contextAfter: selection.contextAfter,
      comment: '',
      color: '#fef08a',
      positionHint: {
        paragraphIndex: selection.paragraphIndex,
        startOffset: selection.startOffset,
        endOffset: selection.endOffset,
      },
    });
    selectionStore.setSelection(null);
    onClose();
  };

  const [translating, setTranslating] = useState(false);

  const handleTranslate = async () => {
    const lang = settings.translationLanguage || '中文';
    const provider = useSettingsStore.getState().getActiveProvider();
    if (!provider || !provider.apiKey) {
      useUIStore.getState().setShowApiKeyAlert(true);
      return;
    }

    const annotation = await annotationStore.addAnnotation({
      documentId,
      selectedText: selection.text,
      contextBefore: selection.contextBefore,
      contextAfter: selection.contextAfter,
      comment: '',
      llmResponse: '翻译中...',
      color: '#bfdbfe',
      positionHint: {
        paragraphIndex: selection.paragraphIndex,
        startOffset: selection.startOffset,
        endOffset: selection.endOffset,
      },
    });
    const annotationId = annotation.id;

    setTranslating(true);
    selectionStore.setSelection(null);

    const messages = [
      {
        role: 'system' as const,
        content: `你是一个专业的学术翻译助手。请将用户给出的文本准确翻译为${lang}，保持学术用语的准确性和专业性。只输出翻译结果，不要添加任何解释或额外内容。`,
      },
      {
        role: 'user' as const,
        content: selection.text,
      },
    ];

    let fullContent = '';
    const controller = new AbortController();

    await streamChat(
      provider,
      messages,
      {
        onToken: (token) => {
          fullContent += token;
          annotationStore.updateAnnotation(annotationId, { llmResponse: fullContent });
        },
        onDone: () => {
          annotationStore.updateAnnotation(annotationId, { llmResponse: fullContent });
          setTranslating(false);
        },
        onError: (error) => {
          annotationStore.updateAnnotation(annotationId, {
            llmResponse: fullContent + `\n\n⚠️ 翻译出错: ${error.message}`,
          });
          setTranslating(false);
        },
      },
      controller.signal,
    );

    onClose();
  };

  return (
    <div
      className="selection-popup"
      style={{ top, left }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="rounded-2xl overflow-hidden animate-scale-in"
        style={{
          backgroundColor: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-strong)',
          boxShadow: 'var(--shadow-xl)',
          minWidth: 300,
          backdropFilter: 'blur(24px)',
        }}
      >
        {/* Action bar */}
        <div className="flex items-center gap-1 p-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="mac-btn mac-btn-primary"
            style={{ fontSize: 11.5, padding: '5px 12px', borderRadius: 'var(--radius-sm)' }}
          >
            <Sparkles size={12} />
            AI 提问
          </button>
          <button
            onClick={handleAddAnnotation}
            className="mac-btn"
            style={{ fontSize: 11.5, padding: '5px 12px', borderRadius: 'var(--radius-sm)' }}
          >
            <MessageSquarePlus size={12} />
            批注
          </button>
          <button
            onClick={handleTranslate}
            disabled={translating}
            className="mac-btn"
            style={{ fontSize: 11.5, padding: '5px 12px', borderRadius: 'var(--radius-sm)' }}
          >
            <Languages size={12} />
            {translating ? '翻译中...' : '翻译'}
          </button>
        </div>

        {/* Template grid */}
        {showTemplates && (
          <div className="p-2 grid grid-cols-2 gap-1" style={{ borderBottom: '1px solid var(--color-border)' }}>
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => handleAskWithTemplate(t.prompt)}
                className="flex items-center gap-2 px-3 py-2 text-[11.5px] rounded-lg transition-all text-left"
                style={{ color: 'var(--color-text)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-card-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span className="text-[13px]">{t.icon}</span>
                <span>{t.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Quick question input */}
        <div className="p-2 flex items-center gap-1.5">
          <input
            type="text"
            placeholder="输入问题..."
            value={customQuestion}
            onChange={(e) => setCustomQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleAskCustom();
              }
              if (e.key === 'Escape') onClose();
            }}
            className="mac-input"
            style={{ fontSize: 12.5, borderRadius: 'var(--radius-sm)' }}
          />
          <button
            onClick={handleAskCustom}
            disabled={!customQuestion.trim()}
            className="mac-btn mac-btn-primary disabled:opacity-20"
            style={{ padding: '6px 9px', borderRadius: 'var(--radius-sm)' }}
          >
            <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
