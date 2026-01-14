import React, { useState, useCallback, useEffect } from 'react';
import type { StoredSettings, AgentStatusMessage } from '../../types';
import type { AgentPhase } from '../../lib/agent/types';
import { SkeletonLoader } from './SkeletonLoader';
import { TimeoutWarning } from './TimeoutWarning';
import { ErrorDisplay } from './ErrorDisplay';
import { MarkdownRenderer } from './MarkdownRenderer';
import { AgentStatusDisplay } from '../../components';
import { t } from '../../lib/i18n';

export interface SummaryState {
  status:
    | 'idle'
    | 'loading'
    | 'streaming'
    | 'success'
    | 'error'
    | 'agent_running'
    | 'running_on_page';
  content: string;
  error?: string;
  requestId?: string;
  sessionId?: string;
}

interface AgentState {
  phase: AgentPhase | 'idle';
  stepNumber: number;
  maxSteps: number;
  tokenUsage: { input: number; output: number };
  currentTool?: string;
  degradedMode?: boolean;
  degradedReason?: string;
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
  const [agentState, setAgentState] = useState<AgentState>({
    phase: 'idle',
    stepNumber: 0,
    maxSteps: 5,
    tokenUsage: { input: 0, output: 0 },
  });

  const tokenBudget = settings?.llmConfig?.maxContextTokens ?? 100000;

  useEffect(() => {
    const handleAgentMessage = (message: AgentStatusMessage) => {
      if (!state.sessionId || message.sessionId !== state.sessionId) return;

      switch (message.type) {
        case 'agent_status_update':
          setState((prev) => ({ ...prev, status: 'agent_running' }));
          setAgentState((prev) => ({
            ...prev,
            phase: message.phase ?? prev.phase,
            stepNumber: message.stepNumber ?? prev.stepNumber,
            maxSteps: message.maxSteps ?? prev.maxSteps,
            tokenUsage: message.tokenUsage ?? prev.tokenUsage,
            currentTool: message.currentTool,
            degradedMode: message.degradedMode,
            degradedReason: message.degradedReason,
          }));
          break;
        case 'agent_complete':
          setState((prev) => ({
            ...prev,
            status: 'success',
            content: message.result ?? prev.content,
          }));
          setAgentState((prev) => ({ ...prev, phase: 'idle' }));
          break;
        case 'agent_error':
          setState((prev) => ({
            ...prev,
            status: 'error',
            error: message.error ?? 'Agent error occurred',
          }));
          setAgentState((prev) => ({ ...prev, phase: 'idle' }));
          break;
      }
    };

    chrome.runtime.onMessage.addListener(handleAgentMessage);
    return () => chrome.runtime.onMessage.removeListener(handleAgentMessage);
  }, [state.sessionId, setState]);

  const handleSummarize = useCallback(async () => {
    if (!settings?.llmConfig?.apiKey) {
      setState({
        status: 'error',
        content: '',
        error: 'API Key missing. Please configure in settings.',
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

      // Send message to content script to trigger the panel
      await chrome.tabs.sendMessage(tab.id, {
        action: 'trigger_summary_panel',
        payload: {
          content: response.content,
          pageUrl: tab.url || '',
          pageTitle: tab.title || '',
        },
      });

      setState({ status: 'running_on_page', content: '' });
      clearTimeout(timeoutId);
      setTimeoutWarning(false);
    } catch (error) {
      clearTimeout(timeoutId);
      setTimeoutWarning(false);
      setState({
        status: 'error',
        content: '',
        error:
          error instanceof Error ? error.message : t('common.error', settings?.language ?? 'en'),
      });
    }
  }, [settings, setState, setTimeoutWarning]);

  const handleCancel = () => {
    if (state.requestId) {
      chrome.runtime.sendMessage({
        action: 'cancel_request',
        payload: { requestId: state.requestId },
      });
    }
    if (state.sessionId) {
      chrome.runtime.sendMessage({
        action: 'agent_cancel',
        payload: { sessionId: state.sessionId },
      });
    }
    setState({ status: 'idle', content: '' });
    setTimeoutWarning(false);
    setAgentState({
      phase: 'idle',
      stepNumber: 0,
      maxSteps: 5,
      tokenUsage: { input: 0, output: 0 },
    });
  };

  const handleCopy = async () => {
    if (state.content) {
      await navigator.clipboard.writeText(state.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="p-6 h-full flex flex-col gap-6">
      {state.status === 'idle' && (
        <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
          <div className="w-16 h-16 bg-white border border-black flex items-center justify-center shadow-[4px_4px_0_0_#000]">
            <span className="text-2xl">📄</span>
          </div>
          <div>
            <h3 className="text-xl font-bold mb-2">
              {t('summary.title', settings?.language ?? 'en')}
            </h3>
            <p className="text-xs text-gray-500 max-w-[200px] mx-auto leading-relaxed uppercase tracking-wide">
              {settings?.language === 'zh'
                ? '从当前页面内容中提取见解。'
                : settings?.language === 'ja'
                  ? '現在のページ内容からインサイトを抽出します。'
                  : 'Extract insights from the current page content.'}
            </p>
          </div>
          <button
            onClick={handleSummarize}
            className="btn-brutal bg-black text-white hover:bg-gray-800 w-full py-3"
          >
            {t('summary.start_agent', settings?.language ?? 'en')}
          </button>
        </div>
      )}

      {state.status === 'loading' && (
        <div className="flex-1 flex flex-col gap-4">
          <div className="text-xs font-mono text-gray-500 uppercase tracking-wider border-b border-black pb-1">
            Initializing...
          </div>
          <SkeletonLoader />
          {timeoutWarning && <TimeoutWarning onCancel={handleCancel} onRetry={handleSummarize} />}
        </div>
      )}

      {state.status === 'agent_running' && (
        <div className="flex-1 flex flex-col gap-4">
          <AgentStatusDisplay
            phase={agentState.phase}
            stepNumber={agentState.stepNumber}
            maxSteps={agentState.maxSteps}
            tokenUsage={agentState.tokenUsage}
            budget={tokenBudget}
            currentTool={agentState.currentTool}
            degradedMode={agentState.degradedMode}
            degradedReason={agentState.degradedReason}
            onCancel={handleCancel}
          />
          {state.content && (
            <div className="flex-1 overflow-auto bg-white border border-black p-4 shadow-[2px_2px_0_0_#000]">
              <MarkdownRenderer content={state.content} />
            </div>
          )}
        </div>
      )}

      {(state.status === 'streaming' || state.status === 'success') && (
        <div className="flex-1 flex flex-col h-full gap-4">
          {timeoutWarning && state.status === 'streaming' && (
            <TimeoutWarning onCancel={handleCancel} onRetry={handleSummarize} />
          )}

          <div className="flex-1 overflow-auto bg-white border border-black p-5 shadow-[4px_4px_0_0_#000]">
            <div className="flex items-center gap-2 mb-4 border-b border-gray-100 pb-3">
              <div className="w-2 h-2 bg-green-500 border border-black"></div>
              <span className="text-xs font-bold text-black uppercase">Report Output</span>
            </div>
            <MarkdownRenderer content={state.content} />
          </div>

          {state.status === 'success' && (
            <div className="flex gap-3">
              <button onClick={handleSummarize} className="flex-1 btn-brutal text-xs">
                {t('summary.regenerate', settings?.language ?? 'en')}
              </button>
              <button
                onClick={handleCopy}
                className="flex-1 btn-brutal bg-black text-white hover:bg-gray-900 text-xs"
              >
                {copied
                  ? t('common.saved', settings?.language ?? 'en')
                  : t('summary.copy', settings?.language ?? 'en')}
              </button>
            </div>
          )}
        </div>
      )}

      {state.status === 'running_on_page' && (
        <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
          <div className="w-16 h-16 bg-white border border-black flex items-center justify-center shadow-[4px_4px_0_0_#F59E0B]">
            <span className="text-2xl animate-pulse">✨</span>
          </div>
          <div>
            <h3 className="text-xl font-bold mb-2">Summary Active</h3>
            <p className="text-xs text-gray-500 max-w-[200px] mx-auto leading-relaxed uppercase tracking-wide">
              The summary is being generated in a floating panel on the page.
            </p>
          </div>
          <button
            onClick={() => setState({ status: 'idle', content: '' })}
            className="btn-brutal w-full py-3"
          >
            DISMISS
          </button>
        </div>
      )}

      {state.status === 'error' && (
        <ErrorDisplay error={state.error ?? 'Unknown error'} onRetry={handleSummarize} />
      )}
    </div>
  );
}
