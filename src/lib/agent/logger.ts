// Trajectory Logger for Agent Observability
// Requirements: 7.1, 7.2, 7.3, 7.4, 7.5

import type { TrajectoryLog, LogEntry, LogEntryType, ToolCall, ToolResult } from './types';

// Maximum number of log entries to prevent unbounded growth
// With maxSteps=5 and ~4 entries per step, normal usage is ~20 entries
// 200 provides ample headroom while preventing storage quota issues
const MAX_LOG_ENTRIES = 200;

/**
 * Creates a new trajectory log for tracking agent execution
 */
export function createTrajectoryLog(requestId: string): TrajectoryLog {
  return {
    requestId,
    entries: [],
    metrics: {
      totalSteps: 0,
      totalTokens: { input: 0, output: 0 },
      duration: 0,
      errorCount: 0,
    },
  };
}

/**
 * Logs a step in the agent trajectory
 * Requirements: 7.1, 7.2, 7.3
 */
export function logStep(log: TrajectoryLog, entry: Omit<LogEntry, 'timestamp'>): TrajectoryLog {
  const newEntry: LogEntry = {
    ...entry,
    timestamp: Date.now(),
  };

  let updatedEntries = [...log.entries, newEntry];

  // Truncate oldest entries if exceeding limit to prevent unbounded growth
  if (updatedEntries.length > MAX_LOG_ENTRIES) {
    updatedEntries = updatedEntries.slice(-MAX_LOG_ENTRIES);
  }

  // Update metrics based on entry type
  const updatedMetrics = { ...log.metrics };
  updatedMetrics.totalSteps = Math.max(updatedMetrics.totalSteps, entry.stepNumber);

  if (entry.type === 'error') {
    updatedMetrics.errorCount += 1;
  }

  // Calculate duration from first to last entry
  if (updatedEntries.length > 1) {
    updatedMetrics.duration = newEntry.timestamp - updatedEntries[0].timestamp;
  }

  return {
    ...log,
    entries: updatedEntries,
    metrics: updatedMetrics,
  };
}

/**
 * Logs a thought/reasoning step
 * Requirements: 7.1
 */
export function logThought(
  log: TrajectoryLog,
  stepNumber: number,
  content: string,
  metadata?: Record<string, unknown>
): TrajectoryLog {
  return logStep(log, {
    stepNumber,
    type: 'thought',
    content,
    metadata,
  });
}

/**
 * Logs a tool invocation
 * Requirements: 7.2
 */
export function logToolCall(
  log: TrajectoryLog,
  stepNumber: number,
  toolCall: ToolCall,
  metadata?: Record<string, unknown>
): TrajectoryLog {
  return logStep(log, {
    stepNumber,
    type: 'tool_call',
    content: `Tool: ${toolCall.name}, Reasoning: ${toolCall.reasoning}`,
    metadata: {
      ...metadata,
      toolName: toolCall.name,
      parameters: toolCall.parameters,
    },
  });
}

/**
 * Logs a tool result
 * Requirements: 7.2
 */
export function logToolResult(
  log: TrajectoryLog,
  stepNumber: number,
  toolResult: ToolResult,
  metadata?: Record<string, unknown>
): TrajectoryLog {
  const summary = toolResult.success
    ? `Success: ${summarizeData(toolResult.data)}`
    : `Error: ${toolResult.error}`;

  return logStep(log, {
    stepNumber,
    type: 'tool_result',
    content: summary,
    metadata: {
      ...metadata,
      success: toolResult.success,
      tokenCount: toolResult.tokenCount,
    },
  });
}

/**
 * Logs an observation step
 * Requirements: 7.1
 */
export function logObservation(
  log: TrajectoryLog,
  stepNumber: number,
  content: string,
  metadata?: Record<string, unknown>
): TrajectoryLog {
  return logStep(log, {
    stepNumber,
    type: 'observation',
    content,
    metadata,
  });
}

/**
 * Logs a reflection
 * Requirements: 7.3
 */
export function logReflection(
  log: TrajectoryLog,
  stepNumber: number,
  content: string,
  triggerCondition: string,
  metadata?: Record<string, unknown>
): TrajectoryLog {
  return logStep(log, {
    stepNumber,
    type: 'reflection',
    content,
    metadata: {
      ...metadata,
      triggerCondition,
    },
  });
}

/**
 * Logs an error with full context
 * Requirements: 7.5
 */
export function logError(
  log: TrajectoryLog,
  stepNumber: number,
  error: string,
  contextState?: Record<string, unknown>
): TrajectoryLog {
  return logStep(log, {
    stepNumber,
    type: 'error',
    content: error,
    metadata: {
      contextState,
    },
  });
}

/**
 * Updates token usage in the trajectory metrics
 */
export function updateTokenUsage(
  log: TrajectoryLog,
  tokens: { input: number; output: number }
): TrajectoryLog {
  return {
    ...log,
    metrics: {
      ...log.metrics,
      totalTokens: {
        input: log.metrics.totalTokens.input + tokens.input,
        output: log.metrics.totalTokens.output + tokens.output,
      },
    },
  };
}

/**
 * Calculates trajectory efficiency
 * Requirements: 7.4
 * Efficiency = optimal steps / actual steps (1.0 = perfect, <1.0 = suboptimal)
 */
export function calculateEfficiency(log: TrajectoryLog, optimalSteps: number): number {
  if (log.metrics.totalSteps === 0) {
    return 1.0;
  }

  const efficiency = optimalSteps / log.metrics.totalSteps;
  return Math.min(1.0, Math.max(0, efficiency)); // Clamp between 0 and 1
}

/**
 * Sets the optimal steps and calculates efficiency
 */
export function setOptimalSteps(log: TrajectoryLog, optimalSteps: number): TrajectoryLog {
  const efficiency = calculateEfficiency(log, optimalSteps);

  return {
    ...log,
    metrics: {
      ...log.metrics,
      optimalSteps,
      efficiency,
    },
  };
}

/**
 * Exports the trajectory log as a formatted string for debugging
 * Requirements: 7.4
 */
export function exportLog(log: TrajectoryLog): string {
  const lines: string[] = [];

  // Header
  lines.push('='.repeat(60));
  lines.push(`TRAJECTORY LOG: ${log.requestId}`);
  lines.push('='.repeat(60));
  lines.push('');

  // Metrics summary
  lines.push('METRICS:');
  lines.push(`  Total Steps: ${log.metrics.totalSteps}`);
  if (log.metrics.optimalSteps !== undefined) {
    lines.push(`  Optimal Steps: ${log.metrics.optimalSteps}`);
  }
  if (log.metrics.efficiency !== undefined) {
    lines.push(`  Efficiency: ${(log.metrics.efficiency * 100).toFixed(1)}%`);
  }
  lines.push(
    `  Total Tokens: ${log.metrics.totalTokens.input} in / ${log.metrics.totalTokens.output} out`
  );
  lines.push(`  Duration: ${log.metrics.duration}ms`);
  lines.push(`  Error Count: ${log.metrics.errorCount}`);
  lines.push('');

  // Entries
  lines.push('ENTRIES:');
  lines.push('-'.repeat(60));

  for (const entry of log.entries) {
    const timestamp = new Date(entry.timestamp).toISOString();
    const typeLabel = formatEntryType(entry.type);

    lines.push(`[${timestamp}] Step ${entry.stepNumber} - ${typeLabel}`);
    lines.push(`  ${entry.content}`);

    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      lines.push(`  Metadata: ${JSON.stringify(entry.metadata, null, 2).split('\n').join('\n  ')}`);
    }

    lines.push('');
  }

  lines.push('='.repeat(60));
  lines.push('END OF LOG');
  lines.push('='.repeat(60));

  return lines.join('\n');
}

/**
 * Exports the trajectory log as JSON for programmatic access
 */
export function exportLogAsJson(log: TrajectoryLog): string {
  return JSON.stringify(log, null, 2);
}

/**
 * Gets entries of a specific type from the log
 */
export function getEntriesByType(log: TrajectoryLog, type: LogEntryType): LogEntry[] {
  return log.entries.filter((entry) => entry.type === type);
}

/**
 * Gets all entries for a specific step number
 */
export function getEntriesForStep(log: TrajectoryLog, stepNumber: number): LogEntry[] {
  return log.entries.filter((entry) => entry.stepNumber === stepNumber);
}

/**
 * Checks if the trajectory has any errors
 */
export function hasErrors(log: TrajectoryLog): boolean {
  return log.metrics.errorCount > 0;
}

/**
 * Gets the last entry in the log
 */
export function getLastEntry(log: TrajectoryLog): LogEntry | undefined {
  return log.entries[log.entries.length - 1];
}

// ============================================================================
// Helper Functions
// ============================================================================

function summarizeData(data: unknown): string {
  if (data === undefined || data === null) {
    return 'No data';
  }

  if (typeof data === 'string') {
    return data.length > 100 ? `${data.slice(0, 100)}...` : data;
  }

  if (Array.isArray(data)) {
    return `Array[${data.length}]`;
  }

  if (typeof data === 'object') {
    const keys = Object.keys(data);
    return `Object{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}}`;
  }

  return String(data);
}

function formatEntryType(type: LogEntryType): string {
  const labels: Record<LogEntryType, string> = {
    thought: 'THOUGHT',
    tool_call: 'TOOL CALL',
    tool_result: 'TOOL RESULT',
    observation: 'OBSERVATION',
    reflection: 'REFLECTION',
    error: 'ERROR',
  };

  return labels[type];
}
