// AgentStatusDisplay Component
// Style: Refined Brutalist Terminal

import { useState, useEffect } from 'react';
import type { AgentPhase } from '../lib/agent/types';

export interface AgentStatusDisplayProps {
  phase: AgentPhase | 'idle';
  stepNumber: number;
  maxSteps: number;
  tokenUsage: { input: number; output: number };
  budget: number;
  currentTool?: string;
  error?: string;
  warnings?: string[];
  degradedMode?: boolean;
  degradedReason?: string;
  onCancel?: () => void;
  compact?: boolean;
}

const PHASE_CONFIG: Record<AgentPhase | 'idle', { label: string; bg: string; color: string }> = {
  idle: { label: 'IDLE', bg: '#E5E7EB', color: '#374151' },
  thinking: { label: 'THINKING', bg: '#DBEAFE', color: '#1E40AF' },
  executing: { label: 'ACTING', bg: '#FEF3C7', color: '#92400E' },
  analyzing: { label: 'SCANNING', bg: '#F3E8FF', color: '#6B21A8' },
  reflecting: { label: 'REFLECTING', bg: '#FCE7F3', color: '#9D174D' },
  synthesizing: { label: 'WRITING', bg: '#D1FAE5', color: '#065F46' },
};

export function AgentStatusDisplay({
  phase,
  stepNumber,
  maxSteps,
  tokenUsage,
  budget,
  currentTool,
  error,
  warnings = [],
  degradedMode,
  degradedReason,
  onCancel,
  compact = false,
}: AgentStatusDisplayProps) {
  const config = PHASE_CONFIG[phase];
  const isRunning = phase !== 'idle';
  const totalTokens = tokenUsage.input + tokenUsage.output;
  const budgetPercent = budget > 0 ? Math.min(100, Math.round((totalTokens / budget) * 100)) : 0;

  if (compact) return null;

  return (
    <div className="border border-black bg-white p-3 shadow-[2px_2px_0_0_#000]">
      {/* Header Row */}
      <div className="flex justify-between items-center mb-3 pb-2 border-b border-dotted border-black">
        <div className="flex items-center gap-2">
          <span
            className="px-2 py-0.5 text-[10px] font-bold border border-black"
            style={{ backgroundColor: config.bg, color: config.color }}
          >
            {config.label}
          </span>
          {isRunning && <span className="animate-pulse w-2 h-2 bg-black rounded-full"></span>}
        </div>
        {isRunning && onCancel && (
          <button
            onClick={onCancel}
            className="text-[10px] font-bold text-red-600 hover:bg-red-50 px-1 border border-transparent hover:border-red-200"
          >
            ABORT
          </button>
        )}
      </div>

      {/* Progress Info */}
      <div className="space-y-3 font-mono text-xs">
        <div className="flex justify-between">
          <span className="text-gray-500">SEQ:</span>
          <span className="font-bold">
            {stepNumber}/{maxSteps}
          </span>
        </div>

        {currentTool && (
          <div className="bg-gray-50 p-2 border border-black text-[10px]">
            <span className="font-bold text-blue-600">{'>'}</span> {currentTool}
          </div>
        )}

        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-gray-500">
            <span>MEM:</span>
            <span>{budgetPercent}%</span>
          </div>
          <div className="h-2 border border-black p-[1px] bg-white">
            <div
              className="h-full bg-black transition-all duration-300"
              style={{ width: `${budgetPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Status Messages */}
      {(error || degradedMode || warnings.length > 0) && (
        <div className="mt-3 pt-2 border-t border-black">
          {degradedMode && (
            <div className="text-amber-700 text-[10px] font-bold flex items-start gap-1">
              <span>⚠️</span>
              <span>DEGRADED: {degradedReason}</span>
            </div>
          )}
          {error && (
            <div className="bg-red-600 text-white p-2 mt-1 text-[10px] font-bold border border-black">
              FATAL: {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Hook remains unchanged
export function useAgentStatus(sessionId: string | null) {
  const [status, setStatus] = useState<AgentStatusDisplayProps>({
    phase: 'idle',
    stepNumber: 0,
    maxSteps: 5,
    tokenUsage: { input: 0, output: 0 },
    budget: 100000,
    warnings: [],
  });

  useEffect(() => {
    if (!sessionId) return;

    const handleMessage = (message: any) => {
      if (message.sessionId !== sessionId) return;

      if (message.type === 'agent_status_update') {
        setStatus((prev) => ({
          ...prev,
          phase: message.phase ?? prev.phase,
          stepNumber: message.stepNumber ?? prev.stepNumber,
          maxSteps: message.maxSteps ?? prev.maxSteps,
          tokenUsage: message.tokenUsage ?? prev.tokenUsage,
          currentTool: message.currentTool,
          degradedMode: message.degradedMode,
          degradedReason: message.degradedReason,
        }));
      } else if (message.type === 'agent_complete') {
        setStatus((prev) => ({
          ...prev,
          phase: 'idle',
          currentTool: undefined,
        }));
      } else if (message.type === 'agent_error') {
        setStatus((prev) => ({
          ...prev,
          phase: 'idle',
          error: message.error,
          currentTool: undefined,
        }));
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [sessionId]);

  const resetStatus = () => {
    setStatus({
      phase: 'idle',
      stepNumber: 0,
      maxSteps: 5,
      tokenUsage: { input: 0, output: 0 },
      budget: 100000,
      warnings: [],
      error: undefined,
    });
  };

  return { status, setStatus, resetStatus };
}
