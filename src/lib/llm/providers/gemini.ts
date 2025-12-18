import type { ChatMessage, LLMConfig, LLMResponse, OnTokenCallback } from '../../../types';
import { API_ENDPOINTS } from '../constants';
import { parseSSEStream } from '../utils';

/**
 * Gemini streaming with structured messages
 * Note: Gemini REST API uses system_instruction (snake_case) for system prompts
 */
export async function callGeminiWithMessages(
  messages: ChatMessage[],
  config: LLMConfig,
  onToken: OnTokenCallback,
  signal?: AbortSignal
): Promise<LLMResponse> {
  const url = `${API_ENDPOINTS.gemini}/${config.model}:streamGenerateContent?key=${config.apiKey}&alt=sse`;

  // Extract system message (Gemini handles it as system_instruction)
  const systemMessage = messages.find((m) => m.role === 'system');
  const nonSystemMessages = messages.filter((m) => m.role !== 'system');

  // Convert messages to Gemini format
  const contents = nonSystemMessages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...(systemMessage && {
        system_instruction: { parts: [{ text: systemMessage.content }] },
      }),
      contents,
    }),
    signal,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  return parseSSEStream(response, onToken, 'gemini');
}

/**
 * Gemini vision API call
 */
export async function callGeminiWithImage(
  prompt: string,
  imageBase64: string,
  config: LLMConfig,
  onToken?: OnTokenCallback,
  signal?: AbortSignal
): Promise<LLMResponse> {
  // Strip data URL prefix if present
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const mimeType = imageBase64.match(/^data:(image\/\w+);/)?.[1] ?? 'image/png';

  const endpoint = onToken ? 'streamGenerateContent' : 'generateContent';
  const url = `${API_ENDPOINTS.gemini}/${config.model}:${endpoint}?key=${config.apiKey}${onToken ? '&alt=sse' : ''}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Data,
              },
            },
          ],
        },
      ],
    }),
    signal,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini Vision API error: ${response.status} - ${error}`);
  }

  if (onToken) {
    return parseSSEStream(response, onToken, 'gemini');
  }

  const data = await response.json();
  return {
    content: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
  };
}
