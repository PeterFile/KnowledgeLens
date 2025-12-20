import { Section } from './Section';
import { MODEL_OPTIONS } from './constants';
import { t } from '../../../lib/i18n';

interface ModelConfigProps {
  provider: 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'glm' | 'ollama';
  model: string;
  apiKey: string;
  baseUrl: string;
  showBaseUrl: boolean;
  onProviderChange: (
    provider: 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'glm' | 'ollama'
  ) => void;
  onModelChange: (model: string) => void;
  onApiKeyChange: (apiKey: string) => void;
  onBaseUrlChange: (baseUrl: string) => void;
  onShowBaseUrlChange: (show: boolean) => void;
  language: 'en' | 'zh' | 'ja';
}

export function ModelConfig({
  provider,
  model,
  apiKey,
  baseUrl,
  showBaseUrl,
  onProviderChange,
  onModelChange,
  onApiKeyChange,
  onBaseUrlChange,
  onShowBaseUrlChange,
  language,
}: ModelConfigProps) {
  return (
    <Section title={t('settings.model_config', language)}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider">
              {t('settings.provider', language)}
            </label>
            <select
              value={provider}
              onChange={(e) =>
                onProviderChange(
                  e.target.value as
                    | 'openai'
                    | 'anthropic'
                    | 'gemini'
                    | 'deepseek'
                    | 'glm'
                    | 'ollama'
                )
              }
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
            <label className="text-[10px] font-bold uppercase tracking-wider">
              {t('settings.model', language)}
            </label>
            {provider === 'ollama' ? (
              <input
                type="text"
                value={model}
                onChange={(e) => onModelChange(e.target.value)}
                placeholder="e.g. llama3"
                className="input-brutal"
              />
            ) : (
              <select
                value={model}
                onChange={(e) => onModelChange(e.target.value)}
                className="select-brutal"
              >
                {MODEL_OPTIONS[provider]?.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-wider">
            {t('settings.api_key', language)}
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder="sk-..."
            className="input-brutal"
          />
        </div>

        {(provider === 'deepseek' || provider === 'glm') && (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="showBaseUrl"
              checked={showBaseUrl}
              onChange={(e) => onShowBaseUrlChange(e.target.checked)}
              className="checkbox-brutal"
            />
            <label
              htmlFor="showBaseUrl"
              className="text-[10px] font-bold uppercase cursor-pointer select-none"
            >
              Use Custom Base URL
            </label>
          </div>
        )}

        {(provider === 'ollama' ||
          ((provider === 'deepseek' || provider === 'glm') && showBaseUrl)) && (
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider">
              {t('settings.base_url', language)}{' '}
              {!showBaseUrl && provider !== 'ollama' && '(Optional)'}
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => onBaseUrlChange(e.target.value)}
              placeholder={
                provider === 'ollama'
                  ? 'http://localhost:11434/api/chat'
                  : provider === 'deepseek'
                    ? 'https://api.deepseek.com/v1/chat/completions'
                    : 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
              }
              className="input-brutal"
            />
          </div>
        )}
      </div>
    </Section>
  );
}
