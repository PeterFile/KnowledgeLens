import type { LLMConfig } from '../../types';

export const API_ENDPOINTS = {
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
  deepseek: 'https://api.deepseek.com/v1/chat/completions',
  glm: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  serpapi: 'https://serpapi.com/search',
  google: 'https://www.googleapis.com/customsearch/v1',
} as const;

export const DEFAULT_MAX_TOKENS: Record<string, number> = {
  // --- OpenAI Models (Generation 5) ---
  'gpt-5.1': 400000,
  'gpt-5-mini': 400000,
  'gpt-5-nano': 400000,
  'gpt-4.1': 1000000,
  // Legacy (Keep for backward compatibility)
  'gpt-4o': 128000,

  // --- Anthropic Claude Models (Generation 4.5) ---
  'claude-sonnet-4-5-20250929': 500000,
  'claude-haiku-4-5-20251001': 500000,
  'claude-opus-4-5-20251101': 500000,
  // Legacy (Deprecated but may still work briefly)
  'claude-3-7-sonnet-latest': 200000,

  // --- Google Gemini Models (Generation 3.0 & 2.5) ---
  'gemini-3-flash': 1000000,
  'gemini-3.0-pro': 2000000,
  'gemini-2.5-pro': 2000000,
  'gemini-2.5-flash': 1000000,
  'gemini-2.5-flash-lite': 1000000,

  // --- DeepSeek Models ---
  'deepseek-chat': 64000,
  'deepseek-reasoner': 64000,

  // --- GLM (Zhipu AI) Models ---
  'glm-4.6': 200000,
  'glm-4.5': 128000,
  'glm-4.5-x': 128000,
  'glm-4.5-air': 128000,
  'glm-4.5-airx': 128000,
  'glm-4-plus': 128000,
  'glm-4-0520': 128000,
  'glm-4': 128000,
  'glm-4-air': 128000,
  'glm-4-flash': 128000,
  'glm-4-long': 1000000,
};

/**
 * Get max context tokens for a model
 */
export function getMaxContextTokens(config: LLMConfig): number {
  if (config.maxContextTokens) {
    return config.maxContextTokens;
  }
  return DEFAULT_MAX_TOKENS[config.model] ?? 8000;
}

export function getFastModel(
  provider: 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'glm' | 'ollama'
): string {
  switch (provider) {
    case 'openai':
      return 'gpt-5-nano';
    case 'anthropic':
      return 'claude-haiku-4-5-20251001';
    case 'gemini':
      return 'gemini-2.5-flash-lite';
    case 'deepseek':
      return 'deepseek-chat';
    case 'glm':
      return 'glm-4-flash';
    case 'ollama':
      return 'llama3';
    default:
      return 'gpt-5-nano';
  }
}
