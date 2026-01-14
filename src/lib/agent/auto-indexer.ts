// Auto-Indexer Module for Agent Memory Integration
// Handles automatic page indexing during Agent analysis
// Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7

import { getMemoryManager, chunkHtmlContent } from '../memory';

// ============================================================================
// Types
// ============================================================================

export interface IndexingResult {
  success: boolean;
  chunksIndexed: number;
  sourceUrl: string;
  error?: string;
}

interface DeduplicationCheck {
  shouldIndex: boolean;
  existingContentHash?: string;
}

// ============================================================================
// Content Hash
// ============================================================================

/**
 * Compute a simple hash for content change detection.
 * Uses first 1000 chars + length for fast comparison.
 * Returns a consistent-length hash string.
 * Requirements: 3.4, 3.5
 */
export function computeContentHash(content: string): string {
  const sample = content.slice(0, 1000) + '|' + content.length;
  // Simple hash function that produces consistent output
  let hash = 0;
  for (let i = 0; i < sample.length; i++) {
    const char = sample.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0; // Convert to 32-bit integer
  }
  // Convert to hex and pad to ensure consistent length
  const hexHash = Math.abs(hash).toString(16).padStart(8, '0');
  // Create a longer hash by combining multiple passes
  let hash2 = 0;
  for (let i = sample.length - 1; i >= 0; i--) {
    const char = sample.charCodeAt(i);
    hash2 = ((hash2 << 5) - hash2 + char) | 0;
  }
  const hexHash2 = Math.abs(hash2).toString(16).padStart(8, '0');
  return hexHash + hexHash2;
}

// ============================================================================
// Deduplication
// ============================================================================

/**
 * Check if a URL should be indexed based on existing content.
 * Returns shouldIndex: true if no existing content or content has changed.
 * Requirements: 3.4
 */
export async function shouldIndex(
  sourceUrl: string,
  newContentHash: string
): Promise<DeduplicationCheck> {
  try {
    const memoryManager = await getMemoryManager();
    const existing = await memoryManager.searchBySourceUrl(sourceUrl, 1);

    if (existing.length === 0) {
      // No existing content, should index
      return { shouldIndex: true };
    }

    // Check if content has changed by comparing hashes
    // We store the hash in the title field as a prefix: "hash:XXXX|Original Title"
    const existingDoc = existing[0].document;
    const titleParts = existingDoc.title.split('|');
    const existingHashPart = titleParts[0];

    if (existingHashPart.startsWith('hash:')) {
      const existingHash = existingHashPart.slice(5);
      if (existingHash === newContentHash) {
        // Content unchanged, skip indexing
        return { shouldIndex: false, existingContentHash: existingHash };
      }
    }

    // Content changed or no hash found, should re-index
    return { shouldIndex: true, existingContentHash: existingHashPart.slice(5) };
  } catch (error) {
    // On error, default to indexing
    console.warn('[AutoIndexer] Deduplication check failed:', error);
    return { shouldIndex: true };
  }
}

/**
 * Remove all existing chunks for a URL.
 * Used before re-indexing updated content.
 * Requirements: 3.5
 */
export async function removeExistingChunks(sourceUrl: string): Promise<number> {
  try {
    const memoryManager = await getMemoryManager();
    return memoryManager.removeBySourceUrl(sourceUrl);
  } catch (error) {
    console.error('[AutoIndexer] Failed to remove existing chunks:', error);
    return 0;
  }
}

// ============================================================================
// Page Indexing
// ============================================================================

/**
 * Index a page's content into memory.
 * Handles chunking, deduplication, and storage.
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */
export async function indexPage(
  content: string,
  sourceUrl: string,
  title: string
): Promise<IndexingResult> {
  const startTime = Date.now();

  try {
    // Compute content hash for deduplication
    const contentHash = computeContentHash(content);

    // Check if we should index
    const check = await shouldIndex(sourceUrl, contentHash);
    if (!check.shouldIndex) {
      console.log(`[AutoIndexer] Skipping ${sourceUrl} - content unchanged`);
      return {
        success: true,
        chunksIndexed: 0,
        sourceUrl,
      };
    }

    // Remove existing chunks if re-indexing
    if (check.existingContentHash) {
      const removed = await removeExistingChunks(sourceUrl);
      console.log(`[AutoIndexer] Removed ${removed} existing chunks for ${sourceUrl}`);
    }

    // Chunk the content
    const chunks = chunkHtmlContent(content);
    if (chunks.length === 0) {
      console.log(`[AutoIndexer] No chunks generated for ${sourceUrl}`);
      return {
        success: true,
        chunksIndexed: 0,
        sourceUrl,
      };
    }

    // Store chunks with metadata
    // Embed hash in title for future deduplication checks
    const titleWithHash = `hash:${contentHash}|${title}`;
    const memoryManager = await getMemoryManager();
    await memoryManager.addChunks(chunks, {
      sourceUrl,
      title: titleWithHash,
    });

    const duration = Date.now() - startTime;
    console.log(`[AutoIndexer] Indexed ${chunks.length} chunks from ${sourceUrl} in ${duration}ms`);

    return {
      success: true,
      chunksIndexed: chunks.length,
      sourceUrl,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[AutoIndexer] Failed to index ${sourceUrl}:`, error);

    return {
      success: false,
      chunksIndexed: 0,
      sourceUrl,
      error: errorMessage,
    };
  }
}

/**
 * Fire-and-forget page indexing.
 * Does not block the caller, allows eventual consistency.
 * Requirements: 3.6, 3.7
 */
export function indexPageAsync(content: string, sourceUrl: string, title: string): void {
  // Fire and forget - don't await
  indexPage(content, sourceUrl, title).catch((error) => {
    console.error('[AutoIndexer] Async indexing failed:', error);
  });
}
