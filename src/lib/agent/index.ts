// Agent Architecture Module
// Re-exports all types and utilities for the agentic system

export * from './types';
export * from './tokens';
export * from './prompts';
export * from './tools';
export * from './tool-definitions';
export * from './state';
export * from './context';
export * from './reflection';
export * from './rag';
export * from './logger';
export * from './loop';
export * from './goal-handlers';
export * from './rag-context';
export * from './auto-indexer';
export * from './preference-store';

// Default configuration values
export const DEFAULT_AGENT_CONFIG = {
  maxSteps: 5,
  maxRetries: 3,
  tokenBudget: 100000,
} as const;

// State version for migration support
export const AGENT_STATE_VERSION = 1;
