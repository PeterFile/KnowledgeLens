import type { LLMResponse, OnTokenCallback } from '../../types';

/**
 * Parse Server-Sent Events stream from LLM providers
 */
export async function parseSSEStream(
  response: Response,
  onToken: OnTokenCallback,
  provider: 'openai' | 'anthropic' | 'gemini'
): Promise<LLMResponse> {
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
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        const jsonStr = trimmed.slice(6);
        try {
          const chunk = extractChunkContent(JSON.parse(jsonStr), provider);
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

/**
 * Extract text content from provider-specific chunk format
 */
function extractChunkContent(
  data: unknown,
  provider: 'openai' | 'anthropic' | 'gemini'
): string | null {
  const obj = data as Record<string, unknown>;

  switch (provider) {
    case 'openai': {
      const choices = obj.choices as Array<{ delta?: { content?: string } }>;
      return choices?.[0]?.delta?.content ?? null;
    }
    case 'anthropic': {
      if (obj.type === 'content_block_delta') {
        const delta = obj.delta as { text?: string };
        return delta?.text ?? null;
      }
      return null;
    }
    case 'gemini': {
      const candidates = obj.candidates as Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
      return candidates?.[0]?.content?.parts?.[0]?.text ?? null;
    }
    default:
      return null;
  }
}
