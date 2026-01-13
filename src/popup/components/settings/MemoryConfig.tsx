// Memory Configuration Component
// Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 5.6
// Note: Popup cannot directly access MemoryManager (requires offscreen API)
// Must communicate via chrome.runtime.sendMessage to background

import { useState, useEffect, useCallback } from 'react';
import { Section } from './Section';
import { t } from '../../../lib/i18n';
import { formatRelativeTime, formatBytes } from '../../../lib/utils/time';
import type { MemoryStats } from '../../../lib/memory';
import type { UserPreference } from '../../../lib/agent/preference-store';

interface MemoryConfigProps {
  language: 'en' | 'zh' | 'ja';
}

type EmbeddingStatus = 'loading' | 'ready' | 'error' | 'unavailable';

interface MemoryState {
  stats: MemoryStats | null;
  preferences: UserPreference[];
  embeddingStatus: EmbeddingStatus;
  isLoading: boolean;
  isSyncing: boolean;
  showClearMemoryModal: boolean;
  showClearPreferencesModal: boolean;
  error: string | null;
}

// Message types for background communication
type MemoryAction =
  | { action: 'memory_get_stats' }
  | { action: 'memory_get_preferences' }
  | { action: 'memory_sync' }
  | { action: 'memory_clear' }
  | { action: 'memory_clear_preferences' };

async function sendMemoryMessage<T>(message: MemoryAction): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response?.success) {
        resolve(response.data);
      } else {
        reject(new Error(response?.error || 'Unknown error'));
      }
    });
  });
}

export function MemoryConfig({ language }: MemoryConfigProps) {
  const [state, setState] = useState<MemoryState>({
    stats: null,
    preferences: [],
    embeddingStatus: 'loading',
    isLoading: true,
    isSyncing: false,
    showClearMemoryModal: false,
    showClearPreferencesModal: false,
    error: null,
  });

  // Load memory stats and preferences via background
  const loadData = useCallback(async () => {
    try {
      const [stats, preferences] = await Promise.all([
        sendMemoryMessage<MemoryStats>({ action: 'memory_get_stats' }),
        sendMemoryMessage<UserPreference[]>({ action: 'memory_get_preferences' }),
      ]);

      // Determine embedding status
      let embeddingStatus: EmbeddingStatus = 'loading';
      if (stats.embeddingModelLoaded) {
        embeddingStatus = 'ready';
      } else if (stats.documentCount > 0) {
        embeddingStatus = 'error';
      }

      setState((prev) => ({
        ...prev,
        stats,
        preferences,
        embeddingStatus,
        isLoading: false,
        error: null,
      }));
    } catch (error) {
      console.error('Failed to load memory data:', error);
      setState((prev) => ({
        ...prev,
        embeddingStatus: 'unavailable',
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load memory data',
      }));
    }
  }, []);

  useEffect(() => {
    loadData();
    // Refresh stats every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Handle sync
  const handleSync = async () => {
    setState((prev) => ({ ...prev, isSyncing: true }));
    try {
      await sendMemoryMessage({ action: 'memory_sync' });
      await loadData();
    } catch (error) {
      console.error('Failed to sync memory:', error);
    } finally {
      setState((prev) => ({ ...prev, isSyncing: false }));
    }
  };

  // Handle clear memory
  const handleClearMemory = async () => {
    try {
      await sendMemoryMessage({ action: 'memory_clear' });
      setState((prev) => ({ ...prev, showClearMemoryModal: false }));
      await loadData();
    } catch (error) {
      console.error('Failed to clear memory:', error);
    }
  };

  // Handle clear preferences
  const handleClearPreferences = async () => {
    try {
      await sendMemoryMessage({ action: 'memory_clear_preferences' });
      setState((prev) => ({ ...prev, showClearPreferencesModal: false }));
      await loadData();
    } catch (error) {
      console.error('Failed to clear preferences:', error);
    }
  };

  const getStatusColor = (status: EmbeddingStatus) => {
    switch (status) {
      case 'ready':
        return 'bg-emerald-500';
      case 'loading':
        return 'bg-yellow-500';
      case 'error':
      case 'unavailable':
        return 'bg-red-500';
    }
  };

  const getStatusText = (status: EmbeddingStatus) => {
    switch (status) {
      case 'ready':
        return t('memory.status_ready', language);
      case 'loading':
        return t('memory.status_loading', language);
      case 'error':
        return t('memory.status_error', language);
      case 'unavailable':
        return t('memory.status_unavailable', language);
    }
  };

  if (state.isLoading) {
    return (
      <Section title={t('memory.title', language)}>
        <div className="text-center py-4 text-gray-500">{t('common.loading', language)}</div>
      </Section>
    );
  }

  // Show error state if memory system is unavailable
  if (state.error && !state.stats) {
    return (
      <Section title={t('memory.title', language)}>
        <div className="text-center py-4 text-gray-500 text-xs">
          {t('memory.unavailable', language)}
        </div>
      </Section>
    );
  }

  const lastSyncText = state.stats?.lastSyncTime
    ? formatRelativeTime(state.stats.lastSyncTime, Date.now(), language)
    : t('common.never', language);

  return (
    <>
      <Section title={t('memory.title', language)}>
        <div className="space-y-4">
          {/* Memory Statistics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-2 bg-gray-50 border border-gray-200">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                {t('memory.document_count', language)}
              </div>
              <div className="text-lg font-mono font-bold">{state.stats?.documentCount ?? 0}</div>
            </div>
            <div className="p-2 bg-gray-50 border border-gray-200">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                {t('memory.index_size', language)}
              </div>
              <div className="text-lg font-mono font-bold">
                {formatBytes(state.stats?.indexSizeBytes ?? 0)}
              </div>
            </div>
          </div>

          {/* Embedding Status */}
          <div className="flex items-center justify-between p-2 bg-gray-50 border border-gray-200">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              {t('memory.embedding_status', language)}
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${getStatusColor(state.embeddingStatus)}`} />
              <span className="text-xs font-mono">{getStatusText(state.embeddingStatus)}</span>
            </div>
          </div>

          {/* Last Sync */}
          <div className="flex items-center justify-between p-2 bg-gray-50 border border-gray-200">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              {t('memory.last_sync', language)}
            </div>
            <span className="text-xs font-mono">{lastSyncText}</span>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleSync}
              disabled={state.isSyncing || state.embeddingStatus === 'unavailable'}
              className="flex-1 btn-brutal bg-white text-black hover:bg-gray-100 disabled:opacity-50"
            >
              {state.isSyncing ? t('memory.syncing', language) : t('memory.sync_now', language)}
            </button>
            <button
              onClick={() => setState((prev) => ({ ...prev, showClearMemoryModal: true }))}
              disabled={state.embeddingStatus === 'unavailable'}
              className="flex-1 btn-brutal bg-white text-black hover:bg-red-50 hover:text-red-600 hover:border-red-600 disabled:opacity-50"
            >
              {t('memory.clear_memory', language)}
            </button>
          </div>
        </div>
      </Section>

      {/* User Preferences Section */}
      <Section title={t('memory.preferences_title', language)}>
        <div className="space-y-3">
          {state.preferences.length === 0 ? (
            <div className="text-center py-3 text-gray-500 text-xs">
              {t('memory.no_preferences', language)}
            </div>
          ) : (
            <div className="space-y-2">
              {state.preferences.map((pref) => (
                <div key={pref.id} className="p-2 bg-gray-50 border border-gray-200 text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-1 py-0.5 bg-black text-white text-[10px] font-bold uppercase">
                      {pref.type}
                    </span>
                  </div>
                  <div className="font-mono text-gray-700">{pref.content}</div>
                </div>
              ))}
            </div>
          )}

          {state.preferences.length > 0 && (
            <button
              onClick={() => setState((prev) => ({ ...prev, showClearPreferencesModal: true }))}
              className="w-full btn-brutal bg-white text-black hover:bg-red-50 hover:text-red-600 hover:border-red-600"
            >
              {t('memory.clear_preferences', language)}
            </button>
          )}
        </div>
      </Section>

      {/* Clear Memory Confirmation Modal */}
      {state.showClearMemoryModal && (
        <ConfirmModal
          message={t('memory.clear_memory_confirm', language)}
          onConfirm={handleClearMemory}
          onCancel={() => setState((prev) => ({ ...prev, showClearMemoryModal: false }))}
          language={language}
        />
      )}

      {/* Clear Preferences Confirmation Modal */}
      {state.showClearPreferencesModal && (
        <ConfirmModal
          message={t('memory.clear_preferences_confirm', language)}
          onConfirm={handleClearPreferences}
          onCancel={() => setState((prev) => ({ ...prev, showClearPreferencesModal: false }))}
          language={language}
        />
      )}
    </>
  );
}

// Confirmation Modal Component
function ConfirmModal({
  message,
  onConfirm,
  onCancel,
  language,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  language: 'en' | 'zh' | 'ja';
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white border-2 border-black p-4 max-w-sm mx-4 shadow-brutal">
        <p className="text-sm mb-4">{message}</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 btn-brutal bg-white text-black">
            {t('common.cancel', language)}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 btn-brutal bg-red-500 text-white border-red-600 hover:bg-red-600"
          >
            {t('common.confirm', language)}
          </button>
        </div>
      </div>
    </div>
  );
}
