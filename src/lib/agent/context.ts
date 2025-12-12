// Context Manager for Agent Architecture
// Handles context window management, compaction, and grounding
// Requirements: 5.1, 5.2, 5.3, 5.4

import type {
  AgentContext,
  ContextEntry,
  ContextEntryType,
  GroundingSection,
  Reflection,
} from './types';
import type { LLMConfig, ChatMessage } from '../../types';
import { countTokens } from '../tokenizer';
import { callLLMWithMessages } from '../api';

// Compaction threshold: trigger when context reaches 80% of max capacity
const COMPACTION_THRESHOLD = 0.8;

// Minimum reduction required for compaction (20% smaller)
const MIN_COMPACTION_REDUCTION = 0.2;

// ============================================================================
// Context Creation
// ============================================================================

/**
 * Create initial context with grounding for a new goal.
 * Requirements: 5.4 - Include grounding section with current state and objectives
 */
export function createContext(goal: string, maxTokens: number): AgentContext {
  const grounding: GroundingSection = {
    currentGoal: goal,
    completedSubtasks: [],
    keyDecisions: [],
    userPreferences: {},
  };

  const groundingTokens = countTokens(serializeGrounding(grounding));

  return {
    grounding,
    history: [],
    reflections: [],
    tokenCount: groundingTokens,
    maxTokens,
  };
}

// ============================================================================
// Context Entry Management
// ============================================================================

/**
 * Create a new context entry with token count.
 */
export function createContextEntry(type: ContextEntryType, content: string): ContextEntry {
  return {
    type,
    content,
    timestamp: Date.now(),
    tokenCount: countTokens(content),
    compacted: false,
  };
}

/**
 * Add an entry to the context.
 * Requirements: 5.1 - Track context entries for potential compaction
 */
export function addToContext(context: AgentContext, entry: ContextEntry): AgentContext {
  const newHistory = [...context.history, entry];
  const newTokenCount = context.tokenCount + entry.tokenCount;

  return {
    ...context,
    history: newHistory,
    tokenCount: newTokenCount,
  };
}

/**
 * Add a reflection to the context.
 */
export function addReflectionToContext(
  context: AgentContext,
  reflection: Reflection
): AgentContext {
  const reflectionTokens = countTokens(reflection.analysis + reflection.suggestedFix);

  return {
    ...context,
    reflections: [...context.reflections, reflection],
    tokenCount: context.tokenCount + reflectionTokens,
  };
}

/**
 * Update grounding with a completed subtask.
 * Requirements: 5.1 - Generate summary of completed sub-tasks
 */
export function markSubtaskComplete(context: AgentContext, subtaskSummary: string): AgentContext {
  const newGrounding: GroundingSection = {
    ...context.grounding,
    completedSubtasks: [...context.grounding.completedSubtasks, subtaskSummary],
  };

  const oldGroundingTokens = countTokens(serializeGrounding(context.grounding));
  const newGroundingTokens = countTokens(serializeGrounding(newGrounding));
  const tokenDelta = newGroundingTokens - oldGroundingTokens;

  return {
    ...context,
    grounding: newGrounding,
    tokenCount: context.tokenCount + tokenDelta,
  };
}

/**
 * Record a key decision in the grounding.
 * Requirements: 5.3 - Preserve key decisions during compaction
 */
export function recordKeyDecision(context: AgentContext, decision: string): AgentContext {
  const newGrounding: GroundingSection = {
    ...context.grounding,
    keyDecisions: [...context.grounding.keyDecisions, decision],
  };

  const oldGroundingTokens = countTokens(serializeGrounding(context.grounding));
  const newGroundingTokens = countTokens(serializeGrounding(newGrounding));
  const tokenDelta = newGroundingTokens - oldGroundingTokens;

  return {
    ...context,
    grounding: newGrounding,
    tokenCount: context.tokenCount + tokenDelta,
  };
}

/**
 * Set a user preference.
 * Requirements: 5.3 - Preserve user preferences during compaction
 */
export function setUserPreference(context: AgentContext, key: string, value: string): AgentContext {
  const newGrounding: GroundingSection = {
    ...context.grounding,
    userPreferences: {
      ...context.grounding.userPreferences,
      [key]: value,
    },
  };

  const oldGroundingTokens = countTokens(serializeGrounding(context.grounding));
  const newGroundingTokens = countTokens(serializeGrounding(newGrounding));
  const tokenDelta = newGroundingTokens - oldGroundingTokens;

  return {
    ...context,
    grounding: newGrounding,
    tokenCount: context.tokenCount + tokenDelta,
  };
}

// ============================================================================
// Compaction Detection
// ============================================================================

/**
 * Check if context needs compaction (>80% capacity).
 * Requirements: 5.2 - Trigger compaction when approaching 80% capacity
 */
export function needsCompaction(context: AgentContext): boolean {
  return context.tokenCount >= context.maxTokens * COMPACTION_THRESHOLD;
}

/**
 * Get the current context utilization as a percentage.
 */
export function getContextUtilization(context: AgentContext): number {
  return context.maxTokens > 0 ? context.tokenCount / context.maxTokens : 0;
}

// ============================================================================
// Context Compaction
// ============================================================================

/**
 * Compact context using Rolling Summary strategy.
 * Requirements: 5.1, 5.2, 5.3, 5.5
 *
 * Rolling Summary approach:
 * - Maintains a SINGLE global summary instead of stacking multiple summaries
 * - Each compaction: [Previous Summary] + [New Messages] → [New Single Summary]
 * - Final structure: [Grounding] + [Single Global Summary] + [Recent Messages]
 *
 * This prevents summary accumulation from filling the context window.
 */
export async function compactContext(
  context: AgentContext,
  llmConfig: LLMConfig,
  signal?: AbortSignal
): Promise<AgentContext> {
  // Don't compact if we're below threshold
  if (!needsCompaction(context)) {
    return context;
  }

  // Separate existing summary (if any) from uncompacted entries
  const existingSummary = context.history.find((e) => e.compacted);
  const uncompactedEntries = context.history.filter((e) => !e.compacted);

  if (uncompactedEntries.length === 0) {
    return context;
  }

  // Build the new messages text
  const newMessagesText = uncompactedEntries.map((e) => `[${e.type}] ${e.content}`).join('\n\n');

  // Build prompt with previous summary context (Rolling Summary)
  const previousSummarySection = existingSummary
    ? `<previous_summary>\n${existingSummary.content}\n</previous_summary>\n\n`
    : '';

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a context compaction assistant using Rolling Summary strategy.

Your task: Merge the previous summary (if any) with new messages into ONE comprehensive summary.

Rules:
1. If there's a previous summary, incorporate its key information
2. Preserve all key decisions and their reasoning
3. Preserve any user preferences mentioned
4. Preserve error patterns and lessons learned
5. Remove redundant or verbose content
6. Output ONLY the merged summary, no explanations
7. The output replaces ALL previous context - ensure nothing important is lost`,
    },
    {
      role: 'user',
      content: `${previousSummarySection}<new_messages>
${newMessagesText}
</new_messages>

Create a single comprehensive summary that merges the previous summary (if any) with the new messages:`,
    },
  ];

  let summary = '';
  await callLLMWithMessages(
    messages,
    llmConfig,
    (chunk) => {
      summary += chunk;
    },
    signal
  );

  summary = summary.trim();

  // Create the single rolling summary entry (replaces any previous summary)
  const rollingSummaryEntry: ContextEntry = {
    type: 'assistant',
    content: `[Context Summary]\n${summary}`,
    timestamp: Date.now(),
    tokenCount: countTokens(`[Context Summary]\n${summary}`),
    compacted: true,
  };

  // New history: only the single rolling summary (no stacking)
  const compactedHistory = [rollingSummaryEntry];

  // Recalculate token count
  const groundingTokens = countTokens(serializeGrounding(context.grounding));
  const historyTokens = rollingSummaryEntry.tokenCount;
  const reflectionTokens = context.reflections.reduce(
    (sum, r) => sum + countTokens(r.analysis + r.suggestedFix),
    0
  );
  const newTokenCount = groundingTokens + historyTokens + reflectionTokens;

  // Verify we achieved at least 20% reduction
  const reduction = 1 - newTokenCount / context.tokenCount;
  if (reduction < MIN_COMPACTION_REDUCTION) {
    // If we didn't achieve enough reduction, try more aggressive compaction
    // by also trimming reflections (keeping only the most recent ones)
    const recentReflections = context.reflections.slice(-3);
    const reflectionTokensNew = recentReflections.reduce(
      (sum, r) => sum + countTokens(r.analysis + r.suggestedFix),
      0
    );

    return {
      ...context,
      history: compactedHistory,
      reflections: recentReflections,
      tokenCount: groundingTokens + historyTokens + reflectionTokensNew,
    };
  }

  return {
    ...context,
    history: compactedHistory,
    tokenCount: newTokenCount,
  };
}

// ============================================================================
// Grounding Generation
// ============================================================================

/**
 * Generate grounding section text for new reasoning cycles.
 * Requirements: 5.4 - Include grounding with current state and objectives
 */
export function generateGrounding(context: AgentContext): string {
  return serializeGrounding(context.grounding);
}

/**
 * Serialize grounding section to string format.
 */
function serializeGrounding(grounding: GroundingSection): string {
  const parts: string[] = [];

  parts.push(`<grounding>`);
  parts.push(`<goal>${grounding.currentGoal}</goal>`);

  if (grounding.completedSubtasks.length > 0) {
    parts.push(`<completed_subtasks>`);
    grounding.completedSubtasks.forEach((task, i) => {
      parts.push(`  ${i + 1}. ${task}`);
    });
    parts.push(`</completed_subtasks>`);
  }

  if (grounding.keyDecisions.length > 0) {
    parts.push(`<key_decisions>`);
    grounding.keyDecisions.forEach((decision, i) => {
      parts.push(`  ${i + 1}. ${decision}`);
    });
    parts.push(`</key_decisions>`);
  }

  if (Object.keys(grounding.userPreferences).length > 0) {
    parts.push(`<user_preferences>`);
    for (const [key, value] of Object.entries(grounding.userPreferences)) {
      parts.push(`  - ${key}: ${value}`);
    }
    parts.push(`</user_preferences>`);
  }

  parts.push(`</grounding>`);

  return parts.join('\n');
}

// ============================================================================
// Context Serialization
// ============================================================================

/**
 * Serialize context for LLM prompts.
 * Combines grounding, history, and reflections into a single string.
 */
export function serializeContext(context: AgentContext): string {
  const parts: string[] = [];

  // Add grounding section
  parts.push(generateGrounding(context));

  // Add conversation history
  if (context.history.length > 0) {
    parts.push('\n<conversation_history>');
    for (const entry of context.history) {
      const label = entry.compacted ? `[${entry.type} - compacted]` : `[${entry.type}]`;
      parts.push(`${label}\n${entry.content}`);
    }
    parts.push('</conversation_history>');
  }

  // Add relevant reflections
  if (context.reflections.length > 0) {
    parts.push('\n<reflections>');
    for (const reflection of context.reflections) {
      parts.push(`[Error: ${reflection.errorType}]`);
      parts.push(`Analysis: ${reflection.analysis}`);
      parts.push(`Suggested fix: ${reflection.suggestedFix}`);
      parts.push('');
    }
    parts.push('</reflections>');
  }

  return parts.join('\n');
}

/**
 * Get a summary of context state for debugging/logging.
 */
export function getContextSummary(context: AgentContext): {
  tokenCount: number;
  maxTokens: number;
  utilization: number;
  historyEntries: number;
  compactedEntries: number;
  reflectionCount: number;
} {
  return {
    tokenCount: context.tokenCount,
    maxTokens: context.maxTokens,
    utilization: getContextUtilization(context),
    historyEntries: context.history.length,
    compactedEntries: context.history.filter((e) => e.compacted).length,
    reflectionCount: context.reflections.length,
  };
}
