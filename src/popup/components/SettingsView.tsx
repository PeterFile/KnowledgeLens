import React, { useState, useEffect } from 'react';
import type { StoredSettings } from '../../types';
import { saveSettings, clearSettings } from '../../lib/storage';

interface SettingsViewProps {
  settings: StoredSettings | null;
  setSettings: React.Dispatch<React.SetStateAction<StoredSettings | null>>;
}

const MODEL_OPTIONS: Record<string, string[]> = {
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
const DEFAULT_TOKEN_BUDGET = 100000;
const DEFAULT_MAX_STEPS = 5;
const DEFAULT_MAX_RETRIES = 3;

export function SettingsView({ settings, setSettings }: SettingsViewProps) {
  const [llmApiKey, setLlmApiKey] = useState(settings?.llmConfig?.apiKey ?? '');
  const [llmProvider, setLlmProvider] = useState<
    'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'glm' | 'ollama'
  >(settings?.llmConfig?.provider ?? 'openai');
  const [llmModel, setLlmModel] = useState(settings?.llmConfig?.model ?? 'gpt-5.1');
  const [llmBaseUrl, setLlmBaseUrl] = useState(settings?.llmConfig?.baseUrl ?? '');
  const [searchApiKey, setSearchApiKey] = useState(settings?.searchConfig?.apiKey ?? '');
  const [searchProvider, setSearchProvider] = useState<'serpapi' | 'google'>(
    settings?.searchConfig?.provider ?? 'serpapi'
  );
  const [searchEngineId, setSearchEngineId] = useState(
    settings?.searchConfig?.searchEngineId ?? ''
  );
  const [tokenBudget, setTokenBudget] = useState(
    settings?.agentSettings?.tokenBudget ?? DEFAULT_TOKEN_BUDGET
  );
  const [maxSteps, setMaxSteps] = useState(settings?.agentSettings?.maxSteps ?? DEFAULT_MAX_STEPS);
  const [maxRetries, setMaxRetries] = useState(
    settings?.agentSettings?.maxRetries ?? DEFAULT_MAX_RETRIES
  );
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (settings) {
      setLlmApiKey(settings.llmConfig?.apiKey ?? '');
      setLlmProvider(settings.llmConfig?.provider ?? 'openai');
      setLlmModel(settings.llmConfig?.model ?? 'gpt-5.1');
      setLlmBaseUrl(settings.llmConfig?.baseUrl ?? '');
      setSearchApiKey(settings.searchConfig?.apiKey ?? '');
      setSearchProvider(settings.searchConfig?.provider ?? 'serpapi');
      setSearchEngineId(settings.searchConfig?.searchEngineId ?? '');
      setTokenBudget(settings.agentSettings?.tokenBudget ?? DEFAULT_TOKEN_BUDGET);
      setMaxSteps(settings.agentSettings?.maxSteps ?? DEFAULT_MAX_STEPS);
      setMaxRetries(settings.agentSettings?.maxRetries ?? DEFAULT_MAX_RETRIES);
    }
  }, [settings]);

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      const newSettings: StoredSettings = {
        llmConfig: llmApiKey
          ? {
              provider: llmProvider,
              apiKey: llmApiKey,
              model: llmModel,
              baseUrl: llmBaseUrl || undefined,
            }
          : undefined,
        searchConfig: searchApiKey
          ? {
              provider: searchProvider,
              apiKey: searchApiKey,
              searchEngineId: searchEngineId || undefined,
            }
          : undefined,
        agentSettings: {
          tokenBudget,
          maxSteps,
          maxRetries,
        },
      };
      await saveSettings(newSettings);
      setSettings(newSettings);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
  };

  const handleClear = async () => {
    await clearSettings();
    setSettings(null);
    setLlmApiKey('');
    setSearchApiKey('');
    setSearchEngineId('');
    setTokenBudget(DEFAULT_TOKEN_BUDGET);
    setMaxSteps(DEFAULT_MAX_STEPS);
    setMaxRetries(DEFAULT_MAX_RETRIES);
    setSaveStatus('idle');
  };

  const handleProviderChange = (
    provider: 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'glm' | 'ollama'
  ) => {
    setLlmProvider(provider);
    setLlmModel(MODEL_OPTIONS[provider]?.[0] || '');
    if (provider === 'ollama') {
      setLlmBaseUrl('http://localhost:11434/api/chat');
    }
  };

  return (
    <div className="p-5 space-y-6 pb-20">
      <Section title="AI Model Configuration">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider">Provider</label>
              <select
                value={llmProvider}
                onChange={(e) => handleProviderChange(e.target.value as any)}
                className="select-brutal"
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="gemini">Gemini</option>
                <option value="deepseek">DeepSeek</option>
                <option value="glm">GLM (Zhipu AI)</option>
                <option value="ollama">Ollama (Local)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider">Model</label>
              {llmProvider === 'ollama' ? (
                <input
                  type="text"
                  value={llmModel}
                  onChange={(e) => setLlmModel(e.target.value)}
                  placeholder="e.g. llama3"
                  className="input-brutal"
                />
              ) : (
                <select
                  value={llmModel}
                  onChange={(e) => setLlmModel(e.target.value)}
                  className="select-brutal"
                >
                  {MODEL_OPTIONS[llmProvider]?.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider">API Key</label>
            <input
              type="password"
              value={llmApiKey}
              onChange={(e) => setLlmApiKey(e.target.value)}
              placeholder="sk-..."
              className="input-brutal"
            />
          </div>
          {(llmProvider === 'ollama' || llmProvider === 'deepseek' || llmProvider === 'glm') && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider">
                Base URL {(llmProvider === 'deepseek' || llmProvider === 'glm') && '(Optional)'}
              </label>
              <input
                type="text"
                value={llmBaseUrl}
                onChange={(e) => setLlmBaseUrl(e.target.value)}
                placeholder={
                  llmProvider === 'ollama'
                    ? 'http://localhost:11434/api/chat'
                    : llmProvider === 'deepseek'
                      ? 'https://api.deepseek.com/v1/chat/completions'
                      : 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
                }
                className="input-brutal"
              />
            </div>
          )}
        </div>
      </Section>

      <Section title="Search Configuration">
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider">Provider</label>
            <select
              value={searchProvider}
              onChange={(e) => setSearchProvider(e.target.value as any)}
              className="select-brutal"
            >
              <option value="serpapi">SerpApi (Google)</option>
              <option value="google">Google Custom Search</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider">API Key</label>
            <input
              type="password"
              value={searchApiKey}
              onChange={(e) => setSearchApiKey(e.target.value)}
              placeholder="Key..."
              className="input-brutal"
            />
          </div>
          {searchProvider === 'google' && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider">
                Engine ID (cx)
              </label>
              <input
                type="text"
                value={searchEngineId}
                onChange={(e) => setSearchEngineId(e.target.value)}
                placeholder="0123..."
                className="input-brutal"
              />
            </div>
          )}
        </div>
      </Section>

      <Section title="Agent Parameters">
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="text-[10px] font-bold uppercase tracking-wider">Token Budget</label>
              <span className="text-[10px] font-mono font-bold bg-black text-white px-1">
                {tokenBudget.toLocaleString()}
              </span>
            </div>
            <input
              type="range"
              min="10000"
              max="500000"
              step="10000"
              value={tokenBudget}
              onChange={(e) => setTokenBudget(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-none appearance-none cursor-pointer border border-black accent-black"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider">Max Steps</label>
              <select
                value={maxSteps}
                onChange={(e) => setMaxSteps(Number(e.target.value))}
                className="select-brutal"
              >
                {[3, 5, 7, 10].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider">Retries</label>
              <select
                value={maxRetries}
                onChange={(e) => setMaxRetries(Number(e.target.value))}
                className="select-brutal"
              >
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Section>

      {/* Floating Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-black flex gap-3 z-20">
        <button
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          className={`flex-1 btn-brutal ${saveStatus === 'saved' ? 'bg-emerald-500 text-black border-black' : 'bg-black text-white border-black'}`}
        >
          {saveStatus === 'saving' ? 'SAVING...' : saveStatus === 'saved' ? 'SAVED' : 'SAVE CONFIG'}
        </button>
        <button
          onClick={handleClear}
          className="btn-brutal bg-white text-black hover:bg-red-50 hover:text-red-600 hover:border-red-600"
          title="Reset"
        >
          RESET
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card-brutal">
      <h3 className="font-bold text-xs uppercase mb-4 border-b border-gray-200 pb-2 tracking-wider text-gray-500">
        {title}
      </h3>
      <div>{children}</div>
    </div>
  );
}
