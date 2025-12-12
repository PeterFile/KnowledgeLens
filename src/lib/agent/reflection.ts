// Reflection Manager for Agent Architecture
// Handles failure analysis and episodic memory for self-correction
// Requirements: 3.1, 3.2, 3.3, 3.4

import type { Reflection, EpisodicMemory, ToolCall, AgentContext } from './types';
import type { LLMConfig, ChatMessage } from '../../types';
import { callLLMWithMessages } from '../api';

// Threshold for considering an error as "repeated"
const REPEATED_ERROR_THRESHOLD = 2;

// ============================================================================
// Episodic Memory Management
// ============================================================================

/**
 * Create a new episodic memory for a session.
 */
export function createEpisodicMemory(sessionId: string): EpisodicMemory {
  return {
    sessionId,
    reflections: [],
    errorCounts: new Map(),
  };
}

/**
 * Generate a unique ID for a reflection.
 */
function generateReflectionId(): string {
  return `ref_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Extract error type from an error message or failed action.
 * Groups similar errors together for tracking repeated failures.
 */
export function extractErrorType(error: string, action: ToolCall): string {
  // Try to extract a meaningful error category
  const lowerError = error.toLowerCase();

  // Common error patterns
  if (lowerError.includes('timeout')) return `timeout:${action.name}`;
  if (lowerError.includes('rate limit')) return 'rate_limit';
  if (lowerError.includes('invalid') || lowerError.includes('validation')) {
    return `validation:${action.name}`;
  }
  if (lowerError.includes('not found') || lowerError.includes('404')) {
    return `not_found:${action.name}`;
  }
  if (lowerError.includes('unauthorized') || lowerError.includes('401')) {
    return 'unauthorized';
  }
  if (lowerError.includes('forbidden') || lowerError.includes('403')) {
    return 'forbidden';
  }
  if (lowerError.includes('network') || lowerError.includes('connection')) {
    return 'network_error';
  }

  // Default: tool-specific error
  return `error:${action.name}`;
}

// ============================================================================
// Reflection Generation
// ============================================================================

/**
 * Generate a reflection from a failed action using LLM analysis.
 * Requirements: 3.1 - Prompt LLM to analyze failure reason
 */
export async function generateReflection(
  failedAction: ToolCall,
  error: string,
  context: AgentContext,
  llmConfig: LLMConfig,
  signal?: AbortSignal
): Promise<Reflection> {
  const errorType = extractErrorType(error, failedAction);

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a failure analysis assistant. Analyze why an action failed and suggest how to fix it.

Output format (use exactly these labels):
ANALYSIS: [1-2 sentences explaining why the action failed]
SUGGESTED_FIX: [1-2 sentences describing how to avoid this failure]

Be concise and actionable. Focus on what can be done differently.`,
    },
    {
      role: 'user',
      content: `Failed Action: ${failedAction.name}
Parameters: ${JSON.stringify(failedAction.parameters, null, 2)}
Reasoning: ${failedAction.reasoning}
Error: ${error}
Current Goal: ${context.grounding.currentGoal}

Analyze this failure and suggest a fix:`,
    },
  ];

  let response = '';
  await callLLMWithMessages(
    messages,
    llmConfig,
    (chunk) => {
      response += chunk;
    },
    signal
  );

  // Parse the response
  const { analysis, suggestedFix } = parseReflectionResponse(response, error);

  return {
    id: generateReflectionId(),
    timestamp: Date.now(),
    errorType,
    failedAction,
    analysis,
    suggestedFix,
    applied: false,
  };
}

/**
 * Parse the LLM response to extract analysis and suggested fix.
 */
function parseReflectionResponse(
  response: string,
  fallbackError: string
): { analysis: string; suggestedFix: string } {
  const analysisMatch = response.match(/ANALYSIS:\s*(.+?)(?=SUGGESTED_FIX:|$)/is);
  const fixMatch = response.match(/SUGGESTED_FIX:\s*(.+?)$/is);

  return {
    analysis: analysisMatch?.[1]?.trim() || `Action failed with error: ${fallbackError}`,
    suggestedFix: fixMatch?.[1]?.trim() || 'Try a different approach or parameters.',
  };
}

// ============================================================================
// Reflection Storage and Retrieval
// ============================================================================

/**
 * Store a reflection in episodic memory.
 * Requirements: 3.2 - Store reflection in episodic memory for current session
 */
export function storeReflection(memory: EpisodicMemory, reflection: Reflection): EpisodicMemory {
  // Update error counts
  const newErrorCounts = new Map(memory.errorCounts);
  const currentCount = newErrorCounts.get(reflection.errorType) || 0;
  newErrorCounts.set(reflection.errorType, currentCount + 1);

  return {
    ...memory,
    reflections: [...memory.reflections, reflection],
    errorCounts: newErrorCounts,
  };
}

/**
 * Get reflections relevant to a specific action.
 * Requirements: 3.3 - Include relevant reflections from previous failures in context
 */
export function getRelevantReflections(action: ToolCall, memory: EpisodicMemory): Reflection[] {
  // Find reflections related to the same tool or similar error patterns
  return memory.reflections.filter((reflection) => {
    // Same tool
    if (reflection.failedAction.name === action.name) {
      return true;
    }

    // Similar parameters (e.g., same query pattern)
    const actionParams = JSON.stringify(action.parameters);
    const reflectionParams = JSON.stringify(reflection.failedAction.parameters);
    if (actionParams === reflectionParams) {
      return true;
    }

    return false;
  });
}

/**
 * Format reflections for injection into agent context.
 */
export function formatReflectionsForContext(reflections: Reflection[]): string {
  if (reflections.length === 0) {
    return '';
  }

  const formatted = reflections
    .map(
      (r, i) =>
        `[Previous Failure ${i + 1}]
Tool: ${r.failedAction.name}
Error Type: ${r.errorType}
Analysis: ${r.analysis}
Suggested Fix: ${r.suggestedFix}`
    )
    .join('\n\n');

  return `<previous_failures>
${formatted}
</previous_failures>`;
}

// ============================================================================
// Repeated Error Detection
// ============================================================================

/**
 * Check if an error type has occurred multiple times.
 * Requirements: 3.4 - Detect when same type of error occurs twice
 */
export function isRepeatedError(errorType: string, memory: EpisodicMemory): boolean {
  const count = memory.errorCounts.get(errorType) || 0;
  return count >= REPEATED_ERROR_THRESHOLD;
}

/**
 * Get the count of a specific error type.
 */
export function getErrorCount(errorType: string, memory: EpisodicMemory): number {
  return memory.errorCounts.get(errorType) || 0;
}

// ============================================================================
// Alternative Suggestion
// ============================================================================

/**
 * Suggest an alternative approach when the same error occurs repeatedly.
 * Requirements: 3.4 - Escalate by trying alternative approach for repeated errors
 */
export async function suggestAlternative(
  failedAction: ToolCall,
  memory: EpisodicMemory,
  llmConfig: LLMConfig,
  availableTools: string[],
  signal?: AbortSignal
): Promise<ToolCall> {
  // Get all reflections for this tool
  const relevantReflections = memory.reflections.filter(
    (r) => r.failedAction.name === failedAction.name
  );

  const previousAttempts = relevantReflections
    .map(
      (r) => `- Parameters: ${JSON.stringify(r.failedAction.parameters)}\n  Error: ${r.analysis}`
    )
    .join('\n');

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a problem-solving assistant. The user has tried an action multiple times and it keeps failing. Suggest an alternative approach.

Available tools: ${availableTools.join(', ')}

Output format (JSON):
{
  "tool": "tool_name",
  "parameters": { ... },
  "reasoning": "Why this alternative might work"
}

Rules:
1. Try a DIFFERENT tool if possible
2. If using the same tool, significantly change the parameters
3. Be creative but realistic`,
    },
    {
      role: 'user',
      content: `Original action that keeps failing:
Tool: ${failedAction.name}
Parameters: ${JSON.stringify(failedAction.parameters, null, 2)}
Original reasoning: ${failedAction.reasoning}

Previous failed attempts:
${previousAttempts}

Suggest an alternative approach:`,
    },
  ];

  let response = '';
  await callLLMWithMessages(
    messages,
    llmConfig,
    (chunk) => {
      response += chunk;
    },
    signal
  );

  // Parse the alternative suggestion
  return parseAlternativeSuggestion(response, failedAction);
}

/**
 * Parse the LLM response to extract an alternative tool call.
 */
function parseAlternativeSuggestion(response: string, fallback: ToolCall): ToolCall {
  // Try to extract JSON from the response
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // Return modified version of original as fallback
    return {
      ...fallback,
      reasoning: `Alternative attempt: ${fallback.reasoning}`,
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      name: parsed.tool || fallback.name,
      parameters: parsed.parameters || fallback.parameters,
      reasoning: parsed.reasoning || 'Alternative approach suggested by reflection system',
    };
  } catch {
    return {
      ...fallback,
      reasoning: `Alternative attempt: ${fallback.reasoning}`,
    };
  }
}

// ============================================================================
// Memory Utilities
// ============================================================================

/**
 * Mark a reflection as applied (used in a retry).
 */
export function markReflectionApplied(
  memory: EpisodicMemory,
  reflectionId: string
): EpisodicMemory {
  return {
    ...memory,
    reflections: memory.reflections.map((r) =>
      r.id === reflectionId ? { ...r, applied: true } : r
    ),
  };
}

/**
 * Get unapplied reflections (not yet used in retries).
 */
export function getUnappliedReflections(memory: EpisodicMemory): Reflection[] {
  return memory.reflections.filter((r) => !r.applied);
}

/**
 * Clear all reflections from memory (e.g., on session reset).
 */
export function clearReflections(memory: EpisodicMemory): EpisodicMemory {
  return {
    ...memory,
    reflections: [],
    errorCounts: new Map(),
  };
}

/**
 * Get a summary of the episodic memory for debugging/logging.
 */
export function getMemorySummary(memory: EpisodicMemory): {
  sessionId: string;
  totalReflections: number;
  appliedReflections: number;
  errorTypes: string[];
  mostCommonError: string | null;
} {
  const errorEntries = Array.from(memory.errorCounts.entries());
  const mostCommon =
    errorEntries.length > 0 ? errorEntries.reduce((a, b) => (a[1] > b[1] ? a : b)) : null;

  return {
    sessionId: memory.sessionId,
    totalReflections: memory.reflections.length,
    appliedReflections: memory.reflections.filter((r) => r.applied).length,
    errorTypes: errorEntries.map(([type]) => type),
    mostCommonError: mostCommon ? mostCommon[0] : null,
  };
}
