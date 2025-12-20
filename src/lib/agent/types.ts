// Core types for the Agent Architecture
// Requirements: 1.1, 2.1, 2.2, 7.1

import type { LLMConfig, SearchResult } from '../../types';

// ============================================================================
// Agent Configuration & Status
// ============================================================================

export interface AgentConfig {
  maxSteps: number; // Default: 5
  maxRetries: number; // Default: 3
  tokenBudget: number; // User-configurable
  llmConfig: LLMConfig;
  agentSettings?: {
    language?: 'en' | 'zh' | 'ja';
  };
}

export type AgentPhase =
  | 'thinking'
  | 'executing'
  | 'analyzing'
  | 'reflecting'
  | 'synthesizing'
  | 'done';

export interface AgentStatus {
  phase: AgentPhase;
  stepNumber: number;
  maxSteps: number;
  tokenUsage: { input: number; output: number };
  currentTool?: string;
}

export type StatusCallback = (status: AgentStatus) => void;

export type StreamingCallback = (chunk: string) => void;

// ============================================================================
// Agent Steps & Trajectory
// ============================================================================

export type StepType = 'thought' | 'action' | 'observation' | 'reflection' | 'synthesis';

export interface AgentStep {
  stepNumber: number;
  timestamp: number;
  type: StepType;
  content: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  tokenCount: number;
}

export type TrajectoryStatus = 'running' | 'completed' | 'failed' | 'terminated';

export interface AgentTrajectory {
  requestId: string;
  goal: string;
  steps: AgentStep[];
  status: TrajectoryStatus;
  totalTokens: { input: number; output: number };
  efficiency?: number; // optimal steps / actual steps
}

// ============================================================================
// Tool System Types
// ============================================================================

export interface JSONSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array';
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  items?: JSONSchemaProperty;
  description?: string;
}

export interface JSONSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
}

export interface ToolExample {
  input: Record<string, unknown>;
  description: string;
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: JSONSchema;
  examples: ToolExample[];
}

export interface ToolCall {
  name: string;
  parameters: Record<string, unknown>;
  reasoning: string; // Why this tool was selected
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  tokenCount: number;
}

export type ToolHandler = (
  params: Record<string, unknown>,
  signal?: AbortSignal
) => Promise<ToolResult>;

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

// ============================================================================
// Context & Memory Types
// ============================================================================

export interface GroundingSection {
  currentGoal: string;
  completedSubtasks: string[];
  keyDecisions: string[];
  userPreferences: Record<string, string>;
}

export type ContextEntryType = 'user' | 'assistant' | 'tool' | 'observation';

export interface ContextEntry {
  type: ContextEntryType;
  content: string;
  timestamp: number;
  tokenCount: number;
  compacted: boolean;
}

export interface AgentContext {
  grounding: GroundingSection;
  history: ContextEntry[];
  reflections: Reflection[];
  tokenCount: number;
  maxTokens: number;
}

// ============================================================================
// Reflection & Episodic Memory
// ============================================================================

export interface Reflection {
  id: string;
  timestamp: number;
  errorType: string;
  failedAction: ToolCall;
  analysis: string;
  suggestedFix: string;
  applied: boolean;
}

export interface EpisodicMemory {
  sessionId: string;
  reflections: Reflection[];
  errorCounts: Map<string, number>; // Track repeated errors
}

// ============================================================================
// State Persistence Types
// ============================================================================

export interface TokenUsage {
  sessionTotal: { input: number; output: number };
  currentOperation: { input: number; output: number };
  budget: number;
  warningThreshold: number;
}

export interface AgentState {
  sessionId: string;
  trajectory: AgentTrajectory | null;
  context: AgentContext;
  memory: EpisodicMemory;
  tokenUsage: TokenUsage;
  lastUpdated: number;
}

// Serialized versions for chrome.storage.session
export interface SerializedContext {
  grounding: GroundingSection;
  history: ContextEntry[];
  reflections: string[]; // Reflection IDs
  tokenCount: number;
}

export interface SerializedMemory {
  sessionId: string;
  reflections: Reflection[];
  errorCounts: [string, number][]; // Map as array for JSON serialization
}

export interface PersistedAgentState {
  version: number; // For migration
  sessionId: string;
  trajectory: AgentTrajectory | null;
  context: SerializedContext;
  memory: SerializedMemory;
  tokenUsage: TokenUsage;
  timestamp: number;
}

// ============================================================================
// Agentic RAG Types
// ============================================================================

export type RelevanceGrade = 'relevant' | 'not_relevant';

export interface GradedResult {
  result: SearchResult;
  relevance: RelevanceGrade;
  confidence: number;
  reasoning: string;
}

export interface RAGConfig {
  maxRetries: number; // Default: 2
  relevanceThreshold: number; // Default: 0.5 (50% must be relevant)
}

export interface RAGResult {
  relevantResults: GradedResult[];
  queryHistory: string[]; // Original + rewrites
  fallbackUsed: boolean;
  disclaimer?: string;
}

// ============================================================================
// Trajectory Logging Types
// ============================================================================

export type LogEntryType =
  | 'thought'
  | 'tool_call'
  | 'tool_result'
  | 'observation'
  | 'reflection'
  | 'error';

export interface LogEntry {
  timestamp: number;
  stepNumber: number;
  type: LogEntryType;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface TrajectoryMetrics {
  totalSteps: number;
  optimalSteps?: number;
  efficiency?: number;
  totalTokens: { input: number; output: number };
  duration: number;
  errorCount: number;
}

export interface TrajectoryLog {
  requestId: string;
  entries: LogEntry[];
  metrics: TrajectoryMetrics;
}

// ============================================================================
// Prompt Template Types
// ============================================================================

export type DelimiterType = 'xml' | 'markdown';

export interface PromptSection {
  name: string;
  delimiter: DelimiterType;
  content: string;
  required: boolean;
}

export type PlaceholderType = 'string' | 'array' | 'object';

export interface PlaceholderDef {
  name: string;
  type: PlaceholderType;
  required: boolean;
}

export interface PromptTemplate {
  name: string;
  sections: PromptSection[];
  placeholders: PlaceholderDef[];
}

// ============================================================================
// Token Estimation Types
// ============================================================================

export interface TokenEstimate {
  input: number;
  output: number;
  total: number;
  cost?: number; // If pricing is configured
}

// ============================================================================
// UI State Types
// ============================================================================

export interface AgentUIState {
  isRunning: boolean;
  currentPhase: AgentPhase | 'idle';
  stepProgress: { current: number; max: number };
  tokenUsage: { input: number; output: number; budget: number };
  currentTool?: string;
  lastError?: string;
  warnings: string[];
}

export type StatusUpdateType =
  | 'phase_change'
  | 'step_complete'
  | 'token_update'
  | 'warning'
  | 'error';

export interface StatusUpdateEvent {
  type: StatusUpdateType;
  payload: AgentStatus | string;
}
