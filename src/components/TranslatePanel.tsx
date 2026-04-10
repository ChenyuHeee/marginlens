import { useEffect, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSelectionStore, useSettingsStore } from '@/stores';
import { streamChat } from '@/lib/llm';
import { Languages, Loader2 } from 'lucide-react';

export function TranslatePanel() {
  const { selection } = useSelectionStore();
  const { settings } = useSettingsStore();
  const [sourceText, setSourceText] = useState('');
  const [translation, setTranslation] = useState('');
  const [translating, setTranslating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const translate = useCallback(async (text: string) => {
    // Cancel previous
    abortRef.current?.abort();

    const provider = useSettingsStore.getState().getActiveProvider();
    if (!provider || !provider.apiKey) {
      setTranslation('⚠️ 请先在设置中配置 API Key');
      return;
    }

    const lang = settings.translationLanguage || '中文';
    const controller = new AbortController();
    abortRef.current = controller;

    setTranslating(true);
    setTranslation('');

    const messages = [
      {
        role: 'system' as const,
        content: `你是一个专业的学术翻译助手。请将用户给出的文本准确翻译为${lang}，保持学术用语的准确性和专业性。只输出翻译结果，不要添加任何解释或额外内容。`,
      },
      {
        role: 'user' as const,
        content: text,
      },
    ];

    let fullContent = '';
    await streamChat(
      provider,
      messages,
      {
        onToken: (token) => {
          fullContent += token;
          setTranslation(fullContent);
        },
        onDone: () => {
          setTranslating(false);
        },
        onError: (error) => {
          if (error.name !== 'AbortError') {
            setTranslation(fullContent + `\n\n⚠️ 翻译出错: ${error.message}`);
          }
          setTranslating(false);
        },
      },
      controller.signal,
    );
  }, [settings.translationLanguage]);

  // Watch for selection changes and auto-translate
  useEffect(() => {
    if (!selection?.text || selection.text.trim().length === 0) return;
    const text = selection.text.trim();
    if (text === sourceText) return;
    setSourceText(text);
    translate(text);
  }, [selection?.text, translate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  if (!sourceText) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-[12px] px-8 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center mb-2.5" style={{ background: 'var(--color-bg-secondary)' }}>
          <Languages size={18} />
        </div>
        <p>选中左侧文本即可实时翻译</p>
        <p className="text-[11px] mt-1">目标语言：{settings.translationLanguage || '中文'}</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-3 py-2 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <span className="text-[12px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          翻译 → {settings.translationLanguage || '中文'}
        </span>
        {translating && <Loader2 size={12} className="animate-spin" style={{ color: 'var(--color-primary)' }} />}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Source text */}
        <div className="px-3 py-2.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div className="text-[10px] font-medium mb-1" style={{ color: 'var(--color-text-tertiary)' }}>原文</div>
          <p className="text-[12px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            {sourceText}
          </p>
        </div>

        {/* Translation */}
        <div className="px-3 py-2.5">
          <div className="text-[10px] font-medium mb-1" style={{ color: 'var(--color-text-tertiary)' }}>译文</div>
          <div className="text-[12px] leading-relaxed markdown-body max-w-none" style={{ fontSize: 12 }}>
            {translation ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{translation}</ReactMarkdown>
            ) : translating ? (
              <span style={{ color: 'var(--color-text-tertiary)' }}>翻译中...</span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
