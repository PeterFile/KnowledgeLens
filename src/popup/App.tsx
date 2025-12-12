import { useState, useEffect } from 'react';
import type { StoredSettings } from '../types';
import { loadSettings } from '../lib/storage';
import { SummaryView, SettingsView, ChatView, type SummaryState } from './components';

type PopupTab = 'summary' | 'chat' | 'settings';

const TABS: { id: PopupTab; label: string; icon: string }[] = [
  { id: 'summary', label: 'Summary', icon: '📄' },
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

function App() {
  const [activeTab, setActiveTab] = useState<PopupTab>('summary');
  const [settings, setSettings] = useState<StoredSettings | null>(null);
  const [summaryState, setSummaryState] = useState<SummaryState>({
    status: 'idle',
    content: '',
  });
  const [timeoutWarning, setTimeoutWarning] = useState(false);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  return (
    <div className="w-[400px] h-[600px] bg-white flex flex-col">
      <header className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-indigo-600">
        <h1 className="text-lg font-semibold text-white">KnowledgeLens</h1>
      </header>

      <nav className="flex border-b border-gray-200 bg-gray-50">
        {TABS.map((tab) => (
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
        {activeTab === 'settings' && <SettingsView settings={settings} setSettings={setSettings} />}
      </main>
    </div>
  );
}

export default App;
