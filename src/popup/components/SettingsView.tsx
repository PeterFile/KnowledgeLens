import { useState, useEffect } from 'react';
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
  gemini: ['gemini-3.0-pro', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
};

export function SettingsView({ settings, setSettings }: SettingsViewProps) {
  const [llmApiKey, setLlmApiKey] = useState(settings?.llmConfig?.apiKey ?? '');
  const [llmProvider, setLlmProvider] = useState<'openai' | 'anthropic' | 'gemini'>(
    settings?.llmConfig?.provider ?? 'openai'
  );
  const [llmModel, setLlmModel] = useState(settings?.llmConfig?.model ?? 'gpt-5.1');
  const [searchApiKey, setSearchApiKey] = useState(settings?.searchConfig?.apiKey ?? '');
  const [searchProvider, setSearchProvider] = useState<'serpapi' | 'google'>(
    settings?.searchConfig?.provider ?? 'serpapi'
  );
  const [searchEngineId, setSearchEngineId] = useState(
    settings?.searchConfig?.searchEngineId ?? ''
  );
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (settings) {
      setLlmApiKey(settings.llmConfig?.apiKey ?? '');
      setLlmProvider(settings.llmConfig?.provider ?? 'openai');
      setLlmModel(settings.llmConfig?.model ?? 'gpt-5.1');
      setSearchApiKey(settings.searchConfig?.apiKey ?? '');
      setSearchProvider(settings.searchConfig?.provider ?? 'serpapi');
      setSearchEngineId(settings.searchConfig?.searchEngineId ?? '');
    }
  }, [settings]);

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      const newSettings: StoredSettings = {
        llmConfig: llmApiKey
          ? { provider: llmProvider, apiKey: llmApiKey, model: llmModel }
          : undefined,
        searchConfig: searchApiKey
          ? {
              provider: searchProvider,
              apiKey: searchApiKey,
              searchEngineId: searchEngineId || undefined,
            }
          : undefined,
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
    setSaveStatus('idle');
  };

  const handleProviderChange = (provider: 'openai' | 'anthropic' | 'gemini') => {
    setLlmProvider(provider);
    setLlmModel(MODEL_OPTIONS[provider][0]);
  };

  return (
    <div className="p-4 space-y-6">
      <LLMSection
        provider={llmProvider}
        model={llmModel}
        apiKey={llmApiKey}
        onProviderChange={handleProviderChange}
        onModelChange={setLlmModel}
        onApiKeyChange={setLlmApiKey}
      />

      <SearchSection
        provider={searchProvider}
        apiKey={searchApiKey}
        searchEngineId={searchEngineId}
        onProviderChange={setSearchProvider}
        onApiKeyChange={setSearchApiKey}
        onSearchEngineIdChange={setSearchEngineId}
      />

      <div className="flex gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          className="flex-1 py-2.5 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saveStatus === 'saving'
            ? 'Saving...'
            : saveStatus === 'saved'
              ? '✓ Saved!'
              : 'Save Settings'}
        </button>
        <button
          onClick={handleClear}
          className="py-2.5 px-4 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Clear All
        </button>
      </div>

      {saveStatus === 'error' && (
        <p className="text-sm text-red-600">Failed to save settings. Please try again.</p>
      )}

      <p className="text-xs text-gray-500 pt-2">
        🔒 API keys are stored locally and never sent to third-party servers other than the
        configured API endpoints.
      </p>
    </div>
  );
}

interface LLMSectionProps {
  provider: 'openai' | 'anthropic' | 'gemini';
  model: string;
  apiKey: string;
  onProviderChange: (provider: 'openai' | 'anthropic' | 'gemini') => void;
  onModelChange: (model: string) => void;
  onApiKeyChange: (key: string) => void;
}

function LLMSection({
  provider,
  model,
  apiKey,
  onProviderChange,
  onModelChange,
  onApiKeyChange,
}: LLMSectionProps) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-800 mb-3">🤖 LLM Configuration</h3>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Provider</label>
          <select
            value={provider}
            onChange={(e) => onProviderChange(e.target.value as 'openai' | 'anthropic' | 'gemini')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="gemini">Google Gemini</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Model</label>
          <select
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {MODEL_OPTIONS[provider].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder="Enter your API key"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>
    </section>
  );
}

interface SearchSectionProps {
  provider: 'serpapi' | 'google';
  apiKey: string;
  searchEngineId: string;
  onProviderChange: (provider: 'serpapi' | 'google') => void;
  onApiKeyChange: (key: string) => void;
  onSearchEngineIdChange: (id: string) => void;
}

function SearchSection({
  provider,
  apiKey,
  searchEngineId,
  onProviderChange,
  onApiKeyChange,
  onSearchEngineIdChange,
}: SearchSectionProps) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-800 mb-3">🔍 Search Configuration</h3>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Provider</label>
          <select
            value={provider}
            onChange={(e) => onProviderChange(e.target.value as 'serpapi' | 'google')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="serpapi">SerpApi</option>
            <option value="google">Google Custom Search</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder="Enter your Search API key"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        {provider === 'google' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Search Engine ID (cx)
            </label>
            <input
              type="text"
              value={searchEngineId}
              onChange={(e) => onSearchEngineIdChange(e.target.value)}
              placeholder="Enter your Custom Search Engine ID"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        )}
      </div>
    </section>
  );
}
