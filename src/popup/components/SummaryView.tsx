import { useState, useCallback } from 'react';
import type { StoredSettings, StreamingMessage } from '../../types';
import { SkeletonLoader } from './SkeletonLoader';
import { TimeoutWarning } from './TimeoutWarning';
import { ErrorDisplay } from './ErrorDisplay';
import { MarkdownRenderer } from './MarkdownRenderer';

export interface SummaryState {
  status: 'idle' | 'loading' | 'streaming' | 'success' | 'error';
  content: string;
  error?: string;
  requestId?: string;
}

interface SummaryViewProps {
  state: SummaryState;
  setState: React.Dispatch<React.SetStateAction<SummaryState>>;
  settings: StoredSettings | null;
  timeoutWarning: boolean;
  setTimeoutWarning: React.Dispatch<React.SetStateAction<boolean>>;
}

export function SummaryView({
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

    const timeoutId = setTimeout(() => setTimeoutWarning(true), 10000);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab found');

      const response = await chrome.tabs.sendMessage(tab.id, { action: 'get_page_content' });
      if (!response?.content) throw new Error('Failed to extract page content');

      chrome.runtime.sendMessage({
        action: 'summarize_page',
        payload: { content: response.content, pageUrl: tab.url ?? '' },
        requestId,
      });

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

  const handleCopy = async () => {
    if (state.content) {
      await navigator.clipboard.writeText(state.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="p-4 h-full flex flex-col">
      {state.status === 'idle' && (
        <button
          onClick={handleSummarize}
          className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          📄 Summarize This Page
        </button>
      )}

      {state.status === 'loading' && (
        <div className="flex-1">
          <SkeletonLoader />
          {timeoutWarning && <TimeoutWarning onCancel={handleCancel} onRetry={handleSummarize} />}
        </div>
      )}

      {(state.status === 'streaming' || state.status === 'success') && (
        <div className="flex-1 flex flex-col">
          {timeoutWarning && state.status === 'streaming' && (
            <TimeoutWarning onCancel={handleCancel} onRetry={handleSummarize} />
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
                onClick={handleSummarize}
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

      {state.status === 'error' && (
        <ErrorDisplay error={state.error ?? 'Unknown error'} onRetry={handleSummarize} />
      )}
    </div>
  );
}
