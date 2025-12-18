# Requirements Document

## Introduction

This specification defines the architectural upgrade of KnowledgeLens from a simple request-response AI assistant to a modern agentic architecture. The upgrade incorporates industry best practices from OpenAI, Anthropic, and Google DeepMind research, including ReAct control loops, context engineering, self-correction patterns, and standardized tool definitions. The goal is to maximize the capabilities of modern LLMs while improving reliability, reducing hallucinations, and enabling more sophisticated reasoning.

## Glossary

- **ReAct Loop**: A control pattern where the agent cycles through Reasoning (thinking), Acting (tool use), and Observing (processing results)
- **Chain of Thought (CoT)**: Explicit step-by-step reasoning generated before taking action
- **Reflexion**: A self-correction pattern where the agent analyzes failures and generates verbal reflections to improve subsequent attempts
- **Agentic RAG**: Retrieval-Augmented Generation with self-correction capabilities including query rewriting and result grading
- **Context Compaction**: Summarizing completed sub-tasks to maintain high signal-to-noise ratio in the context window
- **Tool Schema**: Structured JSON definition of a tool's purpose, inputs, and outputs
- **Grounding**: Providing the agent with persistent context about its environment and previous decisions
- **Trajectory**: The sequence of thoughts, actions, and observations an agent takes to complete a task

## Requirements

### Requirement 1: ReAct Control Loop Implementation

**User Story:** As a user, I want the AI to reason through complex requests step-by-step before acting, so that I get more accurate and well-thought-out responses.

#### Acceptance Criteria

1. WHEN the agent receives a complex request THEN KnowledgeLens SHALL generate an explicit reasoning step before selecting any tool or action
2. WHEN the agent selects a tool THEN KnowledgeLens SHALL log the reasoning that led to that tool selection
3. WHEN a tool returns a result THEN KnowledgeLens SHALL generate an observation step analyzing whether the result meets the goal
4. WHEN the observation indicates incomplete results THEN KnowledgeLens SHALL continue the loop with additional reasoning and actions
5. WHEN the agent determines the goal is achieved THEN KnowledgeLens SHALL generate a final synthesis response
6. WHEN the agent is executing a ReAct loop THEN KnowledgeLens SHALL display real-time status updates in the UI (e.g., "Thinking...", "Searching...", "Analyzing results...")
7. WHEN the ReAct loop exceeds 5 steps THEN KnowledgeLens SHALL terminate and return the best available result with an explanation

### Requirement 2: Structured Tool Definitions

**User Story:** As a developer, I want tools to be defined with clear schemas and descriptions, so that the LLM can reliably select and invoke the correct tool.

#### Acceptance Criteria

1. WHEN defining a tool THEN KnowledgeLens SHALL include a descriptive name based on intent (e.g., `explain_selected_text_with_context` not `get_explanation`)
2. WHEN defining a tool THEN KnowledgeLens SHALL provide a JSON schema for all input parameters with types and descriptions
3. WHEN defining a tool THEN KnowledgeLens SHALL include example invocations in the tool description
4. WHEN a tool receives invalid parameters THEN KnowledgeLens SHALL return a descriptive error message enabling self-correction
5. WHEN serializing tool definitions THEN KnowledgeLens SHALL output valid JSON conforming to the defined schema
6. WHEN parsing tool invocations from LLM output THEN KnowledgeLens SHALL validate against the schema and produce the original tool call structure

### Requirement 3: Self-Correction with Reflexion Pattern

**User Story:** As a user, I want the AI to learn from its mistakes within a session, so that repeated errors are avoided and quality improves over attempts.

#### Acceptance Criteria

1. WHEN an action fails or produces unsatisfactory results THEN KnowledgeLens SHALL prompt the LLM to analyze the failure reason
2. WHEN the LLM generates a failure analysis THEN KnowledgeLens SHALL store the reflection in episodic memory for the current session
3. WHEN retrying an action THEN KnowledgeLens SHALL include relevant reflections from previous failures in the context
4. WHEN the same type of error occurs twice THEN KnowledgeLens SHALL escalate by trying an alternative approach
5. WHEN maximum retry attempts (3) are reached THEN KnowledgeLens SHALL present the best partial result with an explanation to the user
6. WHEN a retry loop is active THEN KnowledgeLens SHALL display estimated token consumption to the user

### Requirement 4: Agentic RAG for Search Enhancement

**User Story:** As a user, I want search-enhanced explanations to self-correct when initial results are poor, so that I always get relevant information.

#### Acceptance Criteria

1. WHEN search results are retrieved THEN KnowledgeLens SHALL grade each result for relevance to the query (relevant/not relevant)
2. WHEN the majority of results are graded as not relevant THEN KnowledgeLens SHALL rewrite the search query and retry
3. WHEN query rewriting occurs THEN KnowledgeLens SHALL use a different search strategy (broader terms, synonyms, or related concepts)
4. WHEN internal search fails after retry THEN KnowledgeLens SHALL fall back to the LLM's internal knowledge with a disclaimer
5. WHEN generating the final response THEN KnowledgeLens SHALL only cite sources that were graded as relevant

### Requirement 5: Context Engineering and Compaction

**User Story:** As a user, I want the AI to maintain coherent context during long interactions, so that it doesn't forget important information or repeat mistakes.

#### Acceptance Criteria

1. WHEN a sub-task is completed THEN KnowledgeLens SHALL generate a summary of the outcome rather than keeping full verbose logs
2. WHEN the context window approaches 80% capacity THEN KnowledgeLens SHALL trigger compaction of older interactions
3. WHEN compacting context THEN KnowledgeLens SHALL preserve key decisions, user preferences, and error reflections
4. WHEN starting a new reasoning cycle THEN KnowledgeLens SHALL include a grounding section with current state and objectives
5. WHEN context is compacted THEN KnowledgeLens SHALL maintain a token count that is at least 20% smaller than before compaction

### Requirement 10: State Persistence for Service Worker

**User Story:** As a user, I want my conversation context to survive browser idle periods, so that I don't lose progress when the extension goes inactive.

#### Acceptance Criteria

1. WHEN agent state changes (trajectory, context, reflections) THEN KnowledgeLens SHALL persist the state to chrome.storage.session immediately
2. WHEN the Service Worker wakes up THEN KnowledgeLens SHALL restore agent state from chrome.storage.session
3. WHEN a session ends (tab closed or explicit reset) THEN KnowledgeLens SHALL clear session-specific state from storage
4. WHEN persisting state THEN KnowledgeLens SHALL use efficient serialization to minimize storage operations
5. WHEN state restoration fails THEN KnowledgeLens SHALL start a fresh session and notify the user

### Requirement 6: Adaptive Response Generation

**User Story:** As a user, I want the AI to adapt its response style based on my interaction pattern, so that I get concise answers when I'm in flow and detailed explanations when I'm exploring.

#### Acceptance Criteria

1. WHEN the user sends short, action-oriented messages THEN KnowledgeLens SHALL respond with concise, direct answers
2. WHEN the user asks clarifying questions or uses exploratory language THEN KnowledgeLens SHALL provide more detailed explanations
3. WHEN the user explicitly requests brevity or detail THEN KnowledgeLens SHALL adjust response length accordingly
4. WHEN generating responses THEN KnowledgeLens SHALL avoid unnecessary preambles and filler phrases

### Requirement 7: Trajectory Logging and Observability

**User Story:** As a developer, I want to trace the agent's reasoning path, so that I can debug issues and improve the system.

#### Acceptance Criteria

1. WHEN the agent executes a reasoning step THEN KnowledgeLens SHALL log the thought with timestamp and step number
2. WHEN the agent invokes a tool THEN KnowledgeLens SHALL log the tool name, parameters, and result summary
3. WHEN the agent generates a reflection THEN KnowledgeLens SHALL log the reflection content and trigger condition
4. WHEN a request completes THEN KnowledgeLens SHALL calculate and log trajectory efficiency (actual steps vs estimated optimal steps)
5. WHEN an error occurs THEN KnowledgeLens SHALL log the full context state at the time of error

### Requirement 8: Prompt Template System

**User Story:** As a developer, I want prompts to be structured and maintainable, so that I can easily update agent behavior without code changes.

#### Acceptance Criteria

1. WHEN defining system prompts THEN KnowledgeLens SHALL use structured sections with clear delimiters (XML tags or Markdown headers)
2. WHEN a prompt template is loaded THEN KnowledgeLens SHALL validate that all required sections are present
3. WHEN injecting context into prompts THEN KnowledgeLens SHALL use named placeholders that are type-checked
4. WHEN the agent needs Chain of Thought THEN KnowledgeLens SHALL include explicit thinking instructions in the prompt template
5. WHEN serializing a prompt template THEN KnowledgeLens SHALL produce a string that can be parsed back to the original template structure

### Requirement 9: Graceful Degradation

**User Story:** As a user, I want the extension to provide useful results even when some components fail, so that I'm not left with nothing.

#### Acceptance Criteria

1. WHEN the search API fails THEN KnowledgeLens SHALL fall back to LLM-only explanation with a notice
2. WHEN the LLM API times out THEN KnowledgeLens SHALL retry with a shorter context or simpler prompt
3. WHEN all retries fail THEN KnowledgeLens SHALL display the last successful partial result if available
4. WHEN operating in degraded mode THEN KnowledgeLens SHALL clearly indicate which features are unavailable
5. WHEN a component recovers THEN KnowledgeLens SHALL automatically restore full functionality

### Requirement 11: Token Budget and Cost Control

**User Story:** As a user, I want to understand and control my API usage costs, so that I don't accidentally exhaust my API quota.

#### Acceptance Criteria

1. WHEN an agentic operation starts THEN KnowledgeLens SHALL estimate and display the maximum potential token cost
2. WHEN tokens are consumed THEN KnowledgeLens SHALL track and display cumulative usage for the current session
3. WHEN the estimated cost exceeds a user-configurable threshold THEN KnowledgeLens SHALL warn the user before proceeding
4. WHEN the ReAct loop or Reflexion retry count reaches the maximum THEN KnowledgeLens SHALL terminate to prevent runaway costs
5. WHEN displaying token usage THEN KnowledgeLens SHALL show both input and output token counts separately

