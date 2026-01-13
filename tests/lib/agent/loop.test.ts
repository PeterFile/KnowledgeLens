// Tests for Agent Loop - Core ReAct Controller
// Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isGoalAchieved,
  shouldContinue,
  runAgentLoop,
  createAgentConfig,
  getFinalResponse,
} from '../../../src/lib/agent/loop';
import { createContext } from '../../../src/lib/agent/context';
import { createEpisodicMemory } from '../../../src/lib/agent/reflection';
import { registerTool, clearToolRegistry } from '../../../src/lib/agent/tools';
import type {
  AgentTrajectory,
  AgentConfig,
  AgentStatus,
  ToolSchema,
  ToolHandler,
} from '../../../src/lib/agent/types';
import type { LLMConfig } from '../../../src/types';

// Mock the API module
vi.mock('../../../src/lib/api', () => ({
  callLLMWithMessages: vi.fn(),
}));

import { callLLMWithMessages } from '../../../src/lib/api';

const mockCallLLM = vi.mocked(callLLMWithMessages);

// ============================================================================
// Test Fixtures
// ============================================================================

const mockLLMConfig: LLMConfig = {
  provider: 'openai',
  apiKey: 'test-key',
  model: 'gpt-4o',
};

function createTestConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  return createAgentConfig(mockLLMConfig, overrides);
}

// Simple test tool
const testToolSchema: ToolSchema = {
  name: 'test_tool',
  description: 'A test tool for unit testing',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Test query' },
    },
    required: ['query'],
  },
  examples: [{ input: { query: 'test' }, description: 'Test example' }],
};

const testToolHandler: ToolHandler = async (params) => ({
  success: true,
  data: { result: `Processed: ${params.query}` },
  tokenCount: 10,
});

// ============================================================================
// isGoalAchieved Tests
// ============================================================================

describe('isGoalAchieved', () => {
  describe('structured status tags (highest priority)', () => {
    it('returns true for <status>COMPLETED</status> tag', () => {
      expect(isGoalAchieved('Analysis complete. <status>COMPLETED</status>', 'any goal')).toBe(
        true
      );
    });

    it('returns true for <status>ACHIEVED</status> tag', () => {
      expect(isGoalAchieved('Task done. <status>ACHIEVED</status>', 'any goal')).toBe(true);
    });

    it('returns true for <status>DONE</status> tag', () => {
      expect(isGoalAchieved('<status>DONE</status>', 'any goal')).toBe(true);
    });

    it('returns true for <status>SUCCESS</status> tag', () => {
      expect(isGoalAchieved('Result: <status>SUCCESS</status>', 'any goal')).toBe(true);
    });

    it('returns false for <status>INCOMPLETE</status> tag', () => {
      expect(isGoalAchieved('Need more data. <status>INCOMPLETE</status>', 'any goal')).toBe(false);
    });

    it('returns false for <status>CONTINUE</status> tag', () => {
      expect(isGoalAchieved('<status>CONTINUE</status>', 'any goal')).toBe(false);
    });

    it('handles case-insensitive status tags', () => {
      expect(isGoalAchieved('<status>completed</status>', 'any goal')).toBe(true);
      expect(isGoalAchieved('<STATUS>COMPLETED</STATUS>', 'any goal')).toBe(true);
    });

    it('handles whitespace in status tags', () => {
      expect(isGoalAchieved('<status> COMPLETED </status>', 'any goal')).toBe(true);
    });
  });

  describe('completion signals (fallback)', () => {
    it('returns true for explicit "goal achieved" signal', () => {
      expect(isGoalAchieved('The goal achieved successfully.', 'find information')).toBe(true);
    });

    it('returns true for "task complete" signal', () => {
      expect(isGoalAchieved('Task complete. All information gathered.', 'gather data')).toBe(true);
    });

    it('returns true for "successfully completed" signal', () => {
      expect(isGoalAchieved('The request was successfully completed.', 'process request')).toBe(
        true
      );
    });

    it('returns true for "sufficient information" signal', () => {
      expect(isGoalAchieved('We have sufficient information to answer.', 'answer question')).toBe(
        true
      );
    });

    it('returns true for "ready to synthesize" signal', () => {
      expect(isGoalAchieved('Ready to synthesize the final response.', 'create summary')).toBe(
        true
      );
    });

    it('returns true for "i have completed" (Claude-style)', () => {
      expect(isGoalAchieved('I have completed the analysis.', 'analyze data')).toBe(true);
    });

    it('returns true for "here is the answer" (Gemini-style)', () => {
      expect(isGoalAchieved('Here is the answer to your question.', 'answer question')).toBe(true);
    });
  });

  describe('incomplete signals', () => {
    it('returns false for "not yet achieved" signal', () => {
      expect(isGoalAchieved('Goal not yet achieved, need more data.', 'find data')).toBe(false);
    });

    it('returns false for "need more" signal', () => {
      expect(isGoalAchieved('We need more information to proceed.', 'gather info')).toBe(false);
    });

    it('returns false for "continue searching" signal', () => {
      expect(isGoalAchieved('Should continue searching for results.', 'search')).toBe(false);
    });

    it('returns false for "missing information" signal', () => {
      expect(isGoalAchieved('There is missing information in the results.', 'complete task')).toBe(
        false
      );
    });
  });

  describe('keyword matching with positive indicators', () => {
    it('returns true when goal keywords found with "found" indicator', () => {
      expect(
        isGoalAchieved('Information about quantum physics was found.', 'find quantum physics info')
      ).toBe(true);
    });

    it('returns true when goal keywords found with "obtained" indicator', () => {
      expect(isGoalAchieved('The user data was obtained successfully.', 'get user data')).toBe(
        true
      );
    });

    it('returns false when goal keywords present but no positive indicator', () => {
      expect(
        isGoalAchieved('Looking at quantum physics topics.', 'find quantum physics info')
      ).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('returns false for empty observation', () => {
      expect(isGoalAchieved('', 'any goal')).toBe(false);
    });

    it('handles case-insensitive matching', () => {
      expect(isGoalAchieved('GOAL ACHIEVED!', 'test')).toBe(true);
      expect(isGoalAchieved('Task Complete', 'test')).toBe(true);
    });
  });
});

// ============================================================================
// shouldContinue Tests
// ============================================================================

describe('shouldContinue', () => {
  const baseTrajectory: AgentTrajectory = {
    requestId: 'test-123',
    goal: 'test goal',
    steps: [],
    status: 'running',
    totalTokens: { input: 0, output: 0 },
  };

  const baseConfig = createTestConfig();

  describe('status checks', () => {
    it('returns false when status is completed', () => {
      const trajectory = { ...baseTrajectory, status: 'completed' as const };
      expect(shouldContinue(trajectory, baseConfig)).toBe(false);
    });

    it('returns false when status is failed', () => {
      const trajectory = { ...baseTrajectory, status: 'failed' as const };
      expect(shouldContinue(trajectory, baseConfig)).toBe(false);
    });

    it('returns true when status is running and within limits', () => {
      expect(shouldContinue(baseTrajectory, baseConfig)).toBe(true);
    });
  });

  describe('step limit checks', () => {
    it('returns false when steps equal maxSteps', () => {
      const trajectory = {
        ...baseTrajectory,
        steps: Array(5).fill({
          stepNumber: 1,
          timestamp: Date.now(),
          type: 'thought' as const,
          content: '',
          tokenCount: 0,
        }),
      };
      const config = createTestConfig({ maxSteps: 5 });
      expect(shouldContinue(trajectory, config)).toBe(false);
    });

    it('returns false when steps exceed maxSteps', () => {
      const trajectory = {
        ...baseTrajectory,
        steps: Array(6).fill({
          stepNumber: 1,
          timestamp: Date.now(),
          type: 'thought' as const,
          content: '',
          tokenCount: 0,
        }),
      };
      const config = createTestConfig({ maxSteps: 5 });
      expect(shouldContinue(trajectory, config)).toBe(false);
    });

    it('returns true when steps below maxSteps', () => {
      const trajectory = {
        ...baseTrajectory,
        steps: Array(3).fill({
          stepNumber: 1,
          timestamp: Date.now(),
          type: 'thought' as const,
          content: '',
          tokenCount: 0,
        }),
      };
      const config = createTestConfig({ maxSteps: 5 });
      expect(shouldContinue(trajectory, config)).toBe(true);
    });
  });

  describe('token budget checks', () => {
    it('returns false when tokens exceed budget', () => {
      const trajectory = {
        ...baseTrajectory,
        totalTokens: { input: 60000, output: 50000 },
      };
      const config = createTestConfig({ tokenBudget: 100000 });
      expect(shouldContinue(trajectory, config)).toBe(false);
    });

    it('returns true when tokens within budget', () => {
      const trajectory = {
        ...baseTrajectory,
        totalTokens: { input: 30000, output: 20000 },
      };
      const config = createTestConfig({ tokenBudget: 100000 });
      expect(shouldContinue(trajectory, config)).toBe(true);
    });
  });
});

// ============================================================================
// createAgentConfig Tests
// ============================================================================

describe('createAgentConfig', () => {
  it('creates config with default values', () => {
    const config = createAgentConfig(mockLLMConfig);
    expect(config.maxSteps).toBe(5);
    expect(config.maxRetries).toBe(3);
    expect(config.tokenBudget).toBe(100000);
    expect(config.llmConfig).toBe(mockLLMConfig);
  });

  it('allows overriding default values', () => {
    const config = createAgentConfig(mockLLMConfig, {
      maxSteps: 10,
      maxRetries: 5,
      tokenBudget: 200000,
    });
    expect(config.maxSteps).toBe(10);
    expect(config.maxRetries).toBe(5);
    expect(config.tokenBudget).toBe(200000);
  });
});

// ============================================================================
// getFinalResponse Tests
// ============================================================================

describe('getFinalResponse', () => {
  it('returns synthesis content when available', () => {
    const trajectory: AgentTrajectory = {
      requestId: 'test',
      goal: 'test',
      steps: [
        {
          stepNumber: 1,
          timestamp: Date.now(),
          type: 'thought',
          content: 'thinking...',
          tokenCount: 5,
        },
        {
          stepNumber: 1,
          timestamp: Date.now(),
          type: 'synthesis',
          content: 'Final answer here',
          tokenCount: 10,
        },
      ],
      status: 'completed',
      totalTokens: { input: 100, output: 50 },
    };

    expect(getFinalResponse(trajectory)).toBe('Final answer here');
  });

  it('returns last observation when terminated without synthesis', () => {
    const trajectory: AgentTrajectory = {
      requestId: 'test',
      goal: 'test',
      steps: [
        {
          stepNumber: 1,
          timestamp: Date.now(),
          type: 'thought',
          content: 'thinking...',
          tokenCount: 5,
        },
        {
          stepNumber: 1,
          timestamp: Date.now(),
          type: 'observation',
          content: 'Observed result',
          tokenCount: 10,
        },
      ],
      status: 'terminated',
      totalTokens: { input: 100, output: 50 },
    };

    const response = getFinalResponse(trajectory);
    expect(response).toContain('Partial Result');
    expect(response).toContain('Observed result');
  });

  it('returns last thought when no observations', () => {
    const trajectory: AgentTrajectory = {
      requestId: 'test',
      goal: 'test',
      steps: [
        {
          stepNumber: 1,
          timestamp: Date.now(),
          type: 'thought',
          content: 'My thoughts',
          tokenCount: 5,
        },
      ],
      status: 'terminated',
      totalTokens: { input: 100, output: 50 },
    };

    const response = getFinalResponse(trajectory);
    expect(response).toContain('Incomplete');
    expect(response).toContain('My thoughts');
  });

  it('returns no result message when no steps', () => {
    const trajectory: AgentTrajectory = {
      requestId: 'test',
      goal: 'test',
      steps: [],
      status: 'failed',
      totalTokens: { input: 0, output: 0 },
    };

    expect(getFinalResponse(trajectory)).toContain('No result');
  });
});

// ============================================================================
// runAgentLoop Integration Tests
// ============================================================================

describe('runAgentLoop', () => {
  beforeEach(() => {
    clearToolRegistry();
    registerTool(testToolSchema, testToolHandler);
    mockCallLLM.mockReset();
  });

  afterEach(() => {
    clearToolRegistry();
  });

  it('emits status updates during execution', async () => {
    const statusUpdates: AgentStatus[] = [];
    const onStatus = (status: AgentStatus) => statusUpdates.push(status);

    // Mock LLM to return synthesis immediately
    mockCallLLM.mockImplementation(async (_messages, _config, onToken) => {
      const response = 'Thinking about the goal.\n<synthesis>Here is the answer.</synthesis>';
      onToken(response);
      return { content: response, usage: { promptTokens: 100, completionTokens: 50 } };
    });

    const context = createContext('test goal', 128000);
    const memory = createEpisodicMemory('test-session');
    const config = createTestConfig();

    await runAgentLoop('test goal', context, memory, config, onStatus);

    // Should have at least one status update
    expect(statusUpdates.length).toBeGreaterThan(0);
    // First status should be 'thinking'
    expect(statusUpdates[0].phase).toBe('thinking');
  });

  it('completes when synthesis is provided', async () => {
    mockCallLLM.mockImplementation(async (_messages, _config, onToken) => {
      const response = 'I have analyzed the request.\n<synthesis>The answer is 42.</synthesis>';
      onToken(response);
      return { content: response, usage: { promptTokens: 100, completionTokens: 50 } };
    });

    const context = createContext('find the answer', 128000);
    const memory = createEpisodicMemory('test-session');
    const config = createTestConfig();

    const result = await runAgentLoop('find the answer', context, memory, config, () => {});

    expect(result.trajectory.status).toBe('completed');
    expect(result.trajectory.steps.some((s) => s.type === 'synthesis')).toBe(true);
  });

  it('terminates when max steps exceeded', async () => {
    let callCount = 0;
    mockCallLLM.mockImplementation(async (_messages, _config, onToken) => {
      callCount++;
      // Always return a tool call, never synthesis
      const response = `Step ${callCount}: Need more info.\n<tool_call>\n<name>test_tool</name>\n<parameters>{"query": "test"}</parameters>\n<reasoning>Testing</reasoning>\n</tool_call>`;
      onToken(response);
      return { content: response, usage: { promptTokens: 100, completionTokens: 50 } };
    });

    const context = createContext('endless task', 128000);
    const memory = createEpisodicMemory('test-session');
    const config = createTestConfig({ maxSteps: 2 });

    const result = await runAgentLoop('endless task', context, memory, config, () => {});

    expect(result.trajectory.status).toBe('terminated');
  });

  it('respects abort signal', async () => {
    const controller = new AbortController();

    // Abort before the loop starts
    controller.abort();

    mockCallLLM.mockImplementation(async (_messages, _config, onToken) => {
      const response = 'Thinking...';
      onToken(response);
      return { content: response, usage: { promptTokens: 100, completionTokens: 50 } };
    });

    const context = createContext('test', 128000);
    const memory = createEpisodicMemory('test-session');
    const config = createTestConfig();

    const result = await runAgentLoop('test', context, memory, config, () => {}, controller.signal);

    expect(result.trajectory.status).toBe('terminated');
  });

  it('tracks token usage across steps', async () => {
    let callCount = 0;
    mockCallLLM.mockImplementation(async (_messages, _config, onToken) => {
      callCount++;
      if (callCount === 1) {
        const response =
          'Thinking.\n<tool_call>\n<name>test_tool</name>\n<parameters>{"query": "test"}</parameters>\n<reasoning>Need data</reasoning>\n</tool_call>';
        onToken(response);
        return { content: response, usage: { promptTokens: 100, completionTokens: 50 } };
      } else if (callCount === 2) {
        // Observation response
        const response = 'Goal achieved. The data was found successfully.';
        onToken(response);
        return { content: response, usage: { promptTokens: 80, completionTokens: 30 } };
      } else {
        const response = '<synthesis>Final answer based on data.</synthesis>';
        onToken(response);
        return { content: response, usage: { promptTokens: 90, completionTokens: 40 } };
      }
    });

    const context = createContext('find data', 128000);
    const memory = createEpisodicMemory('test-session');
    const config = createTestConfig();

    const result = await runAgentLoop('find data', context, memory, config, () => {});

    // Should have accumulated tokens from multiple LLM calls
    expect(result.trajectory.totalTokens.input).toBeGreaterThan(0);
    expect(result.trajectory.totalTokens.output).toBeGreaterThan(0);
  });
});

// ============================================================================
// Property-Based Tests
// ============================================================================

import * as fc from 'fast-check';

/**
 * **Feature: agent-architecture-upgrade, Property 1: Bounded Execution**
 * **Validates: Requirements 1.7, 3.5**
 *
 * Property: For any agent execution, the number of steps SHALL NOT exceed
 * the configured maxSteps limit, ensuring bounded execution time and cost.
 */
describe('Property 1: Bounded Execution', () => {
  beforeEach(() => {
    clearToolRegistry();
    registerTool(testToolSchema, testToolHandler);
    mockCallLLM.mockReset();
  });

  afterEach(() => {
    clearToolRegistry();
  });

  // Arbitrary for generating valid maxSteps configurations
  const maxStepsArb = fc.integer({ min: 1, max: 10 });

  // Arbitrary for generating goals
  const goalArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]{4,49}$/);

  it('agent never exceeds maxSteps limit', async () => {
    await fc.assert(
      fc.asyncProperty(maxStepsArb, goalArb, async (maxSteps, goal) => {
        // Mock LLM to always return tool calls (never synthesis)
        // This forces the loop to continue until maxSteps is reached
        let callCount = 0;
        mockCallLLM.mockImplementation(async (_messages, _config, onToken) => {
          callCount++;
          const response = `Step ${callCount}: Need more info.\n<tool_call>\n<name>test_tool</name>\n<parameters>{"query": "test"}</parameters>\n<reasoning>Testing</reasoning>\n</tool_call>`;
          onToken(response);
          return { content: response, usage: { promptTokens: 50, completionTokens: 30 } };
        });

        const context = createContext(goal, 128000);
        const memory = createEpisodicMemory('test-session');
        const config = createTestConfig({ maxSteps });

        const result = await runAgentLoop(goal, context, memory, config, () => {});

        // Property: Number of reasoning steps should not exceed maxSteps
        const thoughtSteps = result.trajectory.steps.filter((s) => s.type === 'thought');
        expect(thoughtSteps.length).toBeLessThanOrEqual(maxSteps);
      }),
      { numRuns: 20 }
    );
  });

  it('agent terminates with status terminated when maxSteps reached', async () => {
    await fc.assert(
      fc.asyncProperty(maxStepsArb, goalArb, async (maxSteps, goal) => {
        // Mock LLM to never complete (always return tool calls)
        mockCallLLM.mockImplementation(async (_messages, _config, onToken) => {
          const response = `Thinking.\n<tool_call>\n<name>test_tool</name>\n<parameters>{"query": "test"}</parameters>\n<reasoning>Need data</reasoning>\n</tool_call>`;
          onToken(response);
          return { content: response, usage: { promptTokens: 50, completionTokens: 30 } };
        });

        const context = createContext(goal, 128000);
        const memory = createEpisodicMemory('test-session');
        const config = createTestConfig({ maxSteps });

        const result = await runAgentLoop(goal, context, memory, config, () => {});

        // Property: Status should be 'terminated' when maxSteps is reached without completion
        expect(result.trajectory.status).toBe('terminated');
      }),
      { numRuns: 20 }
    );
  });

  it('agent respects token budget as termination condition', async () => {
    // Each LLM call consumes 150 tokens (100 input + 50 output)
    // Each step has: reasoning call (150) + observation call (150) = 300 tokens per step
    // Budget check happens at end of step, so one extra step may complete
    const tokensPerStep = 300;

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 500, max: 2000 }), // Budget that allows 1-6 steps
        goalArb,
        async (tokenBudget, goal) => {
          // Mock LLM to return responses that consume tokens
          mockCallLLM.mockImplementation(async (_messages, _config, onToken) => {
            const response = `Thinking about the problem.\n<tool_call>\n<name>test_tool</name>\n<parameters>{"query": "test"}</parameters>\n<reasoning>Need data</reasoning>\n</tool_call>`;
            onToken(response);
            return { content: response, usage: { promptTokens: 100, completionTokens: 50 } };
          });

          const context = createContext(goal, 128000);
          const memory = createEpisodicMemory('test-session');
          const config = createTestConfig({ maxSteps: 100, tokenBudget });

          const result = await runAgentLoop(goal, context, memory, config, () => {});

          // Property: Agent should terminate, and total tokens should be bounded
          // The step that exceeds budget will complete, so allow up to one extra step
          const totalTokens =
            result.trajectory.totalTokens.input + result.trajectory.totalTokens.output;
          expect(totalTokens).toBeLessThanOrEqual(tokenBudget + tokensPerStep);
          expect(result.trajectory.status).toBe('terminated');
        }
      ),
      { numRuns: 20 }
    );
  });
});

/**
 * **Feature: agent-architecture-upgrade, Property 2: Reasoning Before Action**
 * **Validates: Requirements 1.1, 1.2**
 *
 * Property: For any tool invocation in the agent trajectory, there SHALL be
 * a preceding thought step that contains reasoning about why that tool was selected.
 */
describe('Property 2: Reasoning Before Action', () => {
  beforeEach(() => {
    clearToolRegistry();
    registerTool(testToolSchema, testToolHandler);
    mockCallLLM.mockReset();
  });

  afterEach(() => {
    clearToolRegistry();
  });

  const goalArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]{4,49}$/);

  it('every action step is preceded by a thought step', async () => {
    await fc.assert(
      fc.asyncProperty(goalArb, async (goal) => {
        let callCount = 0;
        mockCallLLM.mockImplementation(async (_messages, _config, onToken) => {
          callCount++;
          if (callCount <= 2) {
            // First calls: return tool call with reasoning
            const response = `I need to search for information about ${goal}.\n<tool_call>\n<name>test_tool</name>\n<parameters>{"query": "${goal}"}</parameters>\n<reasoning>This will help gather data</reasoning>\n</tool_call>`;
            onToken(response);
            return { content: response, usage: { promptTokens: 50, completionTokens: 30 } };
          } else if (callCount === 3) {
            // Observation response
            const response = 'Goal achieved. The data was found successfully.';
            onToken(response);
            return { content: response, usage: { promptTokens: 40, completionTokens: 20 } };
          } else {
            // Final synthesis
            const response = '<synthesis>Here is the answer based on the data.</synthesis>';
            onToken(response);
            return { content: response, usage: { promptTokens: 40, completionTokens: 20 } };
          }
        });

        const context = createContext(goal, 128000);
        const memory = createEpisodicMemory('test-session');
        const config = createTestConfig({ maxSteps: 5 });

        const result = await runAgentLoop(goal, context, memory, config, () => {});

        // Property: Every action step must be preceded by a thought step
        const steps = result.trajectory.steps;
        for (let i = 0; i < steps.length; i++) {
          if (steps[i].type === 'action') {
            // Find the most recent thought before this action
            let foundThought = false;
            for (let j = i - 1; j >= 0; j--) {
              if (steps[j].type === 'thought') {
                foundThought = true;
                // The thought should contain some reasoning content
                expect(steps[j].content.length).toBeGreaterThan(0);
                break;
              }
            }
            expect(foundThought).toBe(true);
          }
        }
      }),
      { numRuns: 20 }
    );
  });

  it('thought step contains reasoning about tool selection', async () => {
    await fc.assert(
      fc.asyncProperty(goalArb, async (goal) => {
        let callCount = 0;
        mockCallLLM.mockImplementation(async (_messages, _config, onToken) => {
          callCount++;
          if (callCount === 1) {
            const response = `Analyzing the request: ${goal}. I will use test_tool to gather information.\n<tool_call>\n<name>test_tool</name>\n<parameters>{"query": "data"}</parameters>\n<reasoning>Need to fetch relevant data</reasoning>\n</tool_call>`;
            onToken(response);
            return { content: response, usage: { promptTokens: 50, completionTokens: 30 } };
          } else if (callCount === 2) {
            const response = 'Goal achieved. <status>COMPLETED</status>';
            onToken(response);
            return { content: response, usage: { promptTokens: 40, completionTokens: 20 } };
          } else {
            const response = '<synthesis>Final answer.</synthesis>';
            onToken(response);
            return { content: response, usage: { promptTokens: 40, completionTokens: 20 } };
          }
        });

        const context = createContext(goal, 128000);
        const memory = createEpisodicMemory('test-session');
        const config = createTestConfig({ maxSteps: 5 });

        const result = await runAgentLoop(goal, context, memory, config, () => {});

        // Property: Thought steps should contain non-trivial reasoning
        const thoughtSteps = result.trajectory.steps.filter((s) => s.type === 'thought');
        for (const thought of thoughtSteps) {
          // Thought should have meaningful content (more than just whitespace)
          expect(thought.content.trim().length).toBeGreaterThan(5);
        }
      }),
      { numRuns: 20 }
    );
  });
});

/**
 * **Feature: agent-architecture-upgrade, Property 3: Observation After Action**
 * **Validates: Requirements 1.3**
 *
 * Property: For any tool execution in the agent trajectory, there SHALL be
 * a subsequent observation step that analyzes whether the result meets the goal.
 */
describe('Property 3: Observation After Action', () => {
  beforeEach(() => {
    clearToolRegistry();
    registerTool(testToolSchema, testToolHandler);
    mockCallLLM.mockReset();
  });

  afterEach(() => {
    clearToolRegistry();
  });

  const goalArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]{4,49}$/);

  it('every action step is followed by an observation step', async () => {
    await fc.assert(
      fc.asyncProperty(goalArb, async (goal) => {
        let callCount = 0;
        mockCallLLM.mockImplementation(async (_messages, _config, onToken) => {
          callCount++;
          if (callCount === 1) {
            const response = `Thinking about ${goal}.\n<tool_call>\n<name>test_tool</name>\n<parameters>{"query": "test"}</parameters>\n<reasoning>Need data</reasoning>\n</tool_call>`;
            onToken(response);
            return { content: response, usage: { promptTokens: 50, completionTokens: 30 } };
          } else if (callCount === 2) {
            // Observation response
            const response = `The tool returned useful data. Goal achieved. <status>COMPLETED</status>`;
            onToken(response);
            return { content: response, usage: { promptTokens: 40, completionTokens: 20 } };
          } else {
            const response = '<synthesis>Here is the final answer.</synthesis>';
            onToken(response);
            return { content: response, usage: { promptTokens: 40, completionTokens: 20 } };
          }
        });

        const context = createContext(goal, 128000);
        const memory = createEpisodicMemory('test-session');
        const config = createTestConfig({ maxSteps: 5 });

        const result = await runAgentLoop(goal, context, memory, config, () => {});

        // Property: Every action step must be followed by an observation step
        const steps = result.trajectory.steps;
        for (let i = 0; i < steps.length; i++) {
          if (steps[i].type === 'action') {
            // Find the next observation after this action
            let foundObservation = false;
            for (let j = i + 1; j < steps.length; j++) {
              if (steps[j].type === 'observation') {
                foundObservation = true;
                break;
              }
              // If we hit another action before observation, that's also valid
              // (the observation for this action should come before next action)
              if (steps[j].type === 'action') {
                break;
              }
            }
            expect(foundObservation).toBe(true);
          }
        }
      }),
      { numRuns: 20 }
    );
  });

  it('observation step analyzes tool result against goal', async () => {
    await fc.assert(
      fc.asyncProperty(goalArb, async (goal) => {
        let callCount = 0;
        mockCallLLM.mockImplementation(async (_messages, _config, onToken) => {
          callCount++;
          if (callCount === 1) {
            const response = `Analyzing request.\n<tool_call>\n<name>test_tool</name>\n<parameters>{"query": "info"}</parameters>\n<reasoning>Gathering data</reasoning>\n</tool_call>`;
            onToken(response);
            return { content: response, usage: { promptTokens: 50, completionTokens: 30 } };
          } else if (callCount === 2) {
            // Observation with analysis
            const response = `The tool returned data about the query. This helps achieve the goal of ${goal}. <status>COMPLETED</status>`;
            onToken(response);
            return { content: response, usage: { promptTokens: 40, completionTokens: 25 } };
          } else {
            const response = '<synthesis>Final answer based on analysis.</synthesis>';
            onToken(response);
            return { content: response, usage: { promptTokens: 40, completionTokens: 20 } };
          }
        });

        const context = createContext(goal, 128000);
        const memory = createEpisodicMemory('test-session');
        const config = createTestConfig({ maxSteps: 5 });

        const result = await runAgentLoop(goal, context, memory, config, () => {});

        // Property: Observation steps should contain analysis content
        const observationSteps = result.trajectory.steps.filter((s) => s.type === 'observation');
        for (const obs of observationSteps) {
          // Observation should have meaningful content
          expect(obs.content.trim().length).toBeGreaterThan(10);
        }
      }),
      { numRuns: 20 }
    );
  });
});

/**
 * **Feature: agent-architecture-upgrade, Property 17: Status Update Emission**
 * **Validates: Requirements 1.6**
 *
 * Property: During agent execution, status updates SHALL be emitted for each
 * phase transition (thinking, executing, analyzing, synthesizing).
 */
describe('Property 17: Status Update Emission', () => {
  beforeEach(() => {
    clearToolRegistry();
    registerTool(testToolSchema, testToolHandler);
    mockCallLLM.mockReset();
  });

  afterEach(() => {
    clearToolRegistry();
  });

  const goalArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]{4,49}$/);

  it('status updates are emitted during execution', async () => {
    await fc.assert(
      fc.asyncProperty(goalArb, async (goal) => {
        const statusUpdates: AgentStatus[] = [];
        const onStatus = (status: AgentStatus) => statusUpdates.push(status);

        let callCount = 0;
        mockCallLLM.mockImplementation(async (_messages, _config, onToken) => {
          callCount++;
          if (callCount === 1) {
            const response = `Thinking.\n<tool_call>\n<name>test_tool</name>\n<parameters>{"query": "test"}</parameters>\n<reasoning>Need data</reasoning>\n</tool_call>`;
            onToken(response);
            return { content: response, usage: { promptTokens: 50, completionTokens: 30 } };
          } else if (callCount === 2) {
            const response = 'Goal achieved. <status>COMPLETED</status>';
            onToken(response);
            return { content: response, usage: { promptTokens: 40, completionTokens: 20 } };
          } else {
            const response = '<synthesis>Done.</synthesis>';
            onToken(response);
            return { content: response, usage: { promptTokens: 40, completionTokens: 20 } };
          }
        });

        const context = createContext(goal, 128000);
        const memory = createEpisodicMemory('test-session');
        const config = createTestConfig({ maxSteps: 5 });

        await runAgentLoop(goal, context, memory, config, onStatus);

        // Property: At least one status update should be emitted
        expect(statusUpdates.length).toBeGreaterThan(0);
      }),
      { numRuns: 20 }
    );
  });

  it('thinking phase is always emitted first', async () => {
    await fc.assert(
      fc.asyncProperty(goalArb, async (goal) => {
        const statusUpdates: AgentStatus[] = [];
        const onStatus = (status: AgentStatus) => statusUpdates.push(status);

        mockCallLLM.mockImplementation(async (_messages, _config, onToken) => {
          const response = '<synthesis>Quick answer.</synthesis>';
          onToken(response);
          return { content: response, usage: { promptTokens: 50, completionTokens: 20 } };
        });

        const context = createContext(goal, 128000);
        const memory = createEpisodicMemory('test-session');
        const config = createTestConfig({ maxSteps: 5 });

        await runAgentLoop(goal, context, memory, config, onStatus);

        // Property: First status update should be 'thinking'
        expect(statusUpdates.length).toBeGreaterThan(0);
        expect(statusUpdates[0].phase).toBe('thinking');
      }),
      { numRuns: 20 }
    );
  });

  it('executing phase is emitted when tool is invoked', async () => {
    await fc.assert(
      fc.asyncProperty(goalArb, async (goal) => {
        const statusUpdates: AgentStatus[] = [];
        const onStatus = (status: AgentStatus) => statusUpdates.push(status);

        let callCount = 0;
        mockCallLLM.mockImplementation(async (_messages, _config, onToken) => {
          callCount++;
          if (callCount === 1) {
            const response = `Thinking.\n<tool_call>\n<name>test_tool</name>\n<parameters>{"query": "test"}</parameters>\n<reasoning>Need data</reasoning>\n</tool_call>`;
            onToken(response);
            return { content: response, usage: { promptTokens: 50, completionTokens: 30 } };
          } else if (callCount === 2) {
            const response = 'Goal achieved. <status>COMPLETED</status>';
            onToken(response);
            return { content: response, usage: { promptTokens: 40, completionTokens: 20 } };
          } else {
            const response = '<synthesis>Done.</synthesis>';
            onToken(response);
            return { content: response, usage: { promptTokens: 40, completionTokens: 20 } };
          }
        });

        const context = createContext(goal, 128000);
        const memory = createEpisodicMemory('test-session');
        const config = createTestConfig({ maxSteps: 5 });

        await runAgentLoop(goal, context, memory, config, onStatus);

        // Property: 'executing' phase should be emitted when tool is called
        const executingUpdates = statusUpdates.filter((s) => s.phase === 'executing');
        expect(executingUpdates.length).toBeGreaterThan(0);
        // Executing phase should include the tool name
        expect(executingUpdates[0].currentTool).toBe('test_tool');
      }),
      { numRuns: 20 }
    );
  });

  it('analyzing phase is emitted after tool execution', async () => {
    await fc.assert(
      fc.asyncProperty(goalArb, async (goal) => {
        const statusUpdates: AgentStatus[] = [];
        const onStatus = (status: AgentStatus) => statusUpdates.push(status);

        let callCount = 0;
        mockCallLLM.mockImplementation(async (_messages, _config, onToken) => {
          callCount++;
          if (callCount === 1) {
            const response = `Thinking.\n<tool_call>\n<name>test_tool</name>\n<parameters>{"query": "test"}</parameters>\n<reasoning>Need data</reasoning>\n</tool_call>`;
            onToken(response);
            return { content: response, usage: { promptTokens: 50, completionTokens: 30 } };
          } else if (callCount === 2) {
            const response = 'Goal achieved. <status>COMPLETED</status>';
            onToken(response);
            return { content: response, usage: { promptTokens: 40, completionTokens: 20 } };
          } else {
            const response = '<synthesis>Done.</synthesis>';
            onToken(response);
            return { content: response, usage: { promptTokens: 40, completionTokens: 20 } };
          }
        });

        const context = createContext(goal, 128000);
        const memory = createEpisodicMemory('test-session');
        const config = createTestConfig({ maxSteps: 5 });

        await runAgentLoop(goal, context, memory, config, onStatus);

        // Property: 'analyzing' phase should be emitted after tool execution
        const analyzingUpdates = statusUpdates.filter((s) => s.phase === 'analyzing');
        expect(analyzingUpdates.length).toBeGreaterThan(0);
      }),
      { numRuns: 20 }
    );
  });

  it('status updates include step number and token usage', async () => {
    await fc.assert(
      fc.asyncProperty(goalArb, async (goal) => {
        const statusUpdates: AgentStatus[] = [];
        const onStatus = (status: AgentStatus) => statusUpdates.push(status);

        mockCallLLM.mockImplementation(async (_messages, _config, onToken) => {
          const response = '<synthesis>Quick answer.</synthesis>';
          onToken(response);
          return { content: response, usage: { promptTokens: 100, completionTokens: 50 } };
        });

        const context = createContext(goal, 128000);
        const memory = createEpisodicMemory('test-session');
        const config = createTestConfig({ maxSteps: 5 });

        await runAgentLoop(goal, context, memory, config, onStatus);

        // Property: All status updates should include step number and token usage
        for (const status of statusUpdates) {
          expect(status.stepNumber).toBeGreaterThanOrEqual(1);
          expect(status.maxSteps).toBe(5);
          expect(status.tokenUsage).toBeDefined();
          expect(status.tokenUsage.input).toBeGreaterThanOrEqual(0);
          expect(status.tokenUsage.output).toBeGreaterThanOrEqual(0);
        }
      }),
      { numRuns: 20 }
    );
  });
});

// ============================================================================
// RAG Integration Tests
// Requirements: 2.2, 2.3, 2.4
// ============================================================================

// Mock the memory module
vi.mock('../../../src/lib/memory', () => ({
  getMemoryManager: vi.fn(),
}));

// Mock the rag-context module
vi.mock('../../../src/lib/agent/rag-context', () => ({
  buildRAGContext: vi.fn(),
  buildRAGContextMessage: vi.fn(),
  calculateTokenBudgets: vi.fn(),
  createRAGConfig: vi.fn(),
}));

// Mock the auto-indexer module
vi.mock('../../../src/lib/agent/auto-indexer', () => ({
  indexPageAsync: vi.fn(),
}));

import { getMemoryManager } from '../../../src/lib/memory';
import {
  buildRAGContext,
  buildRAGContextMessage,
  calculateTokenBudgets,
} from '../../../src/lib/agent/rag-context';
import { indexPageAsync } from '../../../src/lib/agent/auto-indexer';
import { getMemoryManagerSafe } from '../../../src/lib/agent/loop';

const mockGetMemoryManager = vi.mocked(getMemoryManager);
const mockBuildRAGContext = vi.mocked(buildRAGContext);
const mockBuildRAGContextMessage = vi.mocked(buildRAGContextMessage);
const mockCalculateTokenBudgets = vi.mocked(calculateTokenBudgets);
const mockIndexPageAsync = vi.mocked(indexPageAsync);

describe('RAG Integration', () => {
  beforeEach(() => {
    clearToolRegistry();
    registerTool(testToolSchema, testToolHandler);
    mockCallLLM.mockReset();
    mockGetMemoryManager.mockReset();
    mockBuildRAGContext.mockReset();
    mockBuildRAGContextMessage.mockReset();
    mockCalculateTokenBudgets.mockReset();
    mockIndexPageAsync.mockReset();
  });

  afterEach(() => {
    clearToolRegistry();
  });

  describe('getMemoryManagerSafe', () => {
    it('returns MemoryManager when available', async () => {
      const mockManager = {
        getStats: () => ({
          documentCount: 10,
          indexSizeBytes: 1000,
          lastSyncTime: Date.now(),
          embeddingModelLoaded: true,
        }),
      };
      mockGetMemoryManager.mockResolvedValue(mockManager as any);

      const result = await getMemoryManagerSafe();

      expect(result).toBe(mockManager);
    });

    it('returns null when MemoryManager initialization fails', async () => {
      mockGetMemoryManager.mockRejectedValue(new Error('Init failed'));

      const result = await getMemoryManagerSafe();

      expect(result).toBeNull();
    });

    it('logs warning when MemoryManager unavailable', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockGetMemoryManager.mockRejectedValue(new Error('Init failed'));

      await getMemoryManagerSafe();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('MemoryManager unavailable'),
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });

  describe('RAG context injection', () => {
    it('injects RAG context when enabled and MemoryManager ready', async () => {
      // Setup mocks
      const mockManager = {
        getStats: () => ({
          documentCount: 10,
          indexSizeBytes: 1000,
          lastSyncTime: Date.now(),
          embeddingModelLoaded: true,
        }),
      };
      mockGetMemoryManager.mockResolvedValue(mockManager as any);

      mockCalculateTokenBudgets.mockReturnValue({
        totalAvailable: 10000,
        preferenceBudget: 500,
        knowledgeBudget: 2000,
        remaining: 7500,
      });

      mockBuildRAGContext.mockResolvedValue({
        userProfile: 'User is a software engineer',
        relatedKnowledge: '<source>Some knowledge</source>',
        summary: 'Showing 1 of 1 sources',
        totalTokens: 100,
      });

      mockBuildRAGContextMessage.mockReturnValue({
        role: 'assistant',
        content: '[REFERENCE DATA]\n<knowledge_context>...</knowledge_context>',
      });

      mockCallLLM.mockImplementation(async (messages, _config, onToken) => {
        // Verify RAG context message is included
        const hasRAGContext = messages.some(
          (m: any) => m.role === 'assistant' && m.content.includes('REFERENCE DATA')
        );
        expect(hasRAGContext).toBe(true);

        const response = '<synthesis>Answer based on context.</synthesis>';
        onToken(response);
        return { content: response, usage: { promptTokens: 100, completionTokens: 50 } };
      });

      const context = createContext('test goal', 128000);
      const memory = createEpisodicMemory('test-session');
      const config = createTestConfig({
        ragConfig: {
          topK: 5,
          similarityThreshold: 0.3,
          knowledgeBudget: 2000,
          preferenceBudget: 500,
          searchMode: 'hybrid',
        },
      });

      await runAgentLoop('test goal', context, memory, config, () => {});

      expect(mockBuildRAGContext).toHaveBeenCalled();
      expect(mockBuildRAGContextMessage).toHaveBeenCalled();
    });

    it('skips RAG context when ragConfig not provided', async () => {
      mockCallLLM.mockImplementation(async (_messages, _config, onToken) => {
        const response = '<synthesis>Answer without RAG.</synthesis>';
        onToken(response);
        return { content: response, usage: { promptTokens: 100, completionTokens: 50 } };
      });

      const context = createContext('test goal', 128000);
      const memory = createEpisodicMemory('test-session');
      const config = createTestConfig(); // No ragConfig

      await runAgentLoop('test goal', context, memory, config, () => {});

      expect(mockBuildRAGContext).not.toHaveBeenCalled();
    });

    it('skips RAG context when embedding model not loaded', async () => {
      const mockManager = {
        getStats: () => ({
          documentCount: 10,
          indexSizeBytes: 1000,
          lastSyncTime: Date.now(),
          embeddingModelLoaded: false, // Not ready
        }),
      };
      mockGetMemoryManager.mockResolvedValue(mockManager as any);

      mockCallLLM.mockImplementation(async (_messages, _config, onToken) => {
        const response = '<synthesis>Answer without RAG.</synthesis>';
        onToken(response);
        return { content: response, usage: { promptTokens: 100, completionTokens: 50 } };
      });

      const context = createContext('test goal', 128000);
      const memory = createEpisodicMemory('test-session');
      const config = createTestConfig({
        ragConfig: {
          topK: 5,
          similarityThreshold: 0.3,
          knowledgeBudget: 2000,
          preferenceBudget: 500,
          searchMode: 'hybrid',
        },
      });

      await runAgentLoop('test goal', context, memory, config, () => {});

      expect(mockBuildRAGContext).not.toHaveBeenCalled();
    });

    it('continues without RAG when MemoryManager fails', async () => {
      mockGetMemoryManager.mockRejectedValue(new Error('Init failed'));

      mockCallLLM.mockImplementation(async (_messages, _config, onToken) => {
        const response = '<synthesis>Answer without RAG.</synthesis>';
        onToken(response);
        return { content: response, usage: { promptTokens: 100, completionTokens: 50 } };
      });

      const context = createContext('test goal', 128000);
      const memory = createEpisodicMemory('test-session');
      const config = createTestConfig({
        ragConfig: {
          topK: 5,
          similarityThreshold: 0.3,
          knowledgeBudget: 2000,
          preferenceBudget: 500,
          searchMode: 'hybrid',
        },
      });

      // Should not throw
      const result = await runAgentLoop('test goal', context, memory, config, () => {});

      expect(result.trajectory.status).toBe('completed');
    });
  });

  describe('Auto-indexing integration', () => {
    it('triggers auto-indexing when pageContent provided', async () => {
      mockCallLLM.mockImplementation(async (_messages, _config, onToken) => {
        const response = '<synthesis>Done.</synthesis>';
        onToken(response);
        return { content: response, usage: { promptTokens: 100, completionTokens: 50 } };
      });

      const context = createContext('test goal', 128000);
      const memory = createEpisodicMemory('test-session');
      const config = createTestConfig();
      const pageContent = {
        content: '<html><body>Test content</body></html>',
        sourceUrl: 'https://example.com/page',
        title: 'Test Page',
      };

      await runAgentLoop(
        'test goal',
        context,
        memory,
        config,
        () => {},
        undefined,
        undefined,
        pageContent
      );

      expect(mockIndexPageAsync).toHaveBeenCalledWith(
        pageContent.content,
        pageContent.sourceUrl,
        pageContent.title
      );
    });

    it('skips auto-indexing when enableAutoIndex is false', async () => {
      mockCallLLM.mockImplementation(async (_messages, _config, onToken) => {
        const response = '<synthesis>Done.</synthesis>';
        onToken(response);
        return { content: response, usage: { promptTokens: 100, completionTokens: 50 } };
      });

      const context = createContext('test goal', 128000);
      const memory = createEpisodicMemory('test-session');
      const config = createTestConfig({ enableAutoIndex: false });
      const pageContent = {
        content: '<html><body>Test content</body></html>',
        sourceUrl: 'https://example.com/page',
        title: 'Test Page',
      };

      await runAgentLoop(
        'test goal',
        context,
        memory,
        config,
        () => {},
        undefined,
        undefined,
        pageContent
      );

      expect(mockIndexPageAsync).not.toHaveBeenCalled();
    });

    it('skips auto-indexing when no pageContent provided', async () => {
      mockCallLLM.mockImplementation(async (_messages, _config, onToken) => {
        const response = '<synthesis>Done.</synthesis>';
        onToken(response);
        return { content: response, usage: { promptTokens: 100, completionTokens: 50 } };
      });

      const context = createContext('test goal', 128000);
      const memory = createEpisodicMemory('test-session');
      const config = createTestConfig();

      await runAgentLoop('test goal', context, memory, config, () => {});

      expect(mockIndexPageAsync).not.toHaveBeenCalled();
    });
  });
});
