import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  saveState,
  loadState,
  clearState,
  createSession,
  isValidState,
} from '../../../src/lib/agent/state';
import type {
  AgentState,
  AgentTrajectory,
  AgentContext,
  EpisodicMemory,
  TokenUsage,
  GroundingSection,
  ContextEntry,
  Reflection,
  ToolCall,
  StepType,
  TrajectoryStatus,
  ContextEntryType,
} from '../../../src/lib/agent/types';

// Mock chrome.storage.session API
const mockStorage = new Map<string, unknown>();

const mockChromeStorage = {
  storage: {
    session: {
      get: vi.fn(async (keys: string[]) => {
        const result: Record<string, unknown> = {};
        for (const key of keys) {
          if (mockStorage.has(key)) {
            result[key] = mockStorage.get(key);
          }
        }
        return result;
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(items)) {
          mockStorage.set(key, value);
        }
      }),
      remove: vi.fn(async (keys: string[]) => {
        for (const key of keys) {
          mockStorage.delete(key);
        }
      }),
    },
  },
};

// Install mock before tests
vi.stubGlobal('chrome', mockChromeStorage);

// ============================================================================
// Arbitrary Generators for AgentState
// ============================================================================

// Generate valid session IDs
const sessionIdArb = fc.stringMatching(/^session_\d{13}_[a-z0-9]{9}$/);

// Generate non-empty strings for content
const contentArb = fc.string({ minLength: 1, maxLength: 500 });

// Generate timestamps
const timestampArb = fc.integer({ min: 1700000000000, max: 1800000000000 });

// Generate step types
const stepTypeArb = fc.constantFrom(
  'thought',
  'action',
  'observation',
  'reflection',
  'synthesis'
) as fc.Arbitrary<StepType>;

// Generate trajectory status
const trajectoryStatusArb = fc.constantFrom(
  'running',
  'completed',
  'failed',
  'terminated'
) as fc.Arbitrary<TrajectoryStatus>;

// Generate context entry types
const contextEntryTypeArb = fc.constantFrom(
  'user',
  'assistant',
  'tool',
  'observation'
) as fc.Arbitrary<ContextEntryType>;

// Generate a valid ToolCall
const toolCallArb: fc.Arbitrary<ToolCall> = fc.record({
  name: fc.stringMatching(/^[a-z][a-z0-9_]{2,29}$/),
  parameters: fc.object({ maxDepth: 2 }),
  reasoning: contentArb,
});

// Generate a valid Reflection
const reflectionArb: fc.Arbitrary<Reflection> = fc.record({
  id: fc.uuid(),
  timestamp: timestampArb,
  errorType: fc.string({ minLength: 1, maxLength: 50 }),
  failedAction: toolCallArb,
  analysis: contentArb,
  suggestedFix: contentArb,
  applied: fc.boolean(),
});

// Generate a valid GroundingSection
const groundingSectionArb: fc.Arbitrary<GroundingSection> = fc.record({
  currentGoal: contentArb,
  completedSubtasks: fc.array(contentArb, { minLength: 0, maxLength: 5 }),
  keyDecisions: fc.array(contentArb, { minLength: 0, maxLength: 5 }),
  userPreferences: fc.dictionary(
    fc.stringMatching(/^[a-z][a-z0-9_]{0,19}$/),
    fc.string({ maxLength: 100 })
  ),
});

// Generate a valid ContextEntry
const contextEntryArb: fc.Arbitrary<ContextEntry> = fc.record({
  type: contextEntryTypeArb,
  content: contentArb,
  timestamp: timestampArb,
  tokenCount: fc.integer({ min: 0, max: 10000 }),
  compacted: fc.boolean(),
});

// Generate a valid AgentStep
const agentStepArb = fc
  .record({
    stepNumber: fc.integer({ min: 1, max: 10 }),
    timestamp: timestampArb,
    type: stepTypeArb,
    content: contentArb,
    tokenCount: fc.integer({ min: 0, max: 10000 }),
  })
  .chain((step) =>
    fc.option(toolCallArb, { nil: undefined }).map((toolCall) => ({ ...step, toolCall }))
  );

// Generate a valid AgentTrajectory
const agentTrajectoryArb: fc.Arbitrary<AgentTrajectory> = fc.record({
  requestId: fc.uuid(),
  goal: contentArb,
  steps: fc.array(agentStepArb, { minLength: 0, maxLength: 5 }),
  status: trajectoryStatusArb,
  totalTokens: fc.record({
    input: fc.integer({ min: 0, max: 100000 }),
    output: fc.integer({ min: 0, max: 100000 }),
  }),
  efficiency: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: undefined }),
});

// Generate a valid TokenUsage
const tokenUsageArb: fc.Arbitrary<TokenUsage> = fc
  .record({
    budget: fc.integer({ min: 1000, max: 1000000 }),
  })
  .chain((base) =>
    fc.record({
      sessionTotal: fc.record({
        input: fc.integer({ min: 0, max: base.budget }),
        output: fc.integer({ min: 0, max: base.budget }),
      }),
      currentOperation: fc.record({
        input: fc.integer({ min: 0, max: base.budget }),
        output: fc.integer({ min: 0, max: base.budget }),
      }),
      budget: fc.constant(base.budget),
      warningThreshold: fc.integer({ min: 0, max: base.budget }),
    })
  );

// Generate a valid EpisodicMemory
const episodicMemoryArb = (sessionId: string): fc.Arbitrary<EpisodicMemory> =>
  fc.array(reflectionArb, { minLength: 0, maxLength: 5 }).chain((reflections) =>
    fc
      .array(
        fc.tuple(fc.string({ minLength: 1, maxLength: 30 }), fc.integer({ min: 1, max: 10 })),
        { minLength: 0, maxLength: 5 }
      )
      .map((errorCountsArr) => ({
        sessionId,
        reflections,
        errorCounts: new Map(errorCountsArr),
      }))
  );

// Generate a valid AgentContext with reflections from memory
const agentContextArb = (reflections: Reflection[]): fc.Arbitrary<AgentContext> =>
  fc.record({
    grounding: groundingSectionArb,
    history: fc.array(contextEntryArb, { minLength: 0, maxLength: 10 }),
    reflections: fc.constant(reflections),
    tokenCount: fc.integer({ min: 0, max: 100000 }),
    maxTokens: fc.integer({ min: 10000, max: 200000 }),
  });

// Generate a complete valid AgentState
const agentStateArb: fc.Arbitrary<AgentState> = sessionIdArb.chain((sessionId) =>
  episodicMemoryArb(sessionId).chain((memory) =>
    fc
      .tuple(
        fc.option(agentTrajectoryArb, { nil: null }),
        agentContextArb(memory.reflections),
        tokenUsageArb,
        timestampArb
      )
      .map(([trajectory, context, tokenUsage, lastUpdated]) => ({
        sessionId,
        trajectory,
        context,
        memory,
        tokenUsage,
        lastUpdated,
      }))
  )
);

// ============================================================================
// Unit Tests
// ============================================================================

describe('State Manager', () => {
  beforeEach(() => {
    mockStorage.clear();
    vi.clearAllMocks();
  });

  describe('createSession', () => {
    it('creates a valid session with default values', () => {
      const session = createSession();

      expect(session.sessionId).toMatch(/^session_\d+_[a-z0-9]+$/);
      expect(session.trajectory).toBeNull();
      expect(session.context.grounding.currentGoal).toBe('');
      expect(session.context.history).toEqual([]);
      expect(session.context.reflections).toEqual([]);
      expect(session.memory.reflections).toEqual([]);
      expect(session.memory.errorCounts).toBeInstanceOf(Map);
      expect(session.tokenUsage.budget).toBe(100000);
    });

    it('creates session with custom budget', () => {
      const session = createSession(50000);

      expect(session.tokenUsage.budget).toBe(50000);
      expect(session.tokenUsage.warningThreshold).toBe(40000);
    });

    it('creates session with custom maxTokens', () => {
      const session = createSession(100000, 64000);

      expect(session.context.maxTokens).toBe(64000);
    });
  });

  describe('isValidState', () => {
    it('returns false for null', () => {
      expect(isValidState(null)).toBe(false);
    });

    it('returns false for non-object', () => {
      expect(isValidState('string')).toBe(false);
      expect(isValidState(123)).toBe(false);
      expect(isValidState(undefined)).toBe(false);
    });

    it('returns false for missing required fields', () => {
      expect(isValidState({})).toBe(false);
      expect(isValidState({ version: 1 })).toBe(false);
      expect(isValidState({ version: 1, sessionId: 'test' })).toBe(false);
    });

    it('returns true for valid persisted state', () => {
      const validState = {
        version: 1,
        sessionId: 'session_123_abc',
        timestamp: Date.now(),
        trajectory: null,
        context: {
          grounding: {
            currentGoal: 'test',
            completedSubtasks: [],
            keyDecisions: [],
            userPreferences: {},
          },
          history: [],
          reflections: [],
          tokenCount: 0,
        },
        memory: {
          sessionId: 'session_123_abc',
          reflections: [],
          errorCounts: [],
        },
        tokenUsage: {
          sessionTotal: { input: 0, output: 0 },
          currentOperation: { input: 0, output: 0 },
          budget: 100000,
          warningThreshold: 80000,
        },
      };

      expect(isValidState(validState)).toBe(true);
    });
  });

  describe('saveState and loadState', () => {
    it('saves and loads a simple state', async () => {
      const session = createSession();

      await saveState(session);
      const loaded = await loadState(session.sessionId);

      expect(loaded).not.toBeNull();
      expect(loaded!.sessionId).toBe(session.sessionId);
    });

    it('returns null for non-existent session', async () => {
      const loaded = await loadState('non_existent_session');
      expect(loaded).toBeNull();
    });
  });

  describe('clearState', () => {
    it('removes state from storage', async () => {
      const session = createSession();

      await saveState(session);
      await clearState(session.sessionId);

      const loaded = await loadState(session.sessionId);
      expect(loaded).toBeNull();
    });
  });
});

// ============================================================================
// Property-Based Tests
// ============================================================================

/**
 * **Feature: agent-architecture-upgrade, Property 12: State Persistence Round-Trip**
 * **Validates: Requirements 10.1, 10.2**
 *
 * Property: For any valid agent state, saving it to chrome.storage.session
 * and loading it back SHALL produce an equivalent state object.
 */
describe('Property 12: State Persistence Round-Trip', () => {
  beforeEach(() => {
    mockStorage.clear();
    vi.clearAllMocks();
  });

  it('saved state can be loaded back with equivalent values', async () => {
    await fc.assert(
      fc.asyncProperty(agentStateArb, async (state) => {
        // Save state
        await saveState(state);

        // Load state back
        const loaded = await loadState(state.sessionId);

        // Verify round trip succeeded
        expect(loaded).not.toBeNull();

        // Verify core fields
        expect(loaded!.sessionId).toBe(state.sessionId);

        // Verify trajectory
        if (state.trajectory === null) {
          expect(loaded!.trajectory).toBeNull();
        } else {
          expect(loaded!.trajectory).not.toBeNull();
          expect(loaded!.trajectory!.requestId).toBe(state.trajectory.requestId);
          expect(loaded!.trajectory!.goal).toBe(state.trajectory.goal);
          expect(loaded!.trajectory!.status).toBe(state.trajectory.status);
          expect(loaded!.trajectory!.steps).toEqual(state.trajectory.steps);
          expect(loaded!.trajectory!.totalTokens).toEqual(state.trajectory.totalTokens);
        }

        // Verify context grounding
        expect(loaded!.context.grounding.currentGoal).toBe(state.context.grounding.currentGoal);
        expect(loaded!.context.grounding.completedSubtasks).toEqual(
          state.context.grounding.completedSubtasks
        );
        expect(loaded!.context.grounding.keyDecisions).toEqual(
          state.context.grounding.keyDecisions
        );
        expect(loaded!.context.grounding.userPreferences).toEqual(
          state.context.grounding.userPreferences
        );

        // Verify context history
        expect(loaded!.context.history).toEqual(state.context.history);

        // Verify token count
        expect(loaded!.context.tokenCount).toBe(state.context.tokenCount);

        // Verify memory
        expect(loaded!.memory.sessionId).toBe(state.memory.sessionId);
        expect(loaded!.memory.reflections).toEqual(state.memory.reflections);

        // Verify errorCounts Map is restored correctly
        expect(loaded!.memory.errorCounts).toBeInstanceOf(Map);
        expect(Array.from(loaded!.memory.errorCounts.entries())).toEqual(
          Array.from(state.memory.errorCounts.entries())
        );

        // Verify token usage
        expect(loaded!.tokenUsage).toEqual(state.tokenUsage);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('double round-trip produces identical result', async () => {
    await fc.assert(
      fc.asyncProperty(agentStateArb, async (state) => {
        // First round-trip
        await saveState(state);
        const loaded1 = await loadState(state.sessionId);
        expect(loaded1).not.toBeNull();

        // Second round-trip
        await saveState(loaded1!);
        const loaded2 = await loadState(state.sessionId);
        expect(loaded2).not.toBeNull();

        // Both loaded states should be equivalent
        expect(loaded2!.sessionId).toBe(loaded1!.sessionId);
        expect(loaded2!.trajectory).toEqual(loaded1!.trajectory);
        expect(loaded2!.context.grounding).toEqual(loaded1!.context.grounding);
        expect(loaded2!.context.history).toEqual(loaded1!.context.history);
        expect(loaded2!.context.tokenCount).toBe(loaded1!.context.tokenCount);
        expect(loaded2!.memory.reflections).toEqual(loaded1!.memory.reflections);
        expect(Array.from(loaded2!.memory.errorCounts.entries())).toEqual(
          Array.from(loaded1!.memory.errorCounts.entries())
        );
        expect(loaded2!.tokenUsage).toEqual(loaded1!.tokenUsage);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('reflections in context are restored from memory', async () => {
    await fc.assert(
      fc.asyncProperty(agentStateArb, async (state) => {
        // Save state
        await saveState(state);

        // Load state back
        const loaded = await loadState(state.sessionId);
        expect(loaded).not.toBeNull();

        // Reflections in context should be restored from memory
        // The IDs should match
        const originalIds = state.context.reflections.map((r) => r.id);
        const loadedIds = loaded!.context.reflections.map((r) => r.id);

        expect(loadedIds).toEqual(originalIds);

        // Each reflection should have full data restored
        for (const reflection of loaded!.context.reflections) {
          const original = state.context.reflections.find((r) => r.id === reflection.id);
          expect(original).toBeDefined();
          expect(reflection.errorType).toBe(original!.errorType);
          expect(reflection.analysis).toBe(original!.analysis);
          expect(reflection.suggestedFix).toBe(original!.suggestedFix);
          expect(reflection.applied).toBe(original!.applied);
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('Map serialization preserves all error counts', async () => {
    await fc.assert(
      fc.asyncProperty(agentStateArb, async (state) => {
        // Save state
        await saveState(state);

        // Load state back
        const loaded = await loadState(state.sessionId);
        expect(loaded).not.toBeNull();

        // Verify Map is properly restored
        expect(loaded!.memory.errorCounts.size).toBe(state.memory.errorCounts.size);

        for (const [key, value] of state.memory.errorCounts) {
          expect(loaded!.memory.errorCounts.has(key)).toBe(true);
          expect(loaded!.memory.errorCounts.get(key)).toBe(value);
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('state with null trajectory round-trips correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        agentStateArb.map((state) => ({ ...state, trajectory: null })),
        async (state) => {
          await saveState(state);
          const loaded = await loadState(state.sessionId);

          expect(loaded).not.toBeNull();
          expect(loaded!.trajectory).toBeNull();

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('state with trajectory round-trips correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        agentStateArb.chain((state) =>
          agentTrajectoryArb.map((trajectory) => ({ ...state, trajectory }))
        ),
        async (state) => {
          await saveState(state);
          const loaded = await loadState(state.sessionId);

          expect(loaded).not.toBeNull();
          expect(loaded!.trajectory).not.toBeNull();
          expect(loaded!.trajectory!.requestId).toBe(state.trajectory!.requestId);
          expect(loaded!.trajectory!.goal).toBe(state.trajectory!.goal);
          expect(loaded!.trajectory!.status).toBe(state.trajectory!.status);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('clearState removes state completely', async () => {
    await fc.assert(
      fc.asyncProperty(agentStateArb, async (state) => {
        // Save state
        await saveState(state);

        // Verify it exists
        const beforeClear = await loadState(state.sessionId);
        expect(beforeClear).not.toBeNull();

        // Clear state
        await clearState(state.sessionId);

        // Verify it's gone
        const afterClear = await loadState(state.sessionId);
        expect(afterClear).toBeNull();

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('multiple saves overwrite previous state correctly', async () => {
    await fc.assert(
      fc.asyncProperty(agentStateArb, agentStateArb, async (state1, state2) => {
        // Use same sessionId for both states
        const sessionId = state1.sessionId;
        const state2WithSameId = { ...state2, sessionId };

        // Save first state
        await saveState(state1);

        // Save second state (should overwrite)
        await saveState(state2WithSameId);

        // Load should return the second state
        const loaded = await loadState(sessionId);
        expect(loaded).not.toBeNull();
        expect(loaded!.trajectory).toEqual(state2WithSameId.trajectory);
        expect(loaded!.tokenUsage).toEqual(state2WithSameId.tokenUsage);

        return true;
      }),
      { numRuns: 100 }
    );
  });
});
