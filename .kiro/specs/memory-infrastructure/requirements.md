# Requirements Document

## Introduction

This document defines the requirements for the Memory Infrastructure module - the foundational layer of KnowledgeLens's Zero-Amnesia learning system. This module provides local-first vector storage, full-text search, and browser-based embedding computation capabilities, enabling millisecond-level context recovery and privacy-preserving knowledge management.

## Glossary

- **Memory_Store**: The core storage abstraction that manages both in-memory Orama indices and IndexedDB persistence
- **Vector_Store**: Component responsible for vector similarity search using Orama's vector search capabilities
- **Embedding_Service**: Service running in Offscreen Document that computes text embeddings using transformers.js with WebGPU acceleration
- **Chunk**: A semantically meaningful segment of text extracted from web pages, optimized for retrieval
- **Snapshot**: A serialized binary representation of the Orama index stored in IndexedDB for persistence
- **Hybrid_Search**: Combined BM25 keyword search and cosine similarity vector search for improved recall

## Requirements

### Requirement 1: IndexedDB Persistence Layer

**User Story:** As a user, I want my reading history and knowledge to persist across browser sessions, so that I don't lose my learning context when I close the browser.

#### Acceptance Criteria

1. THE Memory_Store SHALL use IndexedDB via the `idb` library for persistent storage
2. WHEN the extension starts, THE Memory_Store SHALL load the latest snapshot from IndexedDB within 200ms
3. WHEN the extension is about to unload, THE Memory_Store SHALL persist the current index state to IndexedDB
4. WHEN an Agent task completes, THE Memory_Store SHALL trigger a lazy persistence operation
5. IF IndexedDB storage fails, THEN THE Memory_Store SHALL log the error and continue operating with in-memory data only
6. THE Memory_Store SHALL support storing snapshots up to 100MB in size

### Requirement 2: Orama Vector Store Integration

**User Story:** As a user, I want fast and accurate search across my reading history, so that I can quickly find relevant information from past sessions.

#### Acceptance Criteria

1. THE Vector_Store SHALL use Orama as the indexing engine for both vector and full-text search
2. WHEN a search query is executed, THE Vector_Store SHALL return results within 50ms for indices up to 10,000 documents
3. THE Vector_Store SHALL support hybrid search combining BM25 keyword matching and cosine similarity
4. WHEN adding a document, THE Vector_Store SHALL store the text content, embedding vector, source URL, and timestamp
5. THE Vector_Store SHALL support filtering search results by source URL or time range
6. WHEN serializing the index, THE Vector_Store SHALL produce a binary snapshot compatible with IndexedDB storage
7. WHEN deserializing a snapshot, THE Vector_Store SHALL restore the full index state including all vectors

### Requirement 3: Embedding Service via Offscreen Document

**User Story:** As a user, I want text embeddings computed locally in my browser, so that my data stays private and I get fast responses without network latency.

#### Acceptance Criteria

1. THE Embedding_Service SHALL run in an Offscreen Document to access WebGPU capabilities
2. THE Embedding_Service SHALL use transformers.js v3 with a quantized embedding model
3. WHEN computing embeddings, THE Embedding_Service SHALL prefer WebGPU acceleration when available
4. IF WebGPU is unavailable, THEN THE Embedding_Service SHALL fall back to WASM execution
5. WHEN the Embedding_Service receives a text input, THE Embedding_Service SHALL return a normalized vector within 100ms for texts under 512 tokens
6. THE Embedding_Service SHALL support batch embedding of multiple texts in a single call
7. WHEN the extension starts, THE Embedding_Service SHALL preload the embedding model to reduce first-inference latency

### Requirement 4: Smart Chunking for Web Content

**User Story:** As a user, I want web pages to be intelligently segmented, so that search results return meaningful and contextually complete snippets.

#### Acceptance Criteria

1. THE Chunker SHALL segment HTML content based on semantic structure (headings, paragraphs, lists)
2. WHEN chunking content, THE Chunker SHALL preserve heading hierarchy as metadata for each chunk
3. THE Chunker SHALL produce chunks between 100 and 500 tokens in length
4. WHEN a semantic section exceeds 500 tokens, THE Chunker SHALL split it at sentence boundaries
5. THE Chunker SHALL remove script, style, and advertisement elements before chunking
6. WHEN chunking, THE Chunker SHALL preserve code blocks as single chunks regardless of length

### Requirement 5: Vite Build Configuration

**User Story:** As a developer, I want transformers.js assets properly bundled in the extension, so that the embedding service works correctly in production.

#### Acceptance Criteria

1. THE Build_System SHALL configure Vite to bundle transformers.js WASM and ONNX model files
2. THE Build_System SHALL place model files in the extension's web_accessible_resources
3. WHEN building for production, THE Build_System SHALL apply appropriate chunking to keep individual files under 4MB
4. THE Build_System SHALL configure the Offscreen Document as a separate entry point
5. THE manifest.json SHALL declare the Offscreen Document with the "WORKERS" reason for WebGPU access

### Requirement 6: Memory Manager Interface

**User Story:** As a developer, I want a clean interface to the memory system, so that other modules can easily store and retrieve knowledge.

#### Acceptance Criteria

1. THE Memory_Manager SHALL expose an `addDocument(content, metadata)` method for indexing new content
2. THE Memory_Manager SHALL expose a `search(query, options)` method for hybrid retrieval
3. THE Memory_Manager SHALL expose a `getStats()` method returning document count, index size, and last sync time
4. WHEN `addDocument` is called, THE Memory_Manager SHALL automatically compute embeddings via the Embedding_Service
5. THE Memory_Manager SHALL implement a singleton pattern to ensure consistent state across the extension
6. WHEN the Memory_Manager is initialized, THE Memory_Manager SHALL restore state from the latest IndexedDB snapshot
