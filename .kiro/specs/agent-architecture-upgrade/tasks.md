# Implementation Plan

- [x] 1. Set up agent module structure and core types





  - Create `src/lib/agent/` directory structure
  - Define core TypeScript interfaces: `AgentConfig`, `AgentStep`, `AgentTrajectory`, `AgentStatus`
  - Define tool-related types: `ToolSchema`, `ToolCall`, `ToolResult`
  - Define state types: `AgentState`, `AgentContext`, `EpisodicMemory`
  - _Requirements: 1.1, 2.1, 2.2, 7.1_

- [x] 2. Implement Token Tracker








  - [x] 2.1 Create token estimation and tracking functions




    - Implement `estimateTokens()` for operation cost prediction
    - Implement `trackUsage()` for cumulative tracking
    - Implement `isBudgetExceeded()` and `isWarningThreshold()` checks
    - Implement `formatUsage()` for UI display
    - _Requirements: 11.1, 11.2, 11.3, 11.5_
  - [x] 2.2 Write property test for token budget enforcement





    - **Property 15: Token Budget Enforcement**
    - **Validates: Requirements 11.4**d

- [-] 3. Implement Prompt Template System






  - [ ] 3.1 Create prompt template parser and renderer
    - Implement `loadTemplate()` with section validation
    - Implement `validateTemplate()` for required sections
    - Implement `renderTemplate()` with placeholder injection
    - Implement `parseTemplate()` and `serializeTemplate()` for round-trip
    - Create pre-defined templates: REACT_SYSTEM, REFLECTION, RESULT_GRADING, QUERY_REWRITE, CONTEXT_COMPACTION
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [x] 3.2 Write property test for prompt template round-trip






    - **Property 16: Prompt Template Round-Trip**
    - **Validates: Requirements 8.5**

- [x] 4. Implement Tool Manager






  - [x] 4.1 Create tool registry and validation

    - Implement `registerTool()` for tool registration
    - Implement `getToolSchemas()` for LLM prompt generation
    - Implement `validateToolCall()` against JSON schema
    - Implement `parseToolCall()` and `serializeToolCall()` for round-trip
    - _Requirements: 2.1, 2.2, 2.3_
  - [x] 4.2 Write property test for tool definition round-trip






    - **Property 4: Tool Definition Round-Trip**
    - **Validates: Requirements 2.5, 2.6**
  - [x] 4.3 Write property test for tool validation






    - **Property 5: Tool Validation Rejects Invalid Input**
    - **Validates: Requirements 2.4**

  - [x] 4.4 Register existing tools with new schema format

    - Convert `explain_text_with_context` to new format
    - Convert `search_web_for_info` to new format
    - Convert `summarize_page_content` to new format
    - Convert `extract_screenshot_text` to new format
    - Add `grade_search_results` tool
    - Add `rewrite_search_query` tool
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 5. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement State Manager






  - [x] 6.1 Create state persistence functions

    - Implement `saveState()` to chrome.storage.session
    - Implement `loadState()` from chrome.storage.session
    - Implement `clearState()` for session cleanup
    - Implement `createSession()` for new sessions
    - Implement `isValidState()` for state validation
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
  - [x] 6.2 Write property test for state persistence round-trip






    - **Property 12: State Persistence Round-Trip**
    - **Validates: Requirements 10.1, 10.2**

- [x] 7. Implement Context Manager






  - [x] 7.1 Create context management functions

    - Implement `createContext()` with initial grounding
    - Implement `addToContext()` for entry addition
    - Implement `needsCompaction()` for 80% threshold check
    - Implement `compactContext()` with LLM summarization
    - Implement `generateGrounding()` for new cycles
    - Implement `serializeContext()` for LLM prompts
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - [x] 7.2 Write property test for context compaction






    - **Property 10: Context Compaction Reduces Tokens**
    - **Validates: Requirements 5.5**
  - [x] 7.3 Write property test for grounding preservation






    - **Property 11: Grounding Preservation**
    - **Validates: Requirements 5.3, 5.4**

- [x] 8. Implement Reflection Manager






  - [x] 8.1 Create reflection and episodic memory functions

    - Implement `generateReflection()` for failure analysis
    - Implement `getRelevantReflections()` for context injection
    - Implement `isRepeatedError()` for escalation detection
    - Implement `suggestAlternative()` for repeated errors
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [x] 8.2 Write property test for reflection storage






    - **Property 6: Reflection Storage**
    - **Validates: Requirements 3.2, 3.3**

- [x] 9. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [-] 10. Implement Agentic RAG





  - [x] 10.1 Create search result grading and query rewriting

    - Implement `gradeResults()` for relevance scoring
    - Implement `rewriteQuery()` for failed searches
    - Implement `agenticRAG()` main function with retry logic
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - [x] 10.2 Write property test for search result grading






    - **Property 7: Search Result Grading**
    - **Validates: Requirements 4.1**

  - [x] 10.3 Write property test for query rewriting






    - **Property 8: Query Rewriting on Low Relevance**
    - **Validates: Requirements 4.2, 4.3**
  - [x] 10.4 Write property test for citation integrity






    - **Property 9: Citation Integrity**
    - **Validates: Requirements 4.5**
  - [x] 10.5 Write property test for search fallback






    - **Property 14: Search Fallback Behavior**
    - **Validates: Requirements 4.4, 9.1**

- [x] 11. Implement Trajectory Logger






  - [x] 11.1 Create trajectory logging functions


    - Implement `logStep()` for step recording
    - Implement `calculateEfficiency()` for metrics
    - Implement `exportLog()` for debugging
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - [x] 11.2 Write property test for trajectory logging completeness





    - **Property 13: Trajectory Logging Completeness**
    - **Validates: Requirements 7.1, 7.2, 7.3**

- [x] 12. Implement Agent Loop




  - [x] 12.1 Create core ReAct loop


    - Implement `runAgentLoop()` main function
    - Implement `isGoalAchieved()` for completion detection
    - Implement `shouldContinue()` for termination logic
    - Integrate with Tool Manager, Context Manager, Reflection Manager
    - Integrate status callbacks for UI updates
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_
  - [x]* 12.2 Write property test for bounded execution
    - **Property 1: Bounded Execution**
    - **Validates: Requirements 1.7, 3.5**
  - [x]* 12.3 Write property test for reasoning before action
    - **Property 2: Reasoning Before Action**
    - **Validates: Requirements 1.1, 1.2**
  - [x]* 12.4 Write property test for observation after action
    - **Property 3: Observation After Action**
    - **Validates: Requirements 1.3**
  - [x]* 12.5 Write property test for status update emission
    - **Property 17: Status Update Emission**
    - **Validates: Requirements 1.6**

- [ ] 13. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Integrate Agent with Background Service Worker





  - [x] 14.1 Update message handlers for agent operations


    - Add `agent_execute` message type
    - Add `agent_cancel` message type
    - Add `agent_get_status` message type
    - Integrate state persistence on Service Worker wake
    - _Requirements: 10.2, 1.6_

  - [x] 14.2 Implement graceful degradation

    - Add fallback logic for LLM timeout
    - Add fallback logic for search failure
    - Add degraded mode indicators
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 15. Update UI Components for Agent Status



  - [x] 15.1 Create AgentStatusDisplay component


    - Display current phase (Thinking, Executing, Analyzing, etc.)
    - Display step progress (current/max)
    - Display token usage with budget indicator
    - Display warnings and errors
    - _Requirements: 1.6, 3.6, 11.1, 11.2_


  - [x] 15.2 Update Sidebar to use agent status
    - Integrate AgentStatusDisplay into Sidebar
    - Add cancel button for active operations
    - Show partial results during execution
    - _Requirements: 1.6, 9.3_

  - [x] 15.3 Update Popup to use agent status

    - Integrate AgentStatusDisplay into SummaryView
    - Add token usage display to settings
    - Add budget configuration to settings
    - _Requirements: 11.1, 11.3_

- [ ] 16. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Update existing features to use Agent architecture






  - [x] 17.1 Migrate page summarization to agent

    - Create summarization goal handler
    - Use ReAct loop for complex pages
    - Maintain backward compatibility for simple summaries
    - _Requirements: 1.1, 1.5_


  - [x] 17.2 Migrate text explanation to agent
    - Create explanation goal handler
    - Integrate Agentic RAG for search-enhanced explanations


    - Add reflection for failed explanations
    - _Requirements: 1.1, 4.1, 3.1_
  - [x] 17.3 Migrate screenshot processing to agent
    - Create screenshot analysis goal handler
    - Use ReAct loop for complex images
    - _Requirements: 1.1, 1.5_

- [ ] 18. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
