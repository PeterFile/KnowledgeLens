// Storage manager for API keys and settings
// Uses chrome.storage.local for secure storage (Manifest V3 Promise-based API)
// Requirements: 8.2, 8.3, 8.4

import type { StoredSettings } from '../types';

export type { StoredSettings };

const STORAGE_KEY = 'knowledgelens_settings';

/**
 * Save settings to chrome.storage.local
 * API keys are stored locally and never transmitted to third-party servers
 * other than the configured API endpoints (Requirement 8.3)
 */
export async function saveSettings(settings: StoredSettings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}

/**
 * Load settings from chrome.storage.local
 */
export async function loadSettings(): Promise<StoredSettings | null> {
  const result = await chrome.storage.local.get([STORAGE_KEY]);
  return result[STORAGE_KEY] ?? null;
}

/**
 * Clear all settings from chrome.storage.local immediately (Requirement 8.4)
 */
export async function clearSettings(): Promise<void> {
  await chrome.storage.local.remove([STORAGE_KEY]);
}
