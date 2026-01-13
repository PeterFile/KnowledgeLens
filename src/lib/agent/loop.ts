// Agent Loop - Core ReAct Controller
// Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 2.4, 2.6, 3.1, 3.6

import type {
  AgentConfig,
  AgentContext,
  AgentStep,
  AgentTrajectory,
  StatusCallback,
  ToolCall,
  ToolResult,
  TrajectoryLog,
  EpisodicMemory,
} from './types';
import type { LLMConfig, ChatMessage } from '../../types';
import { callLLMWithMessages } from '../api';
import {
  executeTool,
  validateToolCall,
  parseToolCall,
  formatToolsForPrompt,
  getToolSchemas,
} from './tools';
import {
  addToContext,
  createContextEntry,
  needsCompaction,
  compactContext,
  serializeContext,
  markSubtaskComplete,
} from './context';
import {
  generateReflection,
  storeReflection,
  getRelevantReflections,
  isRepeatedError,
  suggestAlternative,
  extractErrorType,
  formatReflectionsForContext,
} from './reflection';
import {
  createTrajectoryLog,
  logThought,
  logToolCall,
  logToolResult,
  logObservation,
  logReflection,
  logError,
  updateTokenUsage,
  setOptimalSteps,
} from './logger';
import { isBudgetExceeded, estimateTokens } from './tokens';
import { countTokens } from '../tokenizer';
import { getMemoryManager } from '../memory';
import type { MemoryStats } from '../memory/types';
import { buildRAGContext, buildRAGContextMessage, calculateTokenBudgets } from './rag-context';
import { indexPageAsync } from './auto-indexer';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_STEPS = 5;
const DEFAULT_MAX_RETRIES = 3;

// ============================================================================
// Safe MemoryManager Access
// Requirements: 2.1, 2.4
// ============================================================================

interface MemoryManagerSafe {
  getStats(): MemoryStats;
}

/**
 * Safely get MemoryManager with error handling.
 * Returns null on initialization failure, logs warning.
 * Requirements: 2.1, 2.4
 */
export async function getMemoryManagerSafe(): Promise<MemoryManagerSafe | null> {
  try {
    return await getMemoryManager();
  } catch (error) {
    console.warn('[AgentLoop] MemoryManager unavailable, RAG disabled:', error);
    return null;
  }
}

// ============================================================================
// Goal Achievement Detection
// Requirements: 1.5 - Determine when goal is achieved
// ============================================================================

/**
 * Check if the goal has been achieved based on the observation.
 *
 * Priority order:
 * 1. Structured XML tags (most reliable, LLM-agnostic)
 * 2. Explicit incomplete signals (to avoid false positives)
 * 3. Keyword-based heuristics (fallback for varied LLM styles)
 */
export function isGoalAchieved(observation: string, goal: string): boolean {
  // Priority 1: Check for structured status tags (most reliable)
  // This works across different LLM providers (Claude, GPT, Gemini)
  const statusMatch = observation.match(
    /<status>\s*(COMPLETED|ACHIEVED|DONE|SUCCESS)\s*<\/status>/i
  );
  if (statusMatch) {
    return true;
  }

  const incompleteStatusMatch = observation.match(
    /<status>\s*(INCOMPLETE|PENDING|CONTINUE|IN_PROGRESS)\s*<\/status>/i
  );
  if (incompleteStatusMatch) {
    return false;
  }

  const lowerObs = observation.toLowerCase();

  // Priority 2: Check for explicit "not achieved" signals (negative case)
  // Check these first to avoid false positives from partial matches
  const incompleteSignals = [
    'not yet achieved',
    'not achieved',
    'incomplete',
    'need more',
    'requires additional',
    'still need',
    'missing information',
    'insufficient',
    'continue searching',
    'try again',
    'retry',
  ];

  for (const signal of incompleteSignals) {
    if (lowerObs.includes(signal)) {
      return false;
    }
  }

  // Priority 3: Keyword-based heuristics (fallback for varied LLM styles)
  const completionSignals = [
    'goal achieved',
    'goal is achieved',
    'goal has been achieved',
    'task complete',
    'task completed',
    'successfully completed',
    'objective met',
    'objective achieved',
    'request fulfilled',
    'request has been fulfilled',
    'answer found',
    'information gathered',
    'sufficient information',
    'ready to synthesize',
    'can now provide',
    'have enough information',
    'all required information',
    // Additional patterns for different LLM styles
    'i have completed',
    'here is the answer',
    'the answer is',
    'based on the results',
  ];

  for (const signal of completionSignals) {
    if (lowerObs.includes(signal)) {
      return true;
    }
  }

  // If observation mentions the goal positively, consider it achieved
  const goalKeywords = goal
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const matchedKeywords = goalKeywords.filter((kw) => lowerObs.includes(kw));

  // If most goal keywords are mentioned with positive sentiment, likely achieved
  if (matchedKeywords.length >= goalKeywords.length * 0.5) {
    const positiveIndicators = ['found', 'obtained', 'retrieved', 'gathered', 'complete', 'done'];
    for (const indicator of positiveIndicators) {
      if (lowerObs.includes(indicator)) {
        return true;
      }
    }
  }

  return false;
}

// ============================================================================
// Termination Logic
// Requirements: 1.7 - Terminate when max steps exceeded
// ============================================================================

/**
 * Determine if the agent loop should continue or terminate.
 * Returns true if the loop should continue, false if it should stop.
 */
export function shouldContinue(trajectory: AgentTrajectory, config: AgentConfig): boolean {
  // Check if already completed or failed
  if (trajectory.status === 'completed' || trajectory.status === 'failed') {
    return false;
  }

  // Check step limit (Requirements: 1.7)
  const currentStep = trajectory.steps.length;
  if (currentStep >= config.maxSteps) {
    return false;
  }

  // Check token budget
  const totalTokens = trajectory.totalTokens.input + trajectory.totalTokens.output;
  if (totalTokens >= config.tokenBudget) {
    return false;
  }

  return true;
}

// ============================================================================
// Prompt Building
// ============================================================================

/**
 * Build the system prompt for the ReAct loop.
 */
function buildSystemPrompt(
  goal: string,
  tools: string,
  reflections: string,
  language: string = 'en'
): string {
  const langNames = { en: 'English', zh: 'Chinese', ja: 'Japanese' };
  const targetLang = langNames[language as keyof typeof langNames] || 'English';

  return `You are an AI assistant using the ReAct (Reasoning + Acting) pattern.
  
IMPORTANT: You MUST respond in ${targetLang}. All your reasoning, thoughts, and synthesis MUST be in ${targetLang}.

<goal>
${goal}
</goal>

<available_tools>
${tools}
</available_tools>

${reflections ? `<previous_failures>\n${reflections}\n</previous_failures>\n` : ''}

<instructions>
For each step, you will:
1. THINK: Analyze what needs to be done and reason about the best approach
2. ACT: Select and invoke the appropriate tool
3. OBSERVE: Analyze the result to determine if the goal is achieved

To use a tool, output a tool call in this format:
<tool_call>
<name>tool_name</name>
<parameters>{"param1": "value1"}</parameters>
<reasoning>Why this tool is appropriate</reasoning>
</tool_call>

When the goal is achieved, output:
<synthesis>
Your final response synthesizing all gathered information
</synthesis>

Always explain your reasoning before taking action.
</instructions>`;
}

/**
 * Build the user message for a reasoning step.
 */
function buildReasoningPrompt(context: string, lastResult?: ToolResult): string {
  let prompt = `<context>\n${context}\n</context>\n\n`;

  if (lastResult) {
    if (lastResult.success) {
      prompt += `<last_tool_result>\n${JSON.stringify(lastResult.data, null, 2)}\n</last_tool_result>\n\n`;
    } else {
      prompt += `<last_tool_error>\n${lastResult.error}\n</last_tool_error>\n\n`;
    }
  }

  prompt +=
    'What is your next step? Think through your reasoning, then either use a tool or provide your final synthesis.';

  return prompt;
}

/**
 * Build the observation prompt after a tool result.
 * Requests structured status output for reliable goal detection across LLM providers.
 */
function buildObservationPrompt(toolCall: ToolCall, result: ToolResult, goal: string): string {
  return `You just executed the tool "${toolCall.name}" with reasoning: "${toolCall.reasoning}"

<tool_result>
${result.success ? JSON.stringify(result.data, null, 2) : `Error: ${result.error}`}
</tool_result>

<goal>
${goal}
</goal>

Analyze this result:
1. Does this result help achieve the goal?
2. Is the goal now achieved, or do we need more steps?
3. What should we do next?

Provide your observation, then indicate the status using this exact format:
<status>COMPLETED</status> if the goal is achieved
<status>CONTINUE</status> if more steps are needed

Your observation:`;
}

// ============================================================================
// Response Parsing
// ============================================================================

interface ParsedResponse {
  thought: string;
  toolCall: ToolCall | null;
  synthesis: string | null;
}

/**
 * Parse the LLM response to extract thought, tool call, or synthesis.
 */
function parseAgentResponse(response: string): ParsedResponse {
  // Extract synthesis if present
  const synthesisMatch = response.match(/<synthesis>([\s\S]*?)<\/synthesis>/i);
  if (synthesisMatch) {
    return {
      thought: response.replace(/<synthesis>[\s\S]*?<\/synthesis>/i, '').trim(),
      toolCall: null,
      synthesis: synthesisMatch[1].trim(),
    };
  }

  // Extract tool call if present
  const toolCall = parseToolCall(response);

  // Everything before the tool call is the thought
  const thoughtEnd = response.indexOf('<tool_call>');
  const thought = thoughtEnd > 0 ? response.slice(0, thoughtEnd).trim() : response.trim();

  return {
    thought,
    toolCall,
    synthesis: null,
  };
}

// ============================================================================
// Main Agent Loop
// Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.2, 2.3, 2.6
// ============================================================================

/**
 * Run the ReAct agent loop to achieve a goal.
 *
 * Flow:
 * 1. Generate reasoning (thought) - Requirements: 1.1, 1.2
 * 2. Execute tool (action) - Requirements: 1.2
 * 3. Analyze result (observation) - Requirements: 1.3
 * 4. Check if goal achieved - Requirements: 1.4, 1.5
 * 5. Repeat or synthesize - Requirements: 1.5
 * 6. Emit status updates - Requirements: 1.6
 * 7. Respect step limits - Requirements: 1.7
 * 8. Inject RAG context when enabled - Requirements: 2.2, 2.3, 2.6
 */
export async function runAgentLoop(
  goal: string,
  context: AgentContext,
  memory: EpisodicMemory,
  config: AgentConfig,
  onStatus: StatusCallback,
  onChunk?: (chunk: string) => void,
  signal?: AbortSignal,
  pageContent?: { content: string; sourceUrl: string; title: string } // For auto-indexing
): Promise<{
  trajectory: AgentTrajectory;
  context: AgentContext;
  memory: EpisodicMemory;
  log: TrajectoryLog;
}> {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // Initialize trajectory
  let trajectory: AgentTrajectory = {
    requestId,
    goal,
    steps: [],
    status: 'running',
    totalTokens: { input: 0, output: 0 },
  };

  // Initialize trajectory log
  let log = createTrajectoryLog(requestId);

  // Working copies of context and memory
  let workingContext = context;
  let workingMemory = memory;

  // Track retries per action
  const retryCount = new Map<string, number>();

  // Get available tools
  const toolsPrompt = formatToolsForPrompt();
  const availableToolNames = getToolSchemas().map((t) => t.name);

  // ========================================================================
  // RAG Context Setup
  // Requirements: 2.2, 2.3, 2.6
  // ========================================================================
  let ragContextMessage: ChatMessage | null = null;

  // Check MemoryManager readiness and build RAG context if enabled
  const memoryManager = await getMemoryManagerSafe();
  const ragEnabled =
    config.ragConfig && memoryManager && memoryManager.getStats().embeddingModelLoaded;

  if (ragEnabled && config.ragConfig) {
    try {
      // Calculate token budgets
      // Estimate system prompt and user query tokens for budget calculation
      const systemPromptEstimate = 1500; // Approximate system prompt size
      const userQueryTokens = countTokens(goal);
      const responseReserve = 2000; // Reserve for response

      const budgets = calculateTokenBudgets(
        config.llmConfig.contextLimit ?? 128000,
        systemPromptEstimate,
        userQueryTokens,
        responseReserve,
        {
          baseBudget: config.ragConfig.knowledgeBudget,
          preferenceBudget: config.ragConfig.preferenceBudget,
        }
      );

      // Build RAG context with calculated knowledge budget
      const ragBlock = await buildRAGContext(goal, budgets.knowledgeBudget, config.ragConfig);

      // Create separate message for RAG context (NOT injected into system prompt)
      if (ragBlock.userProfile || ragBlock.relatedKnowledge) {
        ragContextMessage = buildRAGContextMessage(ragBlock);
        console.log(
          `[AgentLoop] RAG context built: ${ragBlock.totalTokens} tokens, ${ragBlock.summary}`
        );
      }
    } catch (error) {
      console.warn('[AgentLoop] Failed to build RAG context:', error);
      // Continue without RAG context
    }
  }

  // ========================================================================
  // Auto-indexing (fire-and-forget)
  // Requirements: 3.1, 3.6
  // ========================================================================
  if (config.enableAutoIndex !== false && pageContent) {
    indexPageAsync(pageContent.content, pageContent.sourceUrl, pageContent.title);
  }

  let stepNumber = 0;
  let lastToolResult: ToolResult | undefined;

  while (shouldContinue(trajectory, config)) {
    stepNumber++;

    // Check for abort signal
    if (signal?.aborted) {
      trajectory = { ...trajectory, status: 'terminated' };
      break;
    }

    // Check if context needs compaction
    if (needsCompaction(workingContext)) {
      onStatus({
        phase: 'analyzing',
        stepNumber,
        maxSteps: config.maxSteps,
        tokenUsage: trajectory.totalTokens,
        currentTool: 'context_compaction',
      });

      workingContext = await compactContext(workingContext, config.llmConfig, signal);
    }

    // Get relevant reflections for context
    const relevantReflections = lastToolResult?.error
      ? formatReflectionsForContext(
          getRelevantReflections({ name: '', parameters: {}, reasoning: '' }, workingMemory)
        )
      : '';

    // Build prompts
    const systemPrompt = buildSystemPrompt(
      goal,
      toolsPrompt,
      relevantReflections,
      config.agentSettings?.language || 'en'
    );
    const contextStr = serializeContext(workingContext);
    const userPrompt = buildReasoningPrompt(contextStr, lastToolResult);

    // ========================================================================
    // Step 1: Generate Reasoning (Thought)
    // Requirements: 1.1 - Generate explicit reasoning before selecting tool
    // ========================================================================
    onStatus({
      phase: 'thinking',
      stepNumber,
      maxSteps: config.maxSteps,
      tokenUsage: trajectory.totalTokens,
    });

    // Build messages array with RAG context as separate message
    // Requirements: 2.3 - Inject RAG context as separate assistant message
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...(ragContextMessage ? [ragContextMessage] : []),
      { role: 'user', content: userPrompt },
    ];

    let response = '';
    // State for streaming synthesis
    let insideSynthesis = false;
    let buffer = '';
    const SYNTHESIS_START = '<synthesis>';
    const SYNTHESIS_END = '</synthesis>';

    const llmResponse = await callLLMWithMessages(
      messages,
      config.llmConfig,
      (chunk) => {
        response += chunk;

        // Handle streaming synthesis if callback provided
        if (onChunk) {
          buffer += chunk;

          if (!insideSynthesis) {
            // Check if we just entered synthesis
            if (buffer.includes(SYNTHESIS_START)) {
              insideSynthesis = true;
              // Stream everything after the tag
              const tagIndex = buffer.indexOf(SYNTHESIS_START);
              const content = buffer.slice(tagIndex + SYNTHESIS_START.length);
              if (content) onChunk(content);
              buffer = ''; // Clear buffer once we're inside
            }
          } else {
            // We are inside synthesis
            if (buffer.includes(SYNTHESIS_END)) {
              // We just exited
              insideSynthesis = false;
              // Stream everything before the tag
              const tagIndex = buffer.indexOf(SYNTHESIS_END);
              const content = buffer.slice(0, tagIndex);
              if (content) onChunk(content);
              // don't really need to reset buffer here as we're done, but good practice
            } else {
              // Perform a safety check for the end tag being partially in the chunk
              // This is a simplified approach; for perfect robustness we'd need a sliding window
              // But for now, just stream the chunk
              onChunk(chunk);
              // Clear buffer to keep memory low, though strictly we might need it for exact end-tag matching logic
              // For simplicity in this iteration:
              buffer = '';
            }
          }
        }
      },
      signal
    );

    // Track token usage
    const inputTokens =
      llmResponse.usage?.promptTokens ?? estimateTokens(systemPrompt + userPrompt, 0).input;
    const outputTokens = llmResponse.usage?.completionTokens ?? countTokens(response);

    trajectory = {
      ...trajectory,
      totalTokens: {
        input: trajectory.totalTokens.input + inputTokens,
        output: trajectory.totalTokens.output + outputTokens,
      },
    };

    log = updateTokenUsage(log, { input: inputTokens, output: outputTokens });

    // Parse the response
    const parsed = parseAgentResponse(response);

    // Log the thought
    // Requirements: 1.2 - Log reasoning that led to tool selection
    const thoughtStep: AgentStep = {
      stepNumber,
      timestamp: Date.now(),
      type: 'thought',
      content: parsed.thought,
      tokenCount: countTokens(parsed.thought),
    };
    trajectory = { ...trajectory, steps: [...trajectory.steps, thoughtStep] };
    log = logThought(log, stepNumber, parsed.thought);

    // Add thought to context
    workingContext = addToContext(workingContext, createContextEntry('assistant', parsed.thought));

    // ========================================================================
    // Check for Synthesis (Goal Achieved)
    // Requirements: 1.5 - Generate final synthesis when goal achieved
    // ========================================================================
    if (parsed.synthesis) {
      const synthesisStep: AgentStep = {
        stepNumber,
        timestamp: Date.now(),
        type: 'synthesis',
        content: parsed.synthesis,
        tokenCount: countTokens(parsed.synthesis),
      };
      trajectory = {
        ...trajectory,
        steps: [...trajectory.steps, synthesisStep],
        status: 'completed',
      };

      onStatus({
        phase: 'synthesizing',
        stepNumber,
        maxSteps: config.maxSteps,
        tokenUsage: trajectory.totalTokens,
      });

      break;
    }

    // ========================================================================
    // Step 2: Execute Tool (Action)
    // Requirements: 1.2 - Select and invoke tool
    // ========================================================================
    if (parsed.toolCall) {
      onStatus({
        phase: 'executing',
        stepNumber,
        maxSteps: config.maxSteps,
        tokenUsage: trajectory.totalTokens,
        currentTool: parsed.toolCall.name,
      });

      // Validate tool call
      const validation = validateToolCall(parsed.toolCall);
      let toolResult: ToolResult;

      if (!validation.valid) {
        toolResult = {
          success: false,
          error: `Validation failed: ${validation.errors?.join('; ')}`,
          tokenCount: 0,
        };
      } else {
        // Execute the tool
        toolResult = await executeTool(parsed.toolCall, signal);
      }

      // Log tool call and result
      const actionStep: AgentStep = {
        stepNumber,
        timestamp: Date.now(),
        type: 'action',
        content: `Tool: ${parsed.toolCall.name}`,
        toolCall: parsed.toolCall,
        toolResult,
        tokenCount: toolResult.tokenCount,
      };
      trajectory = { ...trajectory, steps: [...trajectory.steps, actionStep] };
      log = logToolCall(log, stepNumber, parsed.toolCall);
      log = logToolResult(log, stepNumber, toolResult);

      // Add tool result to context
      const toolResultContent = toolResult.success
        ? `Tool ${parsed.toolCall.name} succeeded: ${JSON.stringify(toolResult.data)}`
        : `Tool ${parsed.toolCall.name} failed: ${toolResult.error}`;
      workingContext = addToContext(workingContext, createContextEntry('tool', toolResultContent));

      // ======================================================================
      // Handle Tool Failure - Reflection Pattern
      // Requirements: 3.1, 3.2, 3.3, 3.4
      // ======================================================================
      if (!toolResult.success) {
        const errorType = extractErrorType(toolResult.error ?? 'Unknown error', parsed.toolCall);
        const actionKey = `${parsed.toolCall.name}:${JSON.stringify(parsed.toolCall.parameters)}`;
        const currentRetries = retryCount.get(actionKey) ?? 0;

        // Check if this is a repeated error
        if (isRepeatedError(errorType, workingMemory)) {
          // Requirements: 3.4 - Escalate by trying alternative approach
          onStatus({
            phase: 'reflecting',
            stepNumber,
            maxSteps: config.maxSteps,
            tokenUsage: trajectory.totalTokens,
          });

          const alternative = await suggestAlternative(
            parsed.toolCall,
            workingMemory,
            config.llmConfig,
            availableToolNames,
            signal
          );

          // Log the escalation
          log = logReflection(
            log,
            stepNumber,
            `Repeated error detected. Suggesting alternative: ${alternative.name}`,
            'repeated_error'
          );

          // Update retry count for the alternative
          retryCount.set(actionKey, currentRetries + 1);
        } else if (currentRetries < config.maxRetries) {
          // Generate reflection for the failure
          // Requirements: 3.1 - Prompt LLM to analyze failure
          onStatus({
            phase: 'reflecting',
            stepNumber,
            maxSteps: config.maxSteps,
            tokenUsage: trajectory.totalTokens,
          });

          const reflection = await generateReflection(
            parsed.toolCall,
            toolResult.error ?? 'Unknown error',
            workingContext,
            config.llmConfig,
            signal
          );

          // Requirements: 3.2 - Store reflection in episodic memory
          workingMemory = storeReflection(workingMemory, reflection);

          // Log the reflection
          const reflectionStep: AgentStep = {
            stepNumber,
            timestamp: Date.now(),
            type: 'reflection',
            content: `${reflection.analysis}\nSuggested fix: ${reflection.suggestedFix}`,
            tokenCount: countTokens(reflection.analysis + reflection.suggestedFix),
          };
          trajectory = { ...trajectory, steps: [...trajectory.steps, reflectionStep] };
          log = logReflection(log, stepNumber, reflection.analysis, 'tool_failure');

          retryCount.set(actionKey, currentRetries + 1);
        } else {
          // Max retries reached - log error and continue
          // Requirements: 3.5 - Present best partial result
          log = logError(
            log,
            stepNumber,
            `Max retries (${config.maxRetries}) reached for action: ${parsed.toolCall.name}`
          );
        }
      }

      lastToolResult = toolResult;

      // ======================================================================
      // Step 3: Generate Observation
      // Requirements: 1.3 - Analyze whether result meets goal
      // ======================================================================
      onStatus({
        phase: 'analyzing',
        stepNumber,
        maxSteps: config.maxSteps,
        tokenUsage: trajectory.totalTokens,
      });

      const observationPrompt = buildObservationPrompt(parsed.toolCall, toolResult, goal);
      const observationMessages: ChatMessage[] = [
        {
          role: 'system',
          content: 'You are analyzing tool results to determine if the goal is achieved.',
        },
        { role: 'user', content: observationPrompt },
      ];

      let observation = '';
      const obsResponse = await callLLMWithMessages(
        observationMessages,
        config.llmConfig,
        (chunk) => {
          observation += chunk;
        },
        signal
      );

      // Track observation tokens
      const obsInputTokens =
        obsResponse.usage?.promptTokens ?? estimateTokens(observationPrompt, 0).input;
      const obsOutputTokens = obsResponse.usage?.completionTokens ?? countTokens(observation);

      trajectory = {
        ...trajectory,
        totalTokens: {
          input: trajectory.totalTokens.input + obsInputTokens,
          output: trajectory.totalTokens.output + obsOutputTokens,
        },
      };

      log = updateTokenUsage(log, { input: obsInputTokens, output: obsOutputTokens });

      // Log observation
      const observationStep: AgentStep = {
        stepNumber,
        timestamp: Date.now(),
        type: 'observation',
        content: observation,
        tokenCount: countTokens(observation),
      };
      trajectory = { ...trajectory, steps: [...trajectory.steps, observationStep] };
      log = logObservation(log, stepNumber, observation);

      // Add observation to context
      workingContext = addToContext(workingContext, createContextEntry('observation', observation));

      // Check if goal is achieved based on observation
      // Requirements: 1.4 - Continue loop if incomplete
      if (isGoalAchieved(observation, goal)) {
        // Mark subtask complete and prepare for synthesis
        workingContext = markSubtaskComplete(workingContext, `Achieved: ${goal}`);
        trajectory = { ...trajectory, status: 'completed' };

        onStatus({
          phase: 'synthesizing',
          stepNumber,
          maxSteps: config.maxSteps,
          tokenUsage: trajectory.totalTokens,
        });

        break;
      }
    } else {
      // No tool call and no synthesis - this shouldn't happen normally
      // Log as an error and continue
      log = logError(log, stepNumber, 'No tool call or synthesis in response');
    }

    // Check token budget
    if (
      isBudgetExceeded({
        sessionTotal: trajectory.totalTokens,
        currentOperation: trajectory.totalTokens,
        budget: config.tokenBudget,
        warningThreshold: config.tokenBudget * 0.8,
      })
    ) {
      trajectory = { ...trajectory, status: 'terminated' };
      log = logError(log, stepNumber, 'Token budget exceeded');
      break;
    }
  }

  // If we exited the loop without completing, mark as terminated
  // Requirements: 1.7 - Return best available result with explanation
  if (trajectory.status === 'running') {
    trajectory = { ...trajectory, status: 'terminated' };
    log = logError(
      log,
      stepNumber,
      `Loop terminated after ${stepNumber} steps (max: ${config.maxSteps})`
    );
  }

  // Calculate efficiency
  // Optimal steps is estimated as 1 (direct answer) to 3 (search + analyze + synthesize)
  const optimalSteps = Math.min(
    3,
    Math.ceil(trajectory.steps.filter((s) => s.type === 'action').length / 2) + 1
  );
  log = setOptimalSteps(log, optimalSteps);
  trajectory = { ...trajectory, efficiency: optimalSteps / Math.max(1, stepNumber) };

  return {
    trajectory,
    context: workingContext,
    memory: workingMemory,
    log,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a default agent configuration.
 */
export function createAgentConfig(
  llmConfig: LLMConfig,
  overrides?: Partial<AgentConfig>
): AgentConfig {
  return {
    maxSteps: DEFAULT_MAX_STEPS,
    maxRetries: DEFAULT_MAX_RETRIES,
    tokenBudget: 100000,
    llmConfig,
    ...overrides,
  };
}

/**
 * Get the final response from a trajectory.
 * Returns the synthesis if completed, or the best partial result if terminated.
 */
export function getFinalResponse(trajectory: AgentTrajectory): string {
  // Look for synthesis step
  const synthesisStep = trajectory.steps.find((s) => s.type === 'synthesis');
  if (synthesisStep) {
    return synthesisStep.content;
  }

  // If terminated, compile best partial result from observations
  const observations = trajectory.steps.filter((s) => s.type === 'observation');
  if (observations.length > 0) {
    const lastObs = observations[observations.length - 1];
    return `[Partial Result - ${trajectory.status}]\n\n${lastObs.content}`;
  }

  // Fallback to last thought
  const thoughts = trajectory.steps.filter((s) => s.type === 'thought');
  if (thoughts.length > 0) {
    const lastThought = thoughts[thoughts.length - 1];
    return `[Incomplete - ${trajectory.status}]\n\n${lastThought.content}`;
  }

  return `[No result - ${trajectory.status}]`;
}
