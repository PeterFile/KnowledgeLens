import { Section } from './Section';
import { t } from '../../../lib/i18n';

interface AgentConfigProps {
  tokenBudget: number;
  maxSteps: number;
  maxRetries: number;
  onTokenBudgetChange: (budget: number) => void;
  onMaxStepsChange: (steps: number) => void;
  onMaxRetriesChange: (retries: number) => void;
  language: 'en' | 'zh' | 'ja';
}

export function AgentConfig({
  tokenBudget,
  maxSteps,
  maxRetries,
  onTokenBudgetChange,
  onMaxStepsChange,
  onMaxRetriesChange,
  language,
}: AgentConfigProps) {
  return (
    <Section title={t('settings.agent_config', language)}>
      <div className="space-y-5">
        <div className="space-y-2">
          <div className="flex justify-between">
            <label className="text-[10px] font-bold uppercase tracking-wider">
              {t('settings.token_budget', language)}
            </label>
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
            onChange={(e) => onTokenBudgetChange(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-none appearance-none cursor-pointer border border-black accent-black"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider">
              {t('settings.max_steps', language)}
            </label>
            <select
              value={maxSteps}
              onChange={(e) => onMaxStepsChange(Number(e.target.value))}
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
            <label className="text-[10px] font-bold uppercase tracking-wider">
              {t('settings.retries', language)}
            </label>
            <select
              value={maxRetries}
              onChange={(e) => onMaxRetriesChange(Number(e.target.value))}
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
  );
}
