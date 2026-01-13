# Implementation Plan: Agent Memory Integration

## Overview

This plan implements the Agent Memory Integration module in phases: first extending the Memory Infrastructure with new interfaces, then implementing the RAG pipeline, auto-indexer, preference store, and search enhancement, followed by Agent Loop integration and UI updates.

## Tasks

- [x] 1. Extend Memory Infrastructure interfaces
  - [x] 1.1 Extend VectorStore schema for preference documents
    - Add `docType` field to Orama schema (string, optional)
    - Add `preferenceType` field to Orama schema (string, optional)
    - Update Document interface in `src/lib/memory/types.ts`
    - _Requirements: 5.1_

  - [x] 1.2 Implement removeBySourceUrl in MemoryManager
    - Add `removeBySourceUrl(sourceUrl: string): Promise<number>` to MemoryManager
    - Implement deletion of all chunks matching sourceUrl
    - Return count of deleted documents
    - _Requirements: 3.4, 3.5_

  - [x] 1.3 Implement searchBySourceUrl in MemoryManager
    - Add `searchBySourceUrl(sourceUrl: string, limit?: number): Promise<SearchResult[]>` to MemoryManager
    - Implement filtering by sourceUrl without embedding computation
    - _Requirements: 3.4_

  - [x] 1.4 Write unit tests for new MemoryManager methods
    - Test removeBySourceUrl removes all matching chunks
    - Test searchBySourceUrl returns correct results
    - _Requirements: 3.4, 3.5_

- [x] 2. Checkpoint - Verify Memory Infrastructure extensions
  - Run `pnpm test` and verify no regressions
  - Ensure new methods work correctly
  - Ask user if questions arise

- [x] 3. Implement RAG Pipeline
  - [x] 3.1 Create RAG context module
    - Create `src/lib/agent/rag-context.ts`
    - Implement `RAGConfig` interface with defaults
    - Implement `createRAGConfig()` factory function
    - Implement `calculateKnowledgeBudget()` with formula
    - _Requirements: 1.1, 1.6, 4.1_

  - [x] 3.2 Implement RAG context building
    - Implement `buildRAGContext()` with hybrid search
    - Implement chunk prioritization by relevance score
    - Implement sentence boundary truncation
    - Implement summary header generation
    - _Requirements: 1.1, 1.2, 4.2, 4.3, 4.4_

  - [x] 3.3 Implement RAG context formatting
    - Implement `formatRAGContextForPrompt()` with XML structure
    - Implement `buildRAGContextMessage()` with assistant role and untrusted data prefix
    - Structure output with "User Profile" and "Related Knowledge" sections
    - _Requirements: 1.3, 1.4, 4.5_

  - [x] 3.4 Write property tests for RAG Pipeline
    - **Property 1: Top-K Retrieval Bound**
    - **Property 2: RAG Context Isolation**
    - **Property 3: Source Attribution Completeness**
    - **Property 4: Budget Calculation Correctness**
    - **Property 7: Chunk Prioritization by Score**
    - **Property 8: Sentence Boundary Truncation**
    - **Property 9: RAG Context Structure**
    - **Validates: Requirements 1.1, 1.3, 1.4, 1.6, 4.1, 4.2, 4.3, 4.4, 4.5**

- [x] 4. Implement Auto-Indexer
  - [x] 4.1 Create auto-indexer module
    - Create `src/lib/agent/auto-indexer.ts`
    - Implement `computeContentHash()` for change detection
    - Implement `shouldIndex()` deduplication check
    - Implement `removeExistingChunks()` for URL cleanup
    - _Requirements: 3.4, 3.5_

  - [x] 4.2 Implement page indexing
    - Implement `indexPage()` with chunking and embedding
    - Implement `indexPageAsync()` fire-and-forget wrapper
    - Add logging for indexing completion status
    - _Requirements: 3.1, 3.2, 3.3, 3.6, 3.7_

  - [x] 4.3 Write property tests for Auto-Indexer
    - **Property 5: Page Indexing with Metadata** ✅ PASSED (100 runs)
    - **Property 6: Page Indexing Idempotence** ✅ PASSED (100 runs)
    - **Validates: Requirements 3.1, 3.3, 3.4, 3.5**

- [x] 5. Implement Preference Store
  - [x] 5.1 Create preference store module
    - Create `src/lib/agent/preference-store.ts`
    - Implement `UserPreference` interface
    - Implement `PreferenceStore` interface with CRUD operations
    - Implement singleton `getPreferenceStore()`
    - _Requirements: 5.1, 5.6_

  - [x] 5.2 Implement preference detection
    - Implement `detectPreferenceIntent()` with pattern matching
    - Support patterns: "I'm a [profession]", "explain like I'm a [level]", "I prefer [style]"
    - Extract preference type and content
    - _Requirements: 5.2_

  - [x] 5.3 Implement preference formatting for context
    - Implement `formatForContext()` with token budget
    - Ensure preferences are always included regardless of query
    - _Requirements: 5.3, 5.4_

  - [x] 5.4 Write property tests for Preference Store
    - **Property 10: Preference Detection**
    - **Property 11: Preference Inclusion**
    - **Validates: Requirements 5.2, 5.3, 5.4**

- [x] 6. Checkpoint - Verify core modules
  - Run all tests with `pnpm test`
  - Manually test RAG context building
  - Ask user if questions arise

- [x] 7. Implement Search Enhancement
  - [x] 7.1 Create search enhancement module
    - Create `src/lib/agent/search-enhancement.ts`
    - Implement `EnhancedSearchResult` and `Citation` interfaces
    - Implement `retrieveRelatedMemory()` for memory-first retrieval
    - _Requirements: 6.1_

  - [x] 7.2 Implement synthesis with memory
    - Implement `synthesizeWithMemory()` combining web + memory results
    - Implement conflict detection with disclaimer (best-effort LLM judgment)
    - Implement `formatCitations()` with clear source labeling
    - _Requirements: 6.2, 6.3, 6.4_

  - [x] 7.3 Implement enhanced search main function
    - Implement `enhancedSearch()` orchestrating memory + web search
    - Return combined results with citations
    - _Requirements: 6.1, 6.2, 6.4_

  - [x] 7.4 Write property tests for Search Enhancement
    - **Property 12: Dual Source Citation**
    - **Validates: Requirements 6.4**

- [x] 8. Integrate with Agent Loop
  - [x] 8.1 Extend AgentConfig with RAG settings
    - Add `ragConfig?: RAGConfig` to AgentConfig in `src/lib/agent/types.ts`
    - Add `enableAutoIndex?: boolean` to AgentConfig
    - _Requirements: 2.5_

  - [x] 8.2 Implement safe MemoryManager access
    - Implement `getMemoryManagerSafe()` with error handling
    - Return null on initialization failure, log warning
    - _Requirements: 2.1, 2.4_

  - [x] 8.3 Integrate RAG context into Agent Loop
    - Modify `runAgentLoop()` to check MemoryManager readiness
    - Build RAG context when enabled and ready
    - Inject RAG context as separate assistant message
    - Maintain backward compatibility when RAG disabled
    - _Requirements: 2.2, 2.3, 2.6_

  - [x] 8.4 Integrate auto-indexing into Agent Loop
    - Call `indexPageAsync()` after page analysis
    - Fire-and-forget pattern, do not block response
    - _Requirements: 3.1, 3.6_

  - [x] 8.5 Write integration tests for Agent Loop
    - Test RAG context injection
    - Test fallback when MemoryManager unavailable
    - Test auto-indexing trigger
    - _Requirements: 2.2, 2.3, 2.4_

- [x] 9. Integrate Search Enhancement into tools
  - [x] 9.1 Update search_web_for_info tool
    - Modify `src/lib/agent/tools.ts` to use `enhancedSearch()`
    - Include memory results in search output
    - Format citations with source labels
    - _Requirements: 6.1, 6.2, 6.4_

  - [x] 9.2 Write unit tests for enhanced search tool
    - Test memory retrieval before web search
    - Test citation formatting
    - _Requirements: 6.1, 6.4_

- [x] 10. Checkpoint - Verify Agent integration
  - Run all tests with `pnpm test`
  - Test Agent loop with RAG enabled
  - Test search enhancement with memory
  - Ask user if questions arise

- [ ] 11. Implement Settings UI for Memory
  - [ ] 11.1 Create memory stats component
    - Create memory statistics display in `src/popup/components/settings/`
    - Display document count, index size, last sync time
    - Display embedding model status (Loading/Ready/Error)
    - _Requirements: 7.1, 7.5_

  - [ ] 11.2 Implement relative time formatting
    - Implement `formatRelativeTime()` utility
    - Display last sync as "X minutes/hours/days ago"
    - _Requirements: 7.6_

  - [ ] 11.3 Implement memory management actions
    - Add "Sync Now" button calling MemoryManager.sync()
    - Add "Clear Memory" button with confirmation modal
    - _Requirements: 7.2, 7.3, 7.4_

  - [ ] 11.4 Implement preference management UI
    - Display stored preferences list
    - Add "Clear Preferences" button
    - _Requirements: 5.6_

  - [ ] 11.5 Write property tests for time formatting
    - **Property 13: Relative Time Formatting**
    - **Validates: Requirements 7.6**

- [ ] 12. Final checkpoint - Full integration test
  - Run all tests with `pnpm test`
  - Build extension with `pnpm build`
  - Test full flow: browse page → auto-index → query with RAG → search enhancement
  - Test settings UI memory management
  - Ask user if questions arise

## Notes

- All tasks are required for comprehensive testing from the start
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The implementation order ensures dependencies are available before dependent modules
- VectorStore schema extension (Task 1.1) requires careful migration to avoid data loss

