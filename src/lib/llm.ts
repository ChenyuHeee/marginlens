import type { LLMProvider, ChatMessage } from '@/types';

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: () => void;
  onError: (error: Error) => void;
}

export async function streamChat(
  provider: LLMProvider,
  messages: Pick<ChatMessage, 'role' | 'content'>[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const { baseUrl, model, maxTokens, temperature } = provider;
  const apiKey = provider.apiKey.trim();

  const url = baseUrl.trim().replace(/\/+$/, '') + '/chat/completions';

  const body = {
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    max_tokens: maxTokens,
    temperature,
    stream: true,
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    callbacks.onError(
      err instanceof Error ? err : new Error('Network error'),
    );
    return;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    callbacks.onError(new Error(`API error ${response.status}: ${text}`));
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    callbacks.onError(new Error('No response body'));
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') {
          callbacks.onDone();
          return;
        }
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            callbacks.onToken(delta);
          }
          if (json.choices?.[0]?.finish_reason) {
            callbacks.onDone();
            return;
          }
        } catch {
          // skip malformed JSON lines
        }
      }
    }
    callbacks.onDone();
  } catch (err) {
    if (signal?.aborted) return;
    callbacks.onError(
      err instanceof Error ? err : new Error('Stream read error'),
    );
  }
}
