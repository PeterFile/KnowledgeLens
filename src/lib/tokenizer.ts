import { getEncoding, Tiktoken } from 'js-tiktoken';

export type TokenizerEncoding = 'cl100k_base' | 'p50k_base' | 'o200k_base';

// Cache encodings to avoid repeated initialization
const encodingCache = new Map<TokenizerEncoding, Tiktoken>();

function getEncoder(encoding: TokenizerEncoding): Tiktoken {
  let encoder = encodingCache.get(encoding);
  if (!encoder) {
    encoder = getEncoding(encoding);
    encodingCache.set(encoding, encoder);
  }
  return encoder;
}

/**
 * Get the appropriate encoding for a given LLM provider and model.
 * Falls back to cl100k_base for unknown models.
 */
export function getEncodingForModel(provider: string, model: string): TokenizerEncoding {
  const lowerModel = model.toLowerCase();

  // OpenAI models
  if (provider === 'openai') {
    // GPT-4o and newer models use o200k_base
    if (lowerModel.includes('gpt-4o') || lowerModel.includes('o1')) {
      return 'o200k_base';
    }
    // GPT-4 and GPT-3.5-turbo use cl100k_base
    if (lowerModel.includes('gpt-4') || lowerModel.includes('gpt-3.5')) {
      return 'cl100k_base';
    }
    // Older models use p50k_base
    if (lowerModel.includes('davinci') || lowerModel.includes('curie')) {
      return 'p50k_base';
    }
  }

  // Anthropic Claude models - use cl100k_base as approximation
  if (provider === 'anthropic') {
    return 'cl100k_base';
  }

  // Google Gemini models - use cl100k_base as approximation
  if (provider === 'gemini') {
    return 'cl100k_base';
  }

  // Default fallback
  return 'cl100k_base';
}

/**
 * Count the number of tokens in a text string.
 */
export function countTokens(text: string, encoding: TokenizerEncoding = 'cl100k_base'): number {
  if (!text) return 0;
  const encoder = getEncoder(encoding);
  return encoder.encode(text).length;
}

/**
 * Truncate text to fit within a token limit.
 * Returns the truncated text that fits within maxTokens.
 */
export function truncateToTokens(
  text: string,
  maxTokens: number,
  encoding: TokenizerEncoding = 'cl100k_base'
): string {
  if (!text || maxTokens <= 0) return '';

  const encoder = getEncoder(encoding);
  const tokens = encoder.encode(text);

  if (tokens.length <= maxTokens) {
    return text;
  }

  // Truncate tokens and decode back to text
  const truncatedTokens = tokens.slice(0, maxTokens);
  return encoder.decode(truncatedTokens);
}
