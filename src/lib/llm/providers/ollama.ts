import type { ChatMessage, LLMConfig, LLMResponse, OnTokenCallback } from '../../../types';

/**
 * Ollama streaming with structured messages
 * Note: Ollama /api/chat is not standard SSE but a stream of JSON objects
 */
export async function callOllamaWithMessages(
  messages: ChatMessage[],
  config: LLMConfig,
  onToken: OnTokenCallback,
  signal?: AbortSignal
): Promise<LLMResponse> {
  const url = config.baseUrl || 'http://localhost:11434/api/chat';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ollama API error: ${response.status} - ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  let content = '';
  let buffer = '';
  const usage = { promptTokens: 0, completionTokens: 0 };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const data = JSON.parse(trimmed);
          const chunk = data.message?.content ?? '';
          if (chunk) {
            content += chunk;
            onToken(chunk);
          }
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { content, usage };
}
