# Requirements Document

## Introduction

This document defines the requirements for the Agent Memory Integration module - Phase 2 of KnowledgeLens's Zero-Amnesia learning system. This module connects the Agent Loop with the Memory Infrastructure, enabling context-aware reasoning through RAG (Retrieval-Augmented Generation) and automatic knowledge indexing during page analysis.

The goal is to transform the Agent from a stateless processor into a knowledge-aware assistant that remembers past interactions and leverages accumulated knowledge for better responses.

## Glossary

- **Agent_Loop**: The core execution engine in `src/lib/agent/loop.ts` that orchestrates thinking, executing, and reflecting phases
- **Memory_Manager**: The singleton interface from `src/lib/memory/index.ts` that provides document storage and retrieval
- **RAG_Pipeline**: Retrieval-Augmented Generation pipeline that enriches prompts with relevant context from the Memory_Manager
- **Context_Window**: The portion of the prompt dedicated to retrieved knowledge chunks
- **Auto_Index**: Automatic indexing of web page content when the Agent analyzes it
- **Knowledge_Chunk**: A semantically meaningful segment of text stored in the vector database
- **User_Preference**: A special document type storing user background, expertise level, and preferences
- **RAG_Context_Block**: A dedicated message block (separate from system prompt) containing retrieved knowledge to prevent prompt injection

## Requirements

### Requirement 1: RAG Pipeline Integration

**User Story:** As a user, I want the Agent to automatically retrieve relevant knowledge from my reading history when answering questions, so that responses are informed by context I've previously encountered.

#### Acceptance Criteria

1. WHEN the Agent receives a user query, THE RAG_Pipeline SHALL retrieve the top-k most relevant chunks from Memory_Manager (configurable, default: 5)
2. THE RAG_Pipeline SHALL use hybrid search (BM25 + vector similarity) for retrieval
3. WHEN retrieved chunks exist, THE RAG_Pipeline SHALL inject them into a dedicated RAG_Context_Block (separate from system prompt) to prevent prompt injection
4. THE RAG_Pipeline SHALL format retrieved chunks with source attribution (URL, title, timestamp)
5. IF no relevant knowledge chunks are found (similarity score below threshold), THEN THE RAG_Pipeline SHALL proceed with only user preferences (if any)
6. THE RAG_Pipeline SHALL calculate available budget as: total_available = model_context_limit - system_prompt - user_query - response_reserve; then knowledge_budget = min(base_budget, (total_available - preference_budget) * 0.3)

### Requirement 2: Agent Loop Context Source Refactoring

**User Story:** As a developer, I want the Agent Loop to use MemoryManager as its context source, so that the architecture supports persistent knowledge retrieval.

#### Acceptance Criteria

1. THE Agent_Loop SHALL use the global MemoryManager singleton via `getMemoryManager()`
2. WHEN building the context for LLM calls, THE Agent_Loop SHALL query MemoryManager instead of using static arrays
3. THE Agent_Loop SHALL maintain backward compatibility with existing context injection methods
4. WHEN MemoryManager initialization fails (returns null or throws), THE Agent_Loop SHALL log a warning and operate without RAG enhancement
5. THE Agent_Loop SHALL expose a method to configure RAG parameters (top-k, similarity threshold, token budget)
6. THE Agent_Loop SHALL check MemoryManager readiness via `getStats().embeddingModelLoaded` before attempting RAG retrieval

**Note:** This requirement introduces new interface extensions to MemoryManager that will be added as part of this spec's implementation:
- `getStats().embeddingModelLoaded: boolean` - embedding service readiness status
- `removeBySourceUrl(url: string): Promise<number>` - delete all chunks for a URL
- `sync(): Promise<void>` - already exists in Memory Infrastructure spec

### Requirement 3: Automatic Page Indexing

**User Story:** As a user, I want web pages I read to be automatically indexed, so that the Agent can reference them in future conversations without manual action.

#### Acceptance Criteria

1. WHEN the Agent analyzes a web page for summarization, THE Auto_Index SHALL store the page content in Memory_Manager
2. THE Auto_Index SHALL use the Chunker to segment page content before storage
3. THE Auto_Index SHALL store metadata including source URL, page title, and indexing timestamp
4. THE Auto_Index SHALL deduplicate at the page level: before indexing, check if any chunks with the same sourceUrl exist
5. IF a URL already exists with different content hash, THEN THE Auto_Index SHALL delete all existing chunks for that URL and insert new chunks (full replacement)
6. THE Auto_Index SHALL operate asynchronously using fire-and-forget pattern, allowing eventual consistency (indexed content may not be immediately retrievable)
7. THE Auto_Index SHALL log indexing completion status for debugging purposes

### Requirement 4: Context Window Management

**User Story:** As a user, I want the Agent to intelligently manage context size, so that responses remain fast and relevant without exceeding token limits.

#### Acceptance Criteria

1. THE Context_Window SHALL calculate budgets in order: preference_budget (fixed 500) → knowledge_budget = min(2000, remaining * 0.3)
2. WHEN retrieved chunks exceed the knowledge token budget, THE Context_Window SHALL prioritize by relevance score, including highest-scoring chunks first
3. THE Context_Window SHALL truncate individual chunks at sentence boundaries if needed to fit budget
4. THE Context_Window SHALL include a summary header indicating how many chunks were retrieved vs. included (e.g., "Showing 3 of 7 relevant sources")
5. THE Context_Window SHALL structure the RAG_Context_Block with two sections: "User Profile" (preferences) followed by "Related Knowledge" (chunks)

### Requirement 5: User Preference Memory

**User Story:** As a user, I want the Agent to remember my preferences and expertise level, so that explanations are automatically tailored to my background.

#### Acceptance Criteria

1. THE Memory_Manager SHALL support storing user preference documents with a special "preference" document type
2. WHEN the Agent detects explicit user preferences (e.g., "I'm a software engineer", "explain like I'm a beginner"), THE Agent SHALL store this as a preference
3. WHEN building context, THE RAG_Pipeline SHALL always include user preferences in the "User Profile" section of RAG_Context_Block, independent of similarity-based retrieval
4. THE User_Preference retrieval SHALL have its own reserved token budget (fixed: 500 tokens), deducted before calculating knowledge chunk budget
5. THE Agent SHALL use stored preferences to adjust explanation depth and terminology
6. THE User SHALL be able to view and clear stored preferences through the settings UI

### Requirement 6: Search Enhancement with Memory

**User Story:** As a user, I want the search enhancement feature to consider my reading history, so that search results are contextualized with my prior knowledge.

#### Acceptance Criteria

1. WHEN performing search enhancement, THE Agent SHALL first query Memory_Manager for related content
2. THE Agent SHALL synthesize search results with relevant stored knowledge
3. WHEN stored knowledge appears to conflict with search results, THE Agent SHALL note the discrepancy with a disclaimer (best-effort LLM judgment, not guaranteed accuracy)
4. THE Agent SHALL cite both web sources and stored knowledge sources in responses with clear labeling

### Requirement 7: Memory Statistics and Monitoring

**User Story:** As a user, I want to see statistics about my knowledge base, so that I understand what the Agent remembers.

#### Acceptance Criteria

1. THE Settings_UI SHALL display memory statistics from MemoryManager.getStats(): document count, index size in bytes, and last persistence time
2. THE Settings_UI SHALL provide a button to manually trigger memory persistence via MemoryManager.sync()
3. THE Settings_UI SHALL provide a button to clear all stored memory
4. WHEN clearing memory, THE System SHALL require user confirmation via a modal dialog
5. THE Settings_UI SHALL display the embedding model status: "Loading", "Ready", or "Error" based on MemoryManager.getStats().embeddingModelLoaded (true = "Ready", false = "Loading" or "Error" based on initialization state)
6. THE Settings_UI SHALL display the last persistence timestamp from MemoryManager.getStats().lastSyncTime, formatted as relative time (e.g., "5 minutes ago")

