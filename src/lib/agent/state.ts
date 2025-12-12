// State Manager for Agent Architecture
// Handles persistence to chrome.storage.session for Service Worker resilience
// Requirements: 10.1, 10.2, 10.3, 10.4, 10.5

import type {
  AgentState,
  AgentContext,
  EpisodicMemory,
  TokenUsage,
  PersistedAgentState,
  SerializedContext,
  SerializedMemory,
  Reflection,
  GroundingSection,
} from './types';

// State version for migration support (duplicated to avoid circular dependency)
const AGENT_STATE_VERSION = 1;

const STATE_KEY_PREFIX = 'agent_state_';

// ============================================================================
// Serialization Helpers
// ============================================================================

function serializeContext(context: AgentContext): SerializedContext {
  return {
    grounding: context.grounding,
    history: context.history,
    reflections: context.reflections.map((r) => r.id),
    tokenCount: context.tokenCount,
  };
}

function serializeMemory(memory: EpisodicMemory): SerializedMemory {
  return {
    sessionId: memory.sessionId,
    reflections: memory.reflections,
    errorCounts: Array.from(memory.errorCounts.entries()),
  };
}

function deserializeContext(
  serialized: SerializedContext,
  reflections: Reflection[],
  maxTokens: number
): AgentContext {
  const reflectionMap = new Map(reflections.map((r) => [r.id, r]));
  return {
    grounding: serialized.grounding,
    history: serialized.history,
    reflections: serialized.reflections
      .map((id) => reflectionMap.get(id))
      .filter((r): r is Reflection => r !== undefined),
    tokenCount: serialized.tokenCount,
    maxTokens,
  };
}

function deserializeMemory(serialized: SerializedMemory): EpisodicMemory {
  return {
    sessionId: serialized.sessionId,
    reflections: serialized.reflections,
    errorCounts: new Map(serialized.errorCounts),
  };
}

// ============================================================================
// State Validation
// ============================================================================

/**
 * Type guard to validate if an unknown value is a valid AgentState
 * Requirement 10.5: Validate state before restoration
 */
export function isValidState(state: unknown): state is PersistedAgentState {
  if (!state || typeof state !== 'object') return false;

  const s = state as Record<string, unknown>;

  // Check required fields exist
  if (typeof s.version !== 'number') return false;
  if (typeof s.sessionId !== 'string' || s.sessionId.length === 0) return false;
  if (typeof s.timestamp !== 'number') return false;

  // Validate context structure
  if (!s.context || typeof s.context !== 'object') return false;
  const ctx = s.context as Record<string, unknown>;
  if (!ctx.grounding || typeof ctx.grounding !== 'object') return false;
  if (!Array.isArray(ctx.history)) return false;
  if (!Array.isArray(ctx.reflections)) return false;
  if (typeof ctx.tokenCount !== 'number') return false;

  // Validate memory structure
  if (!s.memory || typeof s.memory !== 'object') return false;
  const mem = s.memory as Record<string, unknown>;
  if (typeof mem.sessionId !== 'string') return false;
  if (!Array.isArray(mem.reflections)) return false;
  if (!Array.isArray(mem.errorCounts)) return false;

  // Validate tokenUsage structure
  if (!s.tokenUsage || typeof s.tokenUsage !== 'object') return false;
  const usage = s.tokenUsage as Record<string, unknown>;
  if (!usage.sessionTotal || typeof usage.sessionTotal !== 'object') return false;
  if (!usage.currentOperation || typeof usage.currentOperation !== 'object') return false;
  if (typeof usage.budget !== 'number') return false;
  if (typeof usage.warningThreshold !== 'number') return false;

  // Trajectory can be null or valid object
  if (s.trajectory !== null) {
    if (typeof s.trajectory !== 'object') return false;
    const traj = s.trajectory as Record<string, unknown>;
    if (typeof traj.requestId !== 'string') return false;
    if (typeof traj.goal !== 'string') return false;
    if (!Array.isArray(traj.steps)) return false;
    if (typeof traj.status !== 'string') return false;
  }

  return true;
}

// ============================================================================
// Session Creation
// ============================================================================

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function createDefaultGrounding(): GroundingSection {
  return {
    currentGoal: '',
    completedSubtasks: [],
    keyDecisions: [],
    userPreferences: {},
  };
}

function createDefaultTokenUsage(budget = 100000): TokenUsage {
  return {
    sessionTotal: { input: 0, output: 0 },
    currentOperation: { input: 0, output: 0 },
    budget,
    warningThreshold: budget * 0.8,
  };
}

/**
 * Create a new agent session with default state
 * Requirement 10.5: Start fresh session when needed
 */
export function createSession(budget = 100000, maxTokens = 128000): AgentState {
  const sessionId = generateSessionId();

  return {
    sessionId,
    trajectory: null,
    context: {
      grounding: createDefaultGrounding(),
      history: [],
      reflections: [],
      tokenCount: 0,
      maxTokens,
    },
    memory: {
      sessionId,
      reflections: [],
      errorCounts: new Map(),
    },
    tokenUsage: createDefaultTokenUsage(budget),
    lastUpdated: Date.now(),
  };
}

// ============================================================================
// State Persistence
// ============================================================================

/**
 * Save agent state to chrome.storage.session
 * Requirement 10.1: Persist state immediately on changes
 * Requirement 10.4: Use efficient serialization
 */
export async function saveState(state: AgentState): Promise<void> {
  const key = `${STATE_KEY_PREFIX}${state.sessionId}`;

  const persisted: PersistedAgentState = {
    version: AGENT_STATE_VERSION,
    sessionId: state.sessionId,
    trajectory: state.trajectory,
    context: serializeContext(state.context),
    memory: serializeMemory(state.memory),
    tokenUsage: state.tokenUsage,
    timestamp: Date.now(),
  };

  await chrome.storage.session.set({ [key]: persisted });
}

/**
 * Load agent state from chrome.storage.session
 * Requirement 10.2: Restore state on Service Worker wake
 * Requirement 10.5: Return null if state is invalid
 */
export async function loadState(sessionId: string): Promise<AgentState | null> {
  const key = `${STATE_KEY_PREFIX}${sessionId}`;
  const result = await chrome.storage.session.get([key]);
  const persisted = result[key];

  if (!isValidState(persisted)) {
    return null;
  }

  // Deserialize back to runtime state
  const memory = deserializeMemory(persisted.memory);
  const context = deserializeContext(
    persisted.context,
    memory.reflections,
    128000 // Default maxTokens, could be made configurable
  );

  return {
    sessionId: persisted.sessionId,
    trajectory: persisted.trajectory,
    context,
    memory,
    tokenUsage: persisted.tokenUsage,
    lastUpdated: persisted.timestamp,
  };
}

/**
 * Clear session state from storage
 * Requirement 10.3: Clear session-specific state when session ends
 */
export async function clearState(sessionId: string): Promise<void> {
  const key = `${STATE_KEY_PREFIX}${sessionId}`;
  await chrome.storage.session.remove([key]);
}

/**
 * List all active session IDs in storage
 * Useful for cleanup and debugging
 */
export async function listSessions(): Promise<string[]> {
  const all = await chrome.storage.session.get(null);
  return Object.keys(all)
    .filter((key) => key.startsWith(STATE_KEY_PREFIX))
    .map((key) => key.slice(STATE_KEY_PREFIX.length));
}

/**
 * Clear all agent sessions from storage
 * Useful for complete cleanup
 */
export async function clearAllSessions(): Promise<void> {
  const sessions = await listSessions();
  const keys = sessions.map((id) => `${STATE_KEY_PREFIX}${id}`);
  if (keys.length > 0) {
    await chrome.storage.session.remove(keys);
  }
}
