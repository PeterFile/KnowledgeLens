// Preference Store Module for Agent Memory Integration
// Manages user preference storage and retrieval
// Requirements: 5.1, 5.2, 5.3, 5.4, 5.6

import { getMemoryManager } from '../memory';
import type { SearchResult } from '../memory/types';
import { countTokens, truncateToTokens } from '../tokenizer';

// ============================================================================
// Types
// ============================================================================

export type PreferenceType = 'expertise' | 'style' | 'domain' | 'custom';

export interface UserPreference {
  id: string;
  type: PreferenceType;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface PreferenceStore {
  add(preference: Omit<UserPreference, 'id' | 'createdAt' | 'updatedAt'>): Promise<string>;
  getAll(): Promise<UserPreference[]>;
  remove(id: string): Promise<boolean>;
  clear(): Promise<void>;
  formatForContext(budgetTokens: number): Promise<string>;
}

export interface PreferenceDetectionResult {
  isPreference: boolean;
  type: PreferenceType;
  content: string;
}

// ============================================================================
// Constants
// ============================================================================

const PREFERENCE_SOURCE_URL = 'preference://user';

// ============================================================================
// Preference Detection
// ============================================================================

// Pattern definitions for preference detection
const PROFESSION_PATTERNS = [
  /^i(?:'m| am) (?:a |an )?(.+?)(?:\.|,|$)/i,
  /^i work as (?:a |an )?(.+?)(?:\.|,|$)/i,
  /^i(?:'m| am) working as (?:a |an )?(.+?)(?:\.|,|$)/i,
  /^my (?:job|profession|role|occupation) is (?:a |an )?(.+?)(?:\.|,|$)/i,
];

// Level patterns use explicit keywords to avoid matching professions
// Known level keywords: beginner, intermediate, advanced, expert, novice, newbie
const LEVEL_PATTERNS = [
  /^explain (?:it |this |things )?(?:to me )?(?:like|as if) i(?:'m| am| were) (?:a )?(.+?)(?:\.|,|$)/i,
  // More restrictive pattern: only match if the level part is a known level keyword
  // This prevents matching "I am a [profession] in [field]" as a level pattern
  /^i(?:'m| am) (?:a )?(?:complete |total )?(beginner|intermediate|advanced|expert|novice|newbie) (?:in|at|with) (.+?)(?:\.|,|$)/i,
  /^i(?:'m| am) (?:a )?(.+?) level(?:\.|,|$)/i,
  /^treat me (?:like|as) (?:a )?(.+?)(?:\.|,|$)/i,
];

const STYLE_PATTERNS = [
  /^i prefer (.+?) (?:explanations?|style|format|responses?)(?:\.|,|$)/i,
  /^i like (.+?) (?:explanations?|style|format|responses?)(?:\.|,|$)/i,
  /^please (?:use|give me) (.+?) (?:explanations?|style|format|responses?)(?:\.|,|$)/i,
  /^i want (.+?) (?:explanations?|style|format|responses?)(?:\.|,|$)/i,
];

const DOMAIN_PATTERNS = [
  /^i(?:'m| am) (?:interested|specializing|focused|working) in (.+?)(?:\.|,|$)/i,
  /^my (?:field|area|domain|specialty|expertise) is (.+?)(?:\.|,|$)/i,
  /^i (?:study|research|focus on) (.+?)(?:\.|,|$)/i,
];

/**
 * Detect if a message contains a user preference intent.
 * Supports patterns: "I'm a [profession]", "explain like I'm a [level]", "I prefer [style]"
 * Requirements: 5.2
 */
export function detectPreferenceIntent(message: string): PreferenceDetectionResult | null {
  const trimmed = message.trim();
  if (!trimmed) return null;

  // Check domain patterns FIRST (more specific than profession patterns)
  // "I'm interested in X" should be domain, not profession
  for (const pattern of DOMAIN_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      return {
        isPreference: true,
        type: 'domain',
        content: `User's domain: ${match[1].trim()}`,
      };
    }
  }

  // Check level patterns (style type - expertise level)
  for (const pattern of LEVEL_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      const level = match[1].trim();
      const topic = match[2]?.trim();
      const content = topic
        ? `Explain at ${level} level for ${topic}`
        : `Explain at ${level} level`;
      return {
        isPreference: true,
        type: 'style',
        content,
      };
    }
  }

  // Check style patterns
  for (const pattern of STYLE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      return {
        isPreference: true,
        type: 'style',
        content: `Preferred explanation style: ${match[1].trim()}`,
      };
    }
  }

  // Check profession patterns LAST (most general)
  for (const pattern of PROFESSION_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      const content = match[1].trim();
      // Filter out common non-profession phrases
      if (isValidProfession(content)) {
        return {
          isPreference: true,
          type: 'expertise',
          content: `User is ${content}`,
        };
      }
    }
  }

  return null;
}

/**
 * Check if extracted content is a valid profession (not a common phrase).
 */
function isValidProfession(content: string): boolean {
  const invalidPhrases = [
    'here',
    'there',
    'ready',
    'done',
    'fine',
    'good',
    'okay',
    'ok',
    'sure',
    'not sure',
    'confused',
    'lost',
    'stuck',
    'having trouble',
    'looking for',
    'trying to',
    'going to',
    'about to',
  ];

  const lower = content.toLowerCase();
  return !invalidPhrases.some((phrase) => lower === phrase || lower.startsWith(phrase + ' '));
}

// ============================================================================
// Preference Store Implementation
// ============================================================================

let storeInstance: PreferenceStore | null = null;

/**
 * Convert SearchResult to UserPreference.
 */
function toUserPreference(result: SearchResult): UserPreference {
  const doc = result.document;
  return {
    id: doc.id,
    type: (doc.preferenceType as PreferenceType) || 'custom',
    content: doc.content,
    createdAt: doc.createdAt,
    updatedAt: doc.createdAt, // Using createdAt as updatedAt since we don't track updates
  };
}

/**
 * Create the preference store implementation.
 */
function createPreferenceStore(): PreferenceStore {
  return {
    async add(preference) {
      const memoryManager = await getMemoryManager();

      // Create a simple chunk for the preference
      const chunks = [
        {
          content: preference.content,
          headingPath: ['preferences', preference.type],
          tokenCount: countTokens(preference.content),
          startOffset: 0,
          endOffset: preference.content.length,
        },
      ];

      const ids = await memoryManager.addChunks(chunks, {
        sourceUrl: PREFERENCE_SOURCE_URL,
        title: `User Preference: ${preference.type}`,
        docType: 'preference',
        preferenceType: preference.type,
      });

      return ids[0];
    },

    async getAll() {
      const memoryManager = await getMemoryManager();
      const results = await memoryManager.searchBySourceUrl(PREFERENCE_SOURCE_URL, 100);
      return results.map(toUserPreference);
    },

    async remove(id) {
      const memoryManager = await getMemoryManager();
      return memoryManager.removeById(id);
    },

    async clear() {
      const memoryManager = await getMemoryManager();
      await memoryManager.removeBySourceUrl(PREFERENCE_SOURCE_URL);
    },

    async formatForContext(budgetTokens) {
      const preferences = await this.getAll();
      if (preferences.length === 0) return '';

      // Sort by type priority: expertise > domain > style > custom
      const typePriority: Record<PreferenceType, number> = {
        expertise: 0,
        domain: 1,
        style: 2,
        custom: 3,
      };

      const sorted = [...preferences].sort((a, b) => typePriority[a.type] - typePriority[b.type]);

      // Build formatted content within budget
      const lines: string[] = [];
      let usedTokens = 0;

      for (const pref of sorted) {
        const line = pref.content;
        const lineTokens = countTokens(line);

        if (usedTokens + lineTokens <= budgetTokens) {
          lines.push(line);
          usedTokens += lineTokens;
        } else if (usedTokens < budgetTokens) {
          // Try to fit truncated content
          const remaining = budgetTokens - usedTokens;
          const truncated = truncateToTokens(line, remaining);
          if (truncated.trim()) {
            lines.push(truncated);
          }
          break;
        } else {
          break;
        }
      }

      return lines.join('\n');
    },
  };
}

/**
 * Get the singleton preference store instance.
 * Requirements: 5.6
 */
export function getPreferenceStore(): PreferenceStore {
  if (!storeInstance) {
    storeInstance = createPreferenceStore();
  }
  return storeInstance;
}

// For testing: reset the singleton
export function resetPreferenceStore(): void {
  storeInstance = null;
}
