import { useState } from 'react';
import { MessageSquarePlus, Sparkles, Send, ArrowRight } from 'lucide-react';
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
    const prompt = `关于以下内容：\n\n"${selection.text}"\n\n${customQuestion}`;
    await sendToChat(prompt, selection.text);
    setCustomQuestion('');
    onClose();
  };

  const sendToChat = async (prompt: string, selectedText: string) => {
    setRightPanelTab('chat');

    let session = chatStore.activeSession;
    if (!session) {
      session = await chatStore.createSession(documentId);
    }

    // Inject full document context + annotations as system message if it hasn't been added
    const activeDoc = useDocumentStore.getState().activeDocument;
    const allAnnotations = useAnnotationStore.getState().annotations.filter(a => a.documentId === documentId);
    if (activeDoc && session.messages.length === 0) {
      chatStore.addMessage({
        role: 'system',
        content: buildSystemMessage(activeDoc.content, allAnnotations),
      });
    }

    chatStore.addMessage({
      role: 'user',
      content: prompt,
      selectedText,
    });

    const provider = useSettingsStore.getState().getActiveProvider();
    if (!provider || !provider.apiKey) {
      chatStore.addMessage({
        role: 'assistant',
        content: '⚠️ 请先在设置中配置 API Key。',
      });
      return;
    }

    const controller = new AbortController();
    chatStore.setStreaming(true, controller);
    chatStore.addMessage({ role: 'assistant', content: '' });

    const session2 = useChatStore.getState().activeSession;
    if (!session2) return;

    const apiMessages = session2.messages.slice(0, -1).map((m) => ({
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

  return (
    <div
      className="selection-popup"
      style={{ top, left }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="rounded-xl overflow-hidden"
        style={{
          backgroundColor: 'var(--color-card)',
          border: '1px solid var(--color-border-strong)',
          boxShadow: 'var(--shadow-lg)',
          minWidth: 300,
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* Action bar */}
        <div className="flex items-center gap-0.5 p-1.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="mac-btn mac-btn-primary"
            style={{ fontSize: 11, padding: '4px 10px' }}
          >
            <Sparkles size={12} />
            AI 提问
          </button>
          <button
            onClick={handleAddAnnotation}
            className="mac-btn"
            style={{ fontSize: 11, padding: '4px 10px' }}
          >
            <MessageSquarePlus size={12} />
            批注
          </button>
        </div>

        {/* Template grid */}
        {showTemplates && (
          <div className="p-1.5 grid grid-cols-2 gap-0.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => handleAskWithTemplate(t.prompt)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-colors text-left"
                style={{ color: 'var(--color-text)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-card-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span>{t.icon}</span>
                <span>{t.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Quick question input */}
        <div className="p-1.5 flex items-center gap-1.5">
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
            style={{ fontSize: 12 }}
          />
          <button
            onClick={handleAskCustom}
            disabled={!customQuestion.trim()}
            className="mac-btn mac-btn-primary disabled:opacity-30"
            style={{ padding: '5px 8px' }}
          >
            <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
