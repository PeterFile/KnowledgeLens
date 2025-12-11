// Type definitions for KnowledgeLens

// LLM Provider Configuration
export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'gemini';
  apiKey: string;
  model: string;
  maxContextTokens?: number;
}

// Search Provider Configuration
export interface SearchConfig {
  provider: 'serpapi' | 'google';
  apiKey: string;
  /** Google Custom Search Engine ID (cx) - required for 'google' provider */
  searchEngineId?: string;
}

// LLM Response
export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

// Search Result
export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

// Streaming callback type
export type OnTokenCallback = (chunk: string) => void;

// Chat message for structured LLM requests (prevents prompt injection)
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Extension Message Types (discriminated union)
export type ExtensionMessage =
  | { action: 'summarize_page'; payload: SummarizePayload }
  | { action: 'explain_text'; payload: ExplainPayload }
  | { action: 'search_enhance'; payload: SearchEnhancePayload }
  | { action: 'capture_screenshot'; payload: CaptureScreenshotPayload }
  | { action: 'extract_screenshot'; payload: ExtractScreenshotPayload }
  | { action: 'generate_note_card'; payload: NoteCardPayload }
  | { action: 'cancel_request'; payload: CancelRequestPayload };

export interface SummarizePayload {
  content: string;
  pageUrl: string;
}


export interface ExplainPayload {
  text: string;
  context: string;
}

export interface SearchEnhancePayload {
  text: string;
  context: string;
}

export interface CaptureScreenshotPayload {
  region: ScreenshotRegion;
  tabId: number;
}

export interface ExtractScreenshotPayload {
  imageBase64: string;
}

export interface NoteCardPayload {
  imageBase64: string;
  extractedText: string;
  pageUrl: string;
  pageTitle: string;
  favicon: string;
}

export interface CancelRequestPayload {
  requestId: string;
}

// Screenshot Types
export interface ScreenshotRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  devicePixelRatio: number;
}

export interface ScreenshotResult {
  imageBase64: string;
  region: ScreenshotRegion;
  pageUrl: string;
  pageTitle: string;
  favicon: string;
}

// Extension Response Types
export type ExtensionResponse =
  | { success: true; data: unknown; requestId: string }
  | { success: false; error: string; requestId: string };

// Streaming message sent from background to popup/content script
export interface StreamingMessage {
  type: 'streaming_start' | 'streaming_chunk' | 'streaming_end' | 'streaming_error';
  requestId: string;
  chunk?: string;
  content?: string;
  error?: string;
}

// Selection Data
export interface SelectionData {
  text: string;
  context: string;
  position: { x: number; y: number };
  pageUrl: string;
  pageTitle: string;
}

// Extracted Content
export interface ExtractedContent {
  title: string;
  mainText: string;
  wordCount: number;
  tokenCount: number;
}

// Async State for UI
export interface AsyncState<T> {
  status: 'idle' | 'loading' | 'streaming' | 'success' | 'error';
  data?: T;
  error?: string;
  requestId?: string;
}

// Stored Settings for chrome.storage.local
export interface StoredSettings {
  llmConfig?: LLMConfig;
  searchConfig?: SearchConfig;
}
