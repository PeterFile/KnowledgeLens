# Implementation Plan: Memory Infrastructure

## Overview

This plan implements the Memory Infrastructure module in phases: dependencies and build configuration first, then core components (storage, chunker, embedding), followed by the VectorStore and MemoryManager integration. Property-based tests are included as optional sub-tasks to validate correctness properties.

## Tasks

- [x] 1. Project setup and dependencies
  - [x] 1.1 Install required dependencies
    - Install `idb` for IndexedDB wrapper
    - Install `@orama/orama` and `@orama/plugin-data-persistence` for vector search
    - Install `@huggingface/transformers` for embedding computation
    - Install `fast-check` as dev dependency for property-based testing
    - _Requirements: 1.1, 2.1, 3.2_

  - [x] 1.2 Configure Vite for transformers.js bundling
    - Update `vite.config.ts` to handle WASM and ONNX files
    - Configure chunk splitting to keep files under 4MB
    - Add Offscreen Document as separate entry point
    - _Requirements: 5.1, 5.3, 5.4_

  - [x] 1.3 Update manifest.json for Offscreen Document
    - Add offscreen permission
    - Declare Offscreen Document with "WORKERS" reason
    - Add web_accessible_resources for model files
    - _Requirements: 5.2, 5.5_

- [x] 2. Checkpoint - Verify build configuration
  - Run `npm run build` and verify no errors
  - Ensure all assets are correctly bundled
  - Ask user if questions arise

- [x] 3. IndexedDB storage layer
  - [x] 3.1 Implement IndexedDB storage module
    - Create `src/lib/memory/storage.ts`
    - Implement `openDatabase()` with schema migration support
    - Implement `saveSnapshot()` and `loadLatestSnapshot()`
    - Implement `deleteOldSnapshots()` for cleanup
    - Implement `getMetadata()` and `setMetadata()`
    - _Requirements: 1.1, 1.2, 1.6_

  - [x] 3.2 Write unit tests for storage module
    - Test database open/close lifecycle
    - Test snapshot save/load round-trip
    - Test metadata operations
    - Test error handling for IndexedDB failures
    - _Requirements: 1.5_

- [x] 4. HTML Chunker implementation
  - [x] 4.1 Implement chunker module
    - Create `src/lib/memory/chunker.ts`
    - Implement `chunkHtmlContent()` main function
    - Implement `extractTextWithStructure()` for HTML parsing
    - Implement `splitAtSentenceBoundary()` for long sections
    - Implement content filtering (script, style, ads removal)
    - Implement code block preservation logic
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 4.2 Write property tests for chunker
    - **Property 9: Chunk Semantic Boundaries**
    - **Property 10: Chunk Heading Preservation**
    - **Property 11: Chunk Token Bounds**
    - **Property 12: Chunk Sentence Splitting**
    - **Property 13: Chunk Content Filtering**
    - **Property 14: Chunk Code Block Preservation**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6**

- [x] 5. Embedding Service (Offscreen Document)
  - [x] 5.1 Implement embedding service in Offscreen Document
    - Create `src/offscreen/embedding.ts`
    - Implement model initialization with WebGPU preference
    - Implement WASM fallback when WebGPU unavailable
    - Implement `handleEmbeddingRequest()` message handler
    - Update `src/offscreen/offscreen.ts` to integrate embedding service
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 5.2 Implement embedding client
    - Create `src/lib/memory/embedding-client.ts`
    - Implement Offscreen Document lifecycle management
    - Implement request queuing during initialization
    - Implement concurrent request handling with requestId tracking
    - Implement timeout handling (30s)
    - _Requirements: 3.5, 3.6, 3.7_

  - [x] 5.3 Write property tests for embedding service
    - **Property 7: Embedding Performance**
    - **Property 8: Batch Embedding Correctness**
    - **Property 17: Concurrent Embedding Request Isolation**
    - **Property 18: Initialization Request Queuing**
    - **Validates: Requirements 3.5, 3.6, 3.7**

- [x] 6. Checkpoint - Verify embedding service
  - Test embedding computation manually in browser
  - Verify WebGPU/WASM fallback works
  - Ask user if questions arise

- [x] 7. Vector Store implementation
  - [x] 7.1 Implement vector store module
    - Create `src/lib/memory/vector-store.ts`
    - Define Orama schema with vector[384] for embeddings
    - Implement `createVectorStore()` and `restoreFromSnapshot()`
    - Implement `insert()` and `insertBatch()` methods
    - Implement `search()` with hybrid mode support
    - Implement filter support (sourceUrl, time range)
    - Implement `toSnapshot()` using binary persistence
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 7.2 Write property tests for vector store
    - **Property 2: Search Performance**
    - **Property 3: Hybrid Search Correctness**
    - **Property 4: Document Storage Round-Trip**
    - **Property 5: Search Filter Correctness**
    - **Property 6: Index Serialization Round-Trip**
    - **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6, 2.7**

- [x] 8. Memory Manager integration
  - [x] 8.1 Implement Memory Manager singleton
    - Create `src/lib/memory/index.ts`
    - Implement singleton pattern with `getMemoryManager()`
    - Implement `addDocument()` with auto-chunking and embedding
    - Implement `addChunks()` for pre-chunked content
    - Implement `search()` delegating to VectorStore
    - Implement `sync()` for lazy persistence
    - Implement `getStats()` for monitoring
    - Wire up initialization from IndexedDB snapshot
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 8.2 Write property tests for Memory Manager
    - **Property 1: Snapshot Load Performance**
    - **Property 15: Auto-Embedding on Document Add**
    - **Property 16: Singleton Consistency**
    - **Validates: Requirements 1.2, 6.4, 6.5**

  - [x] 8.3 Write integration tests
    - Test full flow: addDocument → search → sync → restore
    - Test error recovery scenarios
    - Test concurrent access patterns
    - _Requirements: 1.3, 1.4, 1.5_

- [x] 9. Export types and update module index
  - [x] 9.1 Create type definitions
    - Add memory-related types to `src/types/index.ts`
    - Export Document, Chunk, SearchOptions, SearchResult, MemoryStats
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 9.2 Create module barrel export
    - Create `src/lib/memory/types.ts` for internal types
    - Update `src/lib/memory/index.ts` to export public API
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 10. Final checkpoint - Full integration test
  - Run all tests with `npm test`
  - Verify extension loads correctly with new modules
  - Test memory persistence across extension reload
  - Ask user if questions arise

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The implementation order ensures dependencies are available before dependent modules
