import type { ChatMessage, LLMConfig, LLMResponse, OnTokenCallback } from '../../types';
import { callAnthropicWithMessages, callAnthropicWithImage } from './providers/anthropic';
import { callDeepSeekWithMessages } from './providers/deepseek';
import { callGeminiWithMessages, callGeminiWithImage } from './providers/gemini';
import { callGLMWithMessages } from './providers/glm';
import { callOllamaWithMessages } from './providers/ollama';
import { callOpenAIWithMessages, callOpenAIWithImage } from './providers/openai';

export { API_ENDPOINTS, DEFAULT_MAX_TOKENS, getMaxContextTokens, getFastModel } from './constants';

/**
 * Streaming LLM call with structured messages (recommended)
 * Separates system prompt from user content to prevent prompt injection attacks
 */
export async function callLLMWithMessages(
  messages: ChatMessage[],
  config: LLMConfig,
  onToken: OnTokenCallback,
  signal?: AbortSignal
): Promise<LLMResponse> {
  switch (config.provider) {
    case 'openai':
      return callOpenAIWithMessages(messages, config, onToken, signal);
    case 'anthropic':
      return callAnthropicWithMessages(messages, config, onToken, signal);
    case 'gemini':
      return callGeminiWithMessages(messages, config, onToken, signal);
    case 'deepseek':
      return callDeepSeekWithMessages(messages, config, onToken, signal);
    case 'glm':
      return callGLMWithMessages(messages, config, onToken, signal);
    case 'ollama':
      return callOllamaWithMessages(messages, config, onToken, signal);
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

/**
 * Non-streaming LLM call - waits for complete response
 * @deprecated Use callLLMWithMessages for better security against prompt injection
 */
export async function callLLM(
  prompt: string,
  config: LLMConfig,
  signal?: AbortSignal
): Promise<LLMResponse> {
  let content = '';
  const usage = { promptTokens: 0, completionTokens: 0 };

  await callLLMStreaming(
    prompt,
    config,
    (chunk) => {
      content += chunk;
    },
    signal
  );

  return { content, usage };
}

/**
 * Streaming LLM call - invokes callback for each token
 * @deprecated Use callLLMWithMessages for better security against prompt injection
 */
export async function callLLMStreaming(
  prompt: string,
  config: LLMConfig,
  onToken: OnTokenCallback,
  signal?: AbortSignal
): Promise<LLMResponse> {
  // Convert single prompt to messages format for backward compatibility
  const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
  return callLLMWithMessages(messages, config, onToken, signal);
}

/**
 * Multimodal LLM call with image support (for vision models)
 */
export async function callLLMWithImage(
  prompt: string,
  imageBase64: string,
  config: LLMConfig,
  onToken?: OnTokenCallback,
  signal?: AbortSignal
): Promise<LLMResponse> {
  switch (config.provider) {
    case 'openai':
      return callOpenAIWithImage(prompt, imageBase64, config, onToken, signal);
    case 'anthropic':
      return callAnthropicWithImage(prompt, imageBase64, config, onToken, signal);
    case 'gemini':
      return callGeminiWithImage(prompt, imageBase64, config, onToken, signal);
    default:
      throw new Error(`Unsupported provider for vision: ${config.provider}`);
  }
}
