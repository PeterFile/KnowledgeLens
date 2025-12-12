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
