// AgentStatusDisplay Component
// Requirements: 1.6, 3.6, 11.1, 11.2
// Displays real-time agent status including phase, step progress, token usage, and warnings

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

const PHASE_CONFIG: Record<AgentPhase | 'idle', { label: string; icon: string; color: string }> = {
  idle: { label: 'Ready', icon: '⏸️', color: 'text-gray-500' },
  thinking: { label: 'Thinking', icon: '🧠', color: 'text-blue-600' },
  executing: { label: 'Executing', icon: '⚡', color: 'text-amber-600' },
  analyzing: { label: 'Analyzing', icon: '🔍', color: 'text-purple-600' },
  reflecting: { label: 'Reflecting', icon: '💭', color: 'text-indigo-600' },
  synthesizing: { label: 'Synthesizing', icon: '✨', color: 'text-green-600' },
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
  const isWarning = budgetPercent >= 80;
  const isCritical = budgetPercent >= 95;

  if (compact) {
    return (
      <CompactStatus
        config={config}
        stepNumber={stepNumber}
        maxSteps={maxSteps}
        isRunning={isRunning}
        currentTool={currentTool}
        onCancel={onCancel}
      />
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      {/* Phase Header */}
      <div
        className={`px-3 py-2 flex items-center justify-between ${isRunning ? 'bg-blue-50' : 'bg-gray-50'}`}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">{config.icon}</span>
          <span className={`text-sm font-medium ${config.color}`}>
            {config.label}
            {isRunning && currentTool && (
              <span className="text-gray-500 font-normal ml-1">· {currentTool}</span>
            )}
          </span>
          {isRunning && <PulsingDot />}
        </div>
        {isRunning && onCancel && (
          <button
            onClick={onCancel}
            className="text-xs px-2 py-1 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Progress & Token Usage */}
      <div className="px-3 py-2 space-y-2">
        {/* Step Progress */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-600">Step Progress</span>
          <span className="font-medium text-gray-800">
            {stepNumber} / {maxSteps}
          </span>
        </div>
        <ProgressBar value={stepNumber} max={maxSteps} color="blue" />

        {/* Token Usage */}
        <div className="flex items-center justify-between text-xs mt-2">
          <span className="text-gray-600">Token Usage</span>
          <span
            className={`font-medium ${isCritical ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-gray-800'}`}
          >
            {totalTokens.toLocaleString()} / {budget.toLocaleString()}
          </span>
        </div>
        <ProgressBar
          value={totalTokens}
          max={budget}
          color={isCritical ? 'red' : isWarning ? 'amber' : 'green'}
        />
        <div className="flex justify-between text-xs text-gray-500">
          <span>{tokenUsage.input.toLocaleString()} in</span>
          <span>{tokenUsage.output.toLocaleString()} out</span>
        </div>
      </div>

      {/* Degraded Mode Warning */}
      {degradedMode && (
        <div className="px-3 py-2 bg-amber-50 border-t border-amber-100">
          <div className="flex items-start gap-2">
            <span className="text-amber-500">⚠️</span>
            <div className="text-xs text-amber-700">
              <span className="font-medium">Degraded Mode</span>
              {degradedReason && <p className="mt-0.5">{degradedReason}</p>}
            </div>
          </div>
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="px-3 py-2 bg-amber-50 border-t border-amber-100 space-y-1">
          {warnings.map((warning, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-amber-700">
              <span>⚠️</span>
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-3 py-2 bg-red-50 border-t border-red-100">
          <div className="flex items-start gap-2">
            <span className="text-red-500">❌</span>
            <span className="text-xs text-red-700">{error}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Compact status for inline display
function CompactStatus({
  config,
  stepNumber,
  maxSteps,
  isRunning,
  currentTool,
  onCancel,
}: {
  config: { label: string; icon: string; color: string };
  stepNumber: number;
  maxSteps: number;
  isRunning: boolean;
  currentTool?: string;
  onCancel?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-gray-50 text-sm">
      <span>{config.icon}</span>
      <span className={`font-medium ${config.color}`}>{config.label}</span>
      {isRunning && (
        <>
          <span className="text-gray-400">·</span>
          <span className="text-gray-600">
            {stepNumber}/{maxSteps}
          </span>
          {currentTool && (
            <>
              <span className="text-gray-400">·</span>
              <span className="text-gray-500 truncate max-w-[100px]">{currentTool}</span>
            </>
          )}
          <PulsingDot />
          {onCancel && (
            <button onClick={onCancel} className="ml-auto text-xs text-gray-500 hover:text-red-600">
              ✕
            </button>
          )}
        </>
      )}
    </div>
  );
}

// Progress bar component
function ProgressBar({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: 'blue' | 'green' | 'amber' | 'red';
}) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;

  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  };

  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div
        className={`h-full ${colorClasses[color]} transition-all duration-300`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

// Pulsing dot indicator for active state
function PulsingDot() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
    </span>
  );
}

// Hook for managing agent status from messages
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

    const handleMessage = (message: {
      type: string;
      sessionId: string;
      phase?: AgentPhase;
      stepNumber?: number;
      maxSteps?: number;
      tokenUsage?: { input: number; output: number };
      currentTool?: string;
      error?: string;
      degradedMode?: boolean;
      degradedReason?: string;
    }) => {
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
