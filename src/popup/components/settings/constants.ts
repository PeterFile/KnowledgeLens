export const MODEL_OPTIONS: Record<string, string[]> = {
  openai: ['gpt-5.1', 'gpt-5-mini', 'gpt-5-nano', 'gpt-4.1', 'gpt-4o'],
  anthropic: [
    'claude-sonnet-4-5-20250929',
    'claude-haiku-4-5-20251001',
    'claude-opus-4-5-20251101',
    'claude-3-7-sonnet-latest',
  ],
  gemini: [
    'gemini-3-flash',
    'gemini-3.0-pro',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
  ],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  glm: [
    'glm-4.6',
    'glm-4.5',
    'glm-4.5-x',
    'glm-4.5-air',
    'glm-4.5-airx',
    'glm-4-plus',
    'glm-4-0520',
    'glm-4',
    'glm-4-air',
    'glm-4-flash',
    'glm-4-long',
  ],
  ollama: ['llama3', 'llama3.1', 'mistral', 'phi3', 'gemma2'],
};

// Default agent settings
export const DEFAULT_TOKEN_BUDGET = 100000;
export const DEFAULT_MAX_STEPS = 5;
export const DEFAULT_MAX_RETRIES = 3;
