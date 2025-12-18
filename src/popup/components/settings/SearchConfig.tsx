import { Section } from './Section';

interface SearchConfigProps {
  provider: 'serpapi' | 'google';
  apiKey: string;
  searchEngineId: string;
  onProviderChange: (provider: 'serpapi' | 'google') => void;
  onApiKeyChange: (apiKey: string) => void;
  onSearchEngineIdChange: (id: string) => void;
}

export function SearchConfig({
  provider,
  apiKey,
  searchEngineId,
  onProviderChange,
  onApiKeyChange,
  onSearchEngineIdChange,
}: SearchConfigProps) {
  return (
    <Section title="Search Configuration">
      <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-wider">Provider</label>
          <select
            value={provider}
            onChange={(e) => onProviderChange(e.target.value as 'serpapi' | 'google')}
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
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder="Key..."
            className="input-brutal"
          />
        </div>
        {provider === 'google' && (
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider">Engine ID (cx)</label>
            <input
              type="text"
              value={searchEngineId}
              onChange={(e) => onSearchEngineIdChange(e.target.value)}
              placeholder="0123..."
              className="input-brutal"
            />
          </div>
        )}
      </div>
    </Section>
  );
}
