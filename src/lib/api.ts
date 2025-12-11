// API client for LLM and Search services
import type {
  LLMConfig,
  LLMResponse,
  SearchConfig,
  SearchResult,
  OnTokenCallback,
  ChatMessage,
} from '../types';

// API endpoint URLs
const API_ENDPOINTS = {
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
  serpapi: 'https://serpapi.com/search',
  google: 'https://www.googleapis.com/customsearch/v1',
} as const;


const DEFAULT_MAX_TOKENS: Record<string, number> = {
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
  'gemini-3.0-pro': 2000000,
  'gemini-2.5-pro': 2000000,
  'gemini-2.5-flash': 1000000,
  'gemini-2.5-flash-lite': 1000000,
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
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
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
 * OpenAI streaming with structured messages
 */
async function callOpenAIWithMessages(
  messages: ChatMessage[],
  config: LLMConfig,
  onToken: OnTokenCallback,
  signal?: AbortSignal
): Promise<LLMResponse> {
  const response = await fetch(API_ENDPOINTS.openai, {
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
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  return parseSSEStream(response, onToken, 'openai');
}

/**
 * Anthropic streaming with structured messages
 * Note: Anthropic uses 'system' parameter separately from messages array
 */
async function callAnthropicWithMessages(
  messages: ChatMessage[],
  config: LLMConfig,
  onToken: OnTokenCallback,
  signal?: AbortSignal
): Promise<LLMResponse> {
  // Extract system message (Anthropic handles it separately)
  const systemMessage = messages.find((m) => m.role === 'system');
  const nonSystemMessages = messages.filter((m) => m.role !== 'system');

  const response = await fetch(API_ENDPOINTS.anthropic, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      ...(systemMessage && { system: systemMessage.content }),
      messages: nonSystemMessages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${error}`);
  }

  return parseSSEStream(response, onToken, 'anthropic');
}

/**
 * Gemini streaming with structured messages
 * Note: Gemini REST API uses system_instruction (snake_case) for system prompts
 */
async function callGeminiWithMessages(
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
 * Parse Server-Sent Events stream from LLM providers
 */
async function parseSSEStream(
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

/**
 * OpenAI vision API call
 */
async function callOpenAIWithImage(
  prompt: string,
  imageBase64: string,
  config: LLMConfig,
  onToken?: OnTokenCallback,
  signal?: AbortSignal
): Promise<LLMResponse> {
  const imageUrl = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/png;base64,${imageBase64}`;

  const response = await fetch(API_ENDPOINTS.openai, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
      stream: !!onToken,
    }),
    signal,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI Vision API error: ${response.status} - ${error}`);
  }

  if (onToken) {
    return parseSSEStream(response, onToken, 'openai');
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content ?? '',
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
        }
      : undefined,
  };
}

/**
 * Anthropic vision API call
 */
async function callAnthropicWithImage(
  prompt: string,
  imageBase64: string,
  config: LLMConfig,
  onToken?: OnTokenCallback,
  signal?: AbortSignal
): Promise<LLMResponse> {
  // Strip data URL prefix if present
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const mediaType = imageBase64.match(/^data:(image\/\w+);/)?.[1] ?? 'image/png';

  const response = await fetch(API_ENDPOINTS.anthropic, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Data,
              },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
      stream: !!onToken,
    }),
    signal,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic Vision API error: ${response.status} - ${error}`);
  }

  if (onToken) {
    return parseSSEStream(response, onToken, 'anthropic');
  }

  const data = await response.json();
  return {
    content: data.content?.[0]?.text ?? '',
    usage: data.usage
      ? {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
        }
      : undefined,
  };
}


/**
 * Gemini vision API call
 */
async function callGeminiWithImage(
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


/**
 * Search the web using configured search provider
 */
export async function searchWeb(
  query: string,
  config: SearchConfig,
  signal?: AbortSignal
): Promise<SearchResult[]> {
  switch (config.provider) {
    case 'serpapi':
      return searchWithSerpApi(query, config.apiKey, signal);
    case 'google':
      if (!config.searchEngineId) {
        throw new Error('Google Custom Search requires searchEngineId (cx)');
      }
      return searchWithGoogleCustomSearch(query, config.apiKey, config.searchEngineId, signal);
    default:
      throw new Error(`Unsupported search provider: ${config.provider}`);
  }
}

/**
 * SerpApi search implementation
 */
async function searchWithSerpApi(
  query: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    api_key: apiKey,
    engine: 'google',
    num: '5',
  });

  const response = await fetch(`${API_ENDPOINTS.serpapi}?${params}`, { signal });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`SerpApi error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const results = data.organic_results ?? [];

  return results.slice(0, 5).map((r: Record<string, string>) => ({
    title: r.title ?? '',
    snippet: r.snippet ?? '',
    url: r.link ?? '',
  }));
}

/**
 * Google Custom Search implementation
 */
async function searchWithGoogleCustomSearch(
  query: string,
  apiKey: string,
  searchEngineId: string,
  signal?: AbortSignal
): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    key: apiKey,
    cx: searchEngineId,
    num: '5',
  });

  const response = await fetch(`${API_ENDPOINTS.google}?${params}`, { signal });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google Custom Search error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const items = data.items ?? [];

  return items.slice(0, 5).map((item: Record<string, string>) => ({
    title: item.title ?? '',
    snippet: item.snippet ?? '',
    url: item.link ?? '',
  }));
}

// Common English stop words
const ENGLISH_STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
  'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he',
  'she', 'we', 'they', 'what', 'which', 'who', 'whom', 'when', 'where',
  'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
  'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there',
]);

// Common Chinese stop words
const CHINESE_STOP_WORDS = new Set([
  '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一',
  '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着',
  '没有', '看', '好', '自己', '这', '那', '他', '她', '它', '们', '这个',
  '那个', '什么', '怎么', '为什么', '可以', '能', '但是', '因为', '所以',
  '如果', '虽然', '而且', '或者', '还是', '已经', '正在', '将要', '曾经',
]);

/**
 * Check if text contains Chinese characters
 */
function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

/**
 * Segment Chinese text into words using a simple approach
 * Uses common word boundaries and character-based extraction
 */
function segmentChinese(text: string): string[] {
  const words: string[] = [];

  // Extract sequences of Chinese characters (2-4 chars as potential words)
  const chineseMatches = text.match(/[\u4e00-\u9fff]{2,4}/g) ?? [];
  words.push(...chineseMatches);

  // Also extract single important characters that might be keywords
  const singleChars = text.match(/[\u4e00-\u9fff]/g) ?? [];
  // Only add single chars if they appear multiple times (likely important)
  const charFreq = new Map<string, number>();
  for (const char of singleChars) {
    charFreq.set(char, (charFreq.get(char) ?? 0) + 1);
  }
  for (const [char, count] of charFreq) {
    if (count >= 3 && !CHINESE_STOP_WORDS.has(char)) {
      words.push(char);
    }
  }

  return words;
}

/**
 * Extract keywords from text for search queries
 * Supports both English and Chinese text
 */
export function extractKeywords(text: string, maxKeywords = 5): string[] {
  const hasChinese = containsChinese(text);
  const words: string[] = [];

  if (hasChinese) {
    // Process Chinese text
    const chineseWords = segmentChinese(text);
    words.push(...chineseWords.filter((w) => !CHINESE_STOP_WORDS.has(w)));

    // Also extract any English words in the text
    const englishWords = text
      .toLowerCase()
      .replace(/[\u4e00-\u9fff]/g, ' ')
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !ENGLISH_STOP_WORDS.has(w));
    words.push(...englishWords);
  } else {
    // Process English text
    const englishWords = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !ENGLISH_STOP_WORDS.has(w));
    words.push(...englishWords);
  }

  // Count word frequency
  const frequency = new Map<string, number>();
  for (const word of words) {
    frequency.set(word, (frequency.get(word) ?? 0) + 1);
  }

  // Sort by frequency and return top keywords
  return [...frequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}
