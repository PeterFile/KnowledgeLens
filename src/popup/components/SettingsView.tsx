import React, { useState } from 'react';
import type { StoredSettings } from '../../types';
import { saveSettings, clearSettings } from '../../lib/storage';
import { ModelConfig } from './settings/ModelConfig';
import { SearchConfig } from './settings/SearchConfig';
import { AgentConfig } from './settings/AgentConfig';
import { GeneralConfig } from './settings/GeneralConfig';
import { t } from '../../lib/i18n';
import {
  MODEL_OPTIONS,
  DEFAULT_TOKEN_BUDGET,
  DEFAULT_MAX_STEPS,
  DEFAULT_MAX_RETRIES,
} from './settings/constants';

interface SettingsViewProps {
  settings: StoredSettings | null;
  setSettings: React.Dispatch<React.SetStateAction<StoredSettings | null>>;
}

interface LocalSettingsState {
  llmApiKey: string;
  llmProvider: 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'glm' | 'ollama';
  llmModel: string;
  llmBaseUrl: string;
  showBaseUrl: boolean;
  searchApiKey: string;
  searchProvider: 'serpapi' | 'google';
  searchEngineId: string;
  tokenBudget: number;
  maxSteps: number;
  maxRetries: number;
  language: 'en' | 'zh' | 'ja';
}

const DEFAULT_STATE: LocalSettingsState = {
  llmApiKey: '',
  llmProvider: 'openai',
  llmModel: 'gpt-5.1',
  llmBaseUrl: '',
  showBaseUrl: false,
  searchApiKey: '',
  searchProvider: 'serpapi',
  searchEngineId: '',
  tokenBudget: DEFAULT_TOKEN_BUDGET,
  maxSteps: DEFAULT_MAX_STEPS,
  maxRetries: DEFAULT_MAX_RETRIES,
  language: 'en',
};

export function SettingsView({ settings, setSettings }: SettingsViewProps) {
  // Initialize state from props if available, otherwise defaults
  const [localState, setLocalState] = useState<LocalSettingsState>(() => {
    if (settings) {
      return {
        llmApiKey: settings.llmConfig?.apiKey ?? '',
        llmProvider: settings.llmConfig?.provider ?? 'openai',
        llmModel: settings.llmConfig?.model ?? 'gpt-5.1',
        llmBaseUrl: settings.llmConfig?.baseUrl ?? '',
        showBaseUrl: !!settings.llmConfig?.baseUrl,
        searchApiKey: settings.searchConfig?.apiKey ?? '',
        searchProvider: settings.searchConfig?.provider ?? 'serpapi',
        searchEngineId: settings.searchConfig?.searchEngineId ?? '',
        tokenBudget: settings.agentSettings?.tokenBudget ?? DEFAULT_TOKEN_BUDGET,
        maxSteps: settings.agentSettings?.maxSteps ?? DEFAULT_MAX_STEPS,
        maxRetries: settings.agentSettings?.maxRetries ?? DEFAULT_MAX_RETRIES,
        language: settings.language ?? 'en',
      };
    }
    return DEFAULT_STATE;
  });

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Sync with settings prop changes is handled by parent key prop

  const updateState = (updates: Partial<LocalSettingsState>) => {
    setLocalState((prev) => ({ ...prev, ...updates }));
  };

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      const newSettings: StoredSettings = {
        llmConfig: localState.llmApiKey
          ? {
              provider: localState.llmProvider,
              apiKey: localState.llmApiKey,
              model: localState.llmModel,
              baseUrl:
                (localState.showBaseUrl || localState.llmProvider === 'ollama') &&
                localState.llmBaseUrl
                  ? localState.llmBaseUrl
                  : undefined,
            }
          : undefined,
        searchConfig: localState.searchApiKey
          ? {
              provider: localState.searchProvider,
              apiKey: localState.searchApiKey,
              searchEngineId: localState.searchEngineId || undefined,
            }
          : undefined,
        agentSettings: {
          tokenBudget: localState.tokenBudget,
          maxSteps: localState.maxSteps,
          maxRetries: localState.maxRetries,
          language: localState.language,
        },
        language: localState.language,
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
    setLocalState(DEFAULT_STATE);
    setSaveStatus('idle');
  };

  const handleProviderChange = (
    provider: 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'glm' | 'ollama'
  ) => {
    let newBaseUrl = '';
    let newShowBaseUrl = false;

    if (provider === 'ollama') {
      newBaseUrl = 'http://localhost:11434/api/chat';
      newShowBaseUrl = true;
    }

    updateState({
      llmProvider: provider,
      llmModel: MODEL_OPTIONS[provider]?.[0] || '',
      llmBaseUrl: newBaseUrl,
      showBaseUrl: newShowBaseUrl,
    });
  };

  return (
    <div className="h-full w-full bg-brutal-bg p-4 overflow-y-auto font-mono text-xs space-y-6 pb-24">
      <ModelConfig
        provider={localState.llmProvider}
        model={localState.llmModel}
        apiKey={localState.llmApiKey}
        baseUrl={localState.llmBaseUrl}
        showBaseUrl={localState.showBaseUrl}
        onProviderChange={handleProviderChange}
        onModelChange={(val) => updateState({ llmModel: val })}
        onApiKeyChange={(val) => updateState({ llmApiKey: val })}
        onBaseUrlChange={(val) => updateState({ llmBaseUrl: val })}
        onShowBaseUrlChange={(val) => updateState({ showBaseUrl: val })}
        language={localState.language}
      />

      <SearchConfig
        provider={localState.searchProvider}
        apiKey={localState.searchApiKey}
        searchEngineId={localState.searchEngineId}
        onProviderChange={(val) => updateState({ searchProvider: val })}
        onApiKeyChange={(val) => updateState({ searchApiKey: val })}
        onSearchEngineIdChange={(val) => updateState({ searchEngineId: val })}
        language={localState.language}
      />

      <AgentConfig
        tokenBudget={localState.tokenBudget}
        maxSteps={localState.maxSteps}
        maxRetries={localState.maxRetries}
        onTokenBudgetChange={(val) => updateState({ tokenBudget: val })}
        onMaxStepsChange={(val) => updateState({ maxSteps: val })}
        onMaxRetriesChange={(val) => updateState({ maxRetries: val })}
        language={localState.language}
      />

      <GeneralConfig
        language={localState.language}
        onLanguageChange={(val) => updateState({ language: val })}
      />

      {/* Floating Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-black flex gap-3 z-20">
        <button
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          className={`flex-1 btn-brutal ${saveStatus === 'saved' ? 'bg-emerald-500 text-black border-black' : 'bg-black text-white border-black'}`}
        >
          {saveStatus === 'saving'
            ? t('common.saving', localState.language)
            : saveStatus === 'saved'
              ? t('common.saved', localState.language)
              : t('common.save', localState.language)}
        </button>
        <button
          onClick={handleClear}
          className="btn-brutal bg-white text-black hover:bg-red-50 hover:text-red-600 hover:border-red-600"
          title={t('common.reset', localState.language)}
        >
          {t('common.reset', localState.language)}
        </button>
      </div>
    </div>
  );
}
