import type { ChatMessage, LLMConfig, LLMResponse, OnTokenCallback } from '../../../types';
import { API_ENDPOINTS } from '../constants';
import { parseSSEStream } from '../utils';

/**
 * GLM (Zhipu AI) streaming with structured messages (OpenAI compatible)
 */
export async function callGLMWithMessages(
  messages: ChatMessage[],
  config: LLMConfig,
  onToken: OnTokenCallback,
  signal?: AbortSignal
): Promise<LLMResponse> {
  const url = config.baseUrl || API_ENDPOINTS.glm;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
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
    throw new Error(`GLM API error: ${response.status} - ${error}`);
  }

  return parseSSEStream(response, onToken, 'openai'); // GLM is OpenAI compatible
}
