// API client facade for LLM and Search services
// This file aggregates exports from the modularized structure:
// - src/lib/llm: Large Language Model functionality
// - src/lib/search: Web Search functionality

// Re-export LLM types and main functions
export {
  API_ENDPOINTS,
  DEFAULT_MAX_TOKENS,
  getMaxContextTokens,
  getFastModel,
  callLLMWithMessages,
  callLLM,
  callLLMStreaming,
  callLLMWithImage,
} from './llm';

// Re-export Search functionality
export {
  searchWeb,
  buildSearchEnhancedPrompt,
  generateSearchQuery,
  extractKeywords,
} from './search';
