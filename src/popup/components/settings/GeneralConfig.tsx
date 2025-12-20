import { Section } from './Section';
import { t } from '../../../lib/i18n';

interface GeneralConfigProps {
  language: 'en' | 'zh' | 'ja';
  onLanguageChange: (lang: 'en' | 'zh' | 'ja') => void;
}

export function GeneralConfig({ language, onLanguageChange }: GeneralConfigProps) {
  return (
    <Section title={t('settings.general_config', language)}>
      <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-wider">
            {t('settings.language', language)}
          </label>
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value as 'en' | 'zh' | 'ja')}
            className="select-brutal w-full"
          >
            <option value="en">English</option>
            <option value="zh">中文 (Chinese)</option>
            <option value="ja">日本語 (Japanese)</option>
          </select>
        </div>
      </div>
    </Section>
  );
}
