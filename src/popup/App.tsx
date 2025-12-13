import React, { useState, useEffect } from 'react';
import type { StoredSettings } from '../types';
import { loadSettings } from '../lib/storage';
import { SummaryView, SettingsView, ChatView, type SummaryState } from './components';

type PopupTab = 'summary' | 'chat' | 'settings';

// Sharp Icons
const Icons = {
  summary: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  chat: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  settings: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 0 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

const TABS: { id: PopupTab; label: string; icon: React.ReactNode }[] = [
  { id: 'summary', label: 'Summary', icon: Icons.summary },
  { id: 'chat', label: 'Chat', icon: Icons.chat },
  { id: 'settings', label: 'Config', icon: Icons.settings },
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
    <div className="w-[400px] h-[600px] bg-[#FAFAFA] flex flex-col font-sans text-black overflow-hidden">
      {/* Brutalist Header - Web3 Style */}
      <header className="px-5 py-4 border-b border-black bg-[#4F46E5] flex justify-between items-center relative z-20">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-white border border-black flex items-center justify-center shadow-[2px_2px_0_0_#000]">
            <span className="font-bold text-xs text-black">KL</span>
          </div>
          <h1
            className="text-lg font-bold tracking-tight text-white"
            style={{ fontFamily: 'Space Grotesk' }}
          >
            KnowledgeLens
          </h1>
        </div>
        <div className="bg-[#10B981] border border-black px-2 py-0.5 text-[10px] font-bold text-black shadow-[2px_2px_0_0_#000]">
          BETA 1.0
        </div>
      </header>

      {/* Brutalist Tabs */}
      <nav className="flex border-b border-black bg-white">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all
              ${
                activeTab === tab.id
                  ? 'bg-white text-black shadow-[inset_0_-2px_0_0_#4F46E5]'
                  : 'bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-black'
              }`}
            style={{ borderRight: '1px solid #000' }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative bg-[#FAFAFA]">
        {/* Subtle dot pattern */}
        <div
          className="absolute inset-0 pointer-events-none opacity-20"
          style={{
            backgroundImage: 'radial-gradient(#000 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        ></div>

        <div className="absolute inset-0 overflow-y-auto custom-scrollbar z-10">
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
        </div>
      </main>
    </div>
  );
}

export default App;
