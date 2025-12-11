import { useState, useEffect, useCallback } from 'react';
import type { StoredSettings, AsyncState, StreamingMessage } from '../types';
import { loadSettings, saveSettings, clearSettings } from '../lib/storage';
import { markdownToHtml } from '../lib/markdown';

type PopupTab = 'summary' | 'chat' | 'settings';

interface SummaryState extends AsyncState<string> {
  content: string;
}

function App() {
  const [activeTab, setActiveTab] = useState<PopupTab>('summary');
  const [settings, setSettings] = useState<StoredSettings | null>(null);
  const [summaryState, setSummaryState] = useState<SummaryState>({
    status: 'idle',
    content: '',
  });
  const [timeoutWarning, setTimeoutWarning] = useState(false);

  // Load settings on mount
  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  // Tab components
  const tabs: { id: PopupTab; label: string; icon: string }[] = [
    { id: 'summary', label: 'Summary', icon: '📄' },
    { id: 'chat', label: 'Chat', icon: '💬' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  return (
    <div className="w-[400px] h-[600px] bg-white flex flex-col">
      {/* Header */}
      <header className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-indigo-600">
        <h1 className="text-lg font-semibold text-white">KnowledgeLens</h1>
      </header>

      {/* Tab Navigation */}
      <nav className="flex border-b border-gray-200 bg-gray-50">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
            }`}
          >
            <span className="mr-1.5">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Tab Content */}
      <main className="flex-1 overflow-auto">
        {activeTab === 'summary' && (
          <SummaryView
            state={summaryState}
            setState={setSummaryState}
            settings={settings}
            timeoutWarning={timeoutWarning}
            setTimeoutWarning={setTimeoutWarning}
          />
        )}
        {activeTab === 'chat' && <ChatView />}
        {activeTab === 'settings' && (
          <SettingsView settings={settings} setSettings={setSettings} />
        )}
      </main>
    </div>
  );
}

// Summary View Component
interface SummaryViewProps {
  state: SummaryState;
  setState: React.Dispatch<React.SetStateAction<SummaryState>>;
  settings: StoredSettings | null;
  timeoutWarning: boolean;
  setTimeoutWarning: React.Dispatch<React.SetStateAction<boolean>>;
}

function SummaryView({
  state,
  setState,
  settings,
  timeoutWarning,
  setTimeoutWarning,
}: SummaryViewProps) {
  const [copied, setCopied] = useState(false);

  const handleSummarize = useCallback(async () => {
    if (!settings?.llmConfig?.apiKey) {
      setState({
        status: 'error',
        content: '',
        error: 'Please configure your LLM API key in Settings first.',
      });
      return;
    }

    const requestId = crypto.randomUUID();
    setState({ status: 'loading', content: '', requestId });
    setTimeoutWarning(false);

    // Set timeout warning after 10 seconds
    const timeoutId = setTimeout(() => setTimeoutWarning(true), 10000);

    try {
      // Get current tab content
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab found');

      // Request page content from content script
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'get_page_content' });
      if (!response?.content) throw new Error('Failed to extract page content');

      // Send summarization request to background
      chrome.runtime.sendMessage({
        action: 'summarize_page',
        payload: { content: response.content, pageUrl: tab.url ?? '' },
        requestId,
      });

      // Listen for streaming responses
      const listener = (message: StreamingMessage) => {
        if (message.requestId !== requestId) return;

        switch (message.type) {
          case 'streaming_start':
            setState((prev) => ({ ...prev, status: 'streaming', content: '' }));
            break;
          case 'streaming_chunk':
            setState((prev) => ({
              ...prev,
              content: prev.content + (message.chunk ?? ''),
            }));
            break;
          case 'streaming_end':
            clearTimeout(timeoutId);
            setTimeoutWarning(false);
            setState((prev) => ({ ...prev, status: 'success' }));
            chrome.runtime.onMessage.removeListener(listener);
            break;
          case 'streaming_error':
            clearTimeout(timeoutId);
            setTimeoutWarning(false);
            setState({
              status: 'error',
              content: '',
              error: message.error ?? 'Unknown error occurred',
            });
            chrome.runtime.onMessage.removeListener(listener);
            break;
        }
      };

      chrome.runtime.onMessage.addListener(listener);
    } catch (error) {
      clearTimeout(timeoutId);
      setTimeoutWarning(false);
      setState({
        status: 'error',
        content: '',
        error: error instanceof Error ? error.message : 'Failed to summarize page',
      });
    }
  }, [settings, setState, setTimeoutWarning]);

  const handleRetry = () => handleSummarize();

  const handleCopy = async () => {
    if (state.content) {
      await navigator.clipboard.writeText(state.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCancel = () => {
    if (state.requestId) {
      chrome.runtime.sendMessage({
        action: 'cancel_request',
        payload: { requestId: state.requestId },
      });
      setState({ status: 'idle', content: '' });
      setTimeoutWarning(false);
    }
  };

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Action Button */}
      {state.status === 'idle' && (
        <button
          onClick={handleSummarize}
          className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          📄 Summarize This Page
        </button>
      )}

      {/* Loading State with Skeleton */}
      {state.status === 'loading' && (
        <div className="flex-1">
          <SkeletonLoader />
          {timeoutWarning && (
            <TimeoutWarning onCancel={handleCancel} onRetry={handleRetry} />
          )}
        </div>
      )}

      {/* Streaming/Success State */}
      {(state.status === 'streaming' || state.status === 'success') && (
        <div className="flex-1 flex flex-col">
          {timeoutWarning && state.status === 'streaming' && (
            <TimeoutWarning onCancel={handleCancel} onRetry={handleRetry} />
          )}
          <div className="flex-1 overflow-auto prose prose-sm max-w-none">
            <MarkdownRenderer content={state.content} />
            {state.status === 'streaming' && (
              <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-1" />
            )}
          </div>
          {state.status === 'success' && (
            <div className="flex gap-2 mt-4 pt-4 border-t">
              <button
                onClick={handleRetry}
                className="flex-1 py-2 px-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                🔄 Retry
              </button>
              <button
                onClick={handleCopy}
                className="flex-1 py-2 px-3 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900"
              >
                {copied ? '✓ Copied!' : '📋 Copy'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Error State */}
      {state.status === 'error' && (
        <ErrorDisplay error={state.error ?? 'Unknown error'} onRetry={handleRetry} />
      )}
    </div>
  );
}

// Skeleton Loader Component
function SkeletonLoader() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-4 bg-gray-200 rounded w-3/4" />
      <div className="h-4 bg-gray-200 rounded w-full" />
      <div className="h-4 bg-gray-200 rounded w-5/6" />
      <div className="h-4 bg-gray-200 rounded w-2/3" />
      <div className="h-4 bg-gray-200 rounded w-full" />
      <div className="h-4 bg-gray-200 rounded w-4/5" />
    </div>
  );
}

// Timeout Warning Component
interface TimeoutWarningProps {
  onCancel: () => void;
  onRetry: () => void;
}

function TimeoutWarning({ onCancel, onRetry }: TimeoutWarningProps) {
  return (
    <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
      <p className="text-sm text-yellow-800 mb-2">
        ⏱️ This is taking longer than expected...
      </p>
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1 text-xs font-medium text-yellow-700 border border-yellow-300 rounded hover:bg-yellow-100"
        >
          Cancel
        </button>
        <button
          onClick={onRetry}
          className="px-3 py-1 text-xs font-medium text-yellow-700 border border-yellow-300 rounded hover:bg-yellow-100"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

// Error Display Component
interface ErrorDisplayProps {
  error: string;
  onRetry: () => void;
}

function ErrorDisplay({ error, onRetry }: ErrorDisplayProps) {
  // Provide actionable guidance based on error type
  const getGuidance = (err: string): string => {
    if (err.includes('API key')) {
      return 'Go to Settings tab to configure your API key.';
    }
    if (err.includes('network') || err.includes('fetch')) {
      return 'Check your internet connection and try again.';
    }
    if (err.includes('rate limit')) {
      return 'You have exceeded the API rate limit. Please wait a moment.';
    }
    if (err.includes('401') || err.includes('403')) {
      return 'Your API key may be invalid. Check Settings.';
    }
    return 'Try again or check your settings.';
  };

  return (
    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
      <p className="text-sm font-medium text-red-800 mb-1">❌ Error</p>
      <p className="text-sm text-red-700 mb-2">{error}</p>
      <p className="text-xs text-red-600 mb-3">{getGuidance(error)}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700"
      >
        🔄 Try Again
      </button>
    </div>
  );
}

// Simple Markdown Renderer
function MarkdownRenderer({ content }: { content: string }) {
  const html = markdownToHtml(content);

  return (
    <div
      className="text-gray-700 leading-relaxed"
      dangerouslySetInnerHTML={{ __html: `<p class="mb-2">${html}</p>` }}
    />
  );
}

// Chat View Component (placeholder for future implementation)
function ChatView() {
  return (
    <div className="p-4 h-full flex flex-col items-center justify-center text-center">
      <div className="text-4xl mb-4">💬</div>
      <h2 className="text-lg font-semibold text-gray-800 mb-2">Chat Coming Soon</h2>
      <p className="text-sm text-gray-600">
        Interactive chat with AI about the current page will be available in a future update.
      </p>
    </div>
  );
}

// Settings View Component
interface SettingsViewProps {
  settings: StoredSettings | null;
  setSettings: React.Dispatch<React.SetStateAction<StoredSettings | null>>;
}

function SettingsView({ settings, setSettings }: SettingsViewProps) {
  const [llmApiKey, setLlmApiKey] = useState(settings?.llmConfig?.apiKey ?? '');
  const [llmProvider, setLlmProvider] = useState<'openai' | 'anthropic' | 'gemini'>(
    settings?.llmConfig?.provider ?? 'openai'
  );
  const [llmModel, setLlmModel] = useState(settings?.llmConfig?.model ?? 'gpt-4o');
  const [searchApiKey, setSearchApiKey] = useState(settings?.searchConfig?.apiKey ?? '');
  const [searchProvider, setSearchProvider] = useState<'serpapi' | 'google'>(
    settings?.searchConfig?.provider ?? 'serpapi'
  );
  const [searchEngineId, setSearchEngineId] = useState(settings?.searchConfig?.searchEngineId ?? '');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Update local state when settings prop changes
  useEffect(() => {
    if (settings) {
      setLlmApiKey(settings.llmConfig?.apiKey ?? '');
      setLlmProvider(settings.llmConfig?.provider ?? 'openai');
      setLlmModel(settings.llmConfig?.model ?? 'gpt-4o');
      setSearchApiKey(settings.searchConfig?.apiKey ?? '');
      setSearchProvider(settings.searchConfig?.provider ?? 'serpapi');
      setSearchEngineId(settings.searchConfig?.searchEngineId ?? '');
    }
  }, [settings]);

  const modelOptions: Record<string, string[]> = {
    openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    anthropic: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest'],
    gemini: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  };

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      const newSettings: StoredSettings = {
        llmConfig: llmApiKey
          ? { provider: llmProvider, apiKey: llmApiKey, model: llmModel }
          : undefined,
        searchConfig: searchApiKey
          ? { provider: searchProvider, apiKey: searchApiKey, searchEngineId: searchEngineId || undefined }
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

  return (
    <div className="p-4 space-y-6">
      {/* LLM Settings */}
      <section>
        <h3 className="text-sm font-semibold text-gray-800 mb-3">🤖 LLM Configuration</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Provider</label>
            <select
              value={llmProvider}
              onChange={(e) => {
                const provider = e.target.value as 'openai' | 'anthropic' | 'gemini';
                setLlmProvider(provider);
                setLlmModel(modelOptions[provider][0]);
              }}
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
              value={llmModel}
              onChange={(e) => setLlmModel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {modelOptions[llmProvider].map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">API Key</label>
            <input
              type="password"
              value={llmApiKey}
              onChange={(e) => setLlmApiKey(e.target.value)}
              placeholder="Enter your API key"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </section>

      {/* Search Settings */}
      <section>
        <h3 className="text-sm font-semibold text-gray-800 mb-3">🔍 Search Configuration</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Provider</label>
            <select
              value={searchProvider}
              onChange={(e) => setSearchProvider(e.target.value as 'serpapi' | 'google')}
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
              value={searchApiKey}
              onChange={(e) => setSearchApiKey(e.target.value)}
              placeholder="Enter your Search API key"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          {searchProvider === 'google' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Search Engine ID (cx)
              </label>
              <input
                type="text"
                value={searchEngineId}
                onChange={(e) => setSearchEngineId(e.target.value)}
                placeholder="Enter your Custom Search Engine ID"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          )}
        </div>
      </section>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          className="flex-1 py-2.5 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? '✓ Saved!' : 'Save Settings'}
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

      {/* Info */}
      <p className="text-xs text-gray-500 pt-2">
        🔒 API keys are stored locally and never sent to third-party servers other than the configured API endpoints.
      </p>
    </div>
  );
}

export default App;
