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
  deepseek: 'https://api.deepseek.com/v1/chat/completions',
  glm: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
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
  'gemini-3-flash': 1000000,
  'gemini-3.0-pro': 2000000,
  'gemini-2.5-pro': 2000000,
  'gemini-2.5-flash': 1000000,
  'gemini-2.5-flash-lite': 1000000,

  // --- DeepSeek Models ---
  'deepseek-chat': 64000,
  'deepseek-reasoner': 64000,

  // --- GLM (Zhipu AI) Models ---
  'glm-4-plus': 128000,
  'glm-4-0520': 128000,
  'glm-4': 128000,
  'glm-4-air': 128000,
  'glm-4-flash': 128000,
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
 * DeepSeek streaming with structured messages (OpenAI compatible)
 */
async function callDeepSeekWithMessages(
  messages: ChatMessage[],
  config: LLMConfig,
  onToken: OnTokenCallback,
  signal?: AbortSignal
): Promise<LLMResponse> {
  const url = config.baseUrl || API_ENDPOINTS.deepseek;
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
    throw new Error(`DeepSeek API error: ${response.status} - ${error}`);
  }

  return parseSSEStream(response, onToken, 'openai'); // DeepSeek is OpenAI compatible
}

/**
 * GLM (Zhipu AI) streaming with structured messages (OpenAI compatible)
 */
async function callGLMWithMessages(
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

/**
 * Ollama streaming with structured messages
 * Note: Ollama /api/chat is not standard SSE but a stream of JSON objects
 */
async function callOllamaWithMessages(
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

/**
 * Build a search-enhanced prompt combining selected text with search results
 */
export function buildSearchEnhancedPrompt(
  selectedText: string,
  searchResults: SearchResult[]
): string {
  const searchContext = searchResults
    .map(
      (result, index) => `[${index + 1}] ${result.title}\n${result.snippet}\nSource: ${result.url}`
    )
    .join('\n\n');

  return `Selected text: ${selectedText}

Web search results:
${searchContext}

Please provide an explanation of the selected text, incorporating relevant information from the search results. Include citations to the sources where appropriate.`;
}

/**
 * Use LLM to generate an optimal search query from user-selected text.
 * This is the "Agentic" approach - letting the model understand intent
 * rather than using heuristic keyword extraction.
 */
export async function generateSearchQuery(
  selectedText: string,
  config: LLMConfig,
  signal?: AbortSignal
): Promise<string> {
  // Use a fast/cheap model for query generation
  const queryGenConfig: LLMConfig = {
    ...config,
    model: getFastModel(config.provider),
  };

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a search query generator. Given user-selected text, output ONLY a concise search query (max 10 words) that captures the user's likely intent. No explanation, just the query.

Examples:
- Input: "He kicked the bucket" → Output: "kicked the bucket idiom meaning"
- Input: "量子纠缠" → Output: "quantum entanglement explanation"
- Input: "The mitochondria is the powerhouse of the cell" → Output: "mitochondria cell function biology"`,
    },
    {
      role: 'user',
      content: selectedText,
    },
  ];

  let query = '';
  await callLLMWithMessages(
    messages,
    queryGenConfig,
    (chunk) => {
      query += chunk;
    },
    signal
  );

  return query.trim() || selectedText.slice(0, 100);
}

/**
 * Get a fast/cheap model for lightweight tasks like query generation
 */
function getFastModel(
  provider: 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'glm' | 'ollama'
): string {
  switch (provider) {
    case 'openai':
      return 'gpt-5-nano';
    case 'anthropic':
      return 'claude-haiku-4-5-20251001';
    case 'gemini':
      return 'gemini-3-flash';
    default:
      return 'gemini-3-flash';
  }
}

// Common stop words to filter out from keyword extraction
const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'as',
  'is',
  'was',
  'are',
  'were',
  'been',
  'be',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'must',
  'shall',
  'can',
  'need',
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'i',
  'you',
  'he',
  'she',
  'we',
  'they',
  'what',
  'which',
  'who',
  'whom',
  'when',
  'where',
  'why',
  'how',
  'all',
  'each',
  'every',
  'both',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'nor',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  'just',
  'also',
  'now',
  'here',
  'there',
]);

/**
 * @deprecated Use generateSearchQuery for better semantic understanding
 * Simple fallback keyword extraction (no LLM required)
 */
export function extractKeywords(text: string, maxKeywords = 5): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fff]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  // Count word frequencies
  const freq = new Map<string, number>();
  for (const word of words) {
    freq.set(word, (freq.get(word) || 0) + 1);
  }

  // Sort by frequency (descending) and return unique keywords
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}
