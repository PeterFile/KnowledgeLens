// Agent Architecture Module
// Re-exports all types and utilities for the agentic system

export * from './types';
export * from './tokens';
export * from './prompts';
export * from './tools';
export * from './tool-definitions';
export * from './state';

// Default configuration values
export const DEFAULT_AGENT_CONFIG = {
  maxSteps: 5,
  maxRetries: 3,
  tokenBudget: 100000,
} as const;

export const DEFAULT_RAG_CONFIG = {
  maxRetries: 2,
  relevanceThreshold: 0.5,
} as const;

// State version for migration support
export const AGENT_STATE_VERSION = 1;
