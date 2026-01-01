// Background service worker for KnowledgeLens
// Handles API requests, message routing, and cross-origin communication
// Requirements: 1.1, 1.3, 1.4, 2.2, 3.2, 3.3, 4.2, 4.3, 4.4, 9.2, 10.2, 1.6

import type {
  ExtensionMessage,
  ExtensionResponse,
  StreamingMessage,
  AgentStatusMessage,
  SummarizePayload,
  ExplainPayload,
  SearchEnhancePayload,
  CaptureScreenshotPayload,
  ExtractScreenshotPayload,
  NoteCardPayload,
  CancelRequestPayload,
  AgentExecutePayload,
  AgentCancelPayload,
  AgentGetStatusPayload,
  DeepDivePayload,
  StoredSettings,
} from '../types';
import { loadSettings } from '../lib/storage';
import * as requestManager from '../lib/request-manager';
import { captureAndCropScreenshot, ensureOffscreenDocument } from '../lib/screenshot';
import type { NoteCardData } from '../lib/notecard';
import {
  runAgentLoop,
  createAgentConfig,
  getFinalResponse,
  createSession,
  saveState,
  loadState,
  createContext,
  createEpisodicMemory,
  DEFAULT_AGENT_CONFIG,
  handleSummarizeGoal,
  handleExplainGoal,
  handleScreenshotGoal,
  handleNoteCardGoal,
  handleDeepDiveGoal,
} from '../lib/agent';
import type { AgentState, AgentStatus } from '../lib/agent';

console.log('KnowledgeLens background service worker loaded');

// ============================================================================
// Settings Cache - Avoids repeated chrome.storage.local reads
// ============================================================================
let cachedSettings: StoredSettings | null = null;

// ============================================================================
// Agent State Management
// Requirements: 10.2 - Restore state on Service Worker wake
// ============================================================================
const activeAgentSessions = new Map<
  string,
  {
    state: AgentState;
    controller: AbortController;
  }
>();

/**
 * Restore agent state on Service Worker wake
 * Requirements: 10.2 - Restore agent state from chrome.storage.session
 */
async function restoreAgentSessions(): Promise<void> {
  try {
    const all = await chrome.storage.session.get(null);
    const sessionKeys = Object.keys(all).filter((key) => key.startsWith('agent_state_'));

    for (const key of sessionKeys) {
      const sessionId = key.replace('agent_state_', '');
      const state = await loadState(sessionId);
      if (state && state.trajectory?.status === 'running') {
        // Session was interrupted - mark as terminated
        const updatedState: AgentState = {
          ...state,
          trajectory: state.trajectory ? { ...state.trajectory, status: 'terminated' } : null,
          lastUpdated: Date.now(),
        };
        await saveState(updatedState);
        console.log(`Restored and terminated interrupted session: ${sessionId}`);
      }
    }
  } catch (error) {
    console.error('Failed to restore agent sessions:', error);
  }
}

// Restore sessions on startup
restoreAgentSessions();

// Initialize cache on startup
loadSettings().then((settings) => {
  cachedSettings = settings;
});

// Listen for storage changes to keep cache in sync
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.knowledgelens_settings) {
    cachedSettings = changes.knowledgelens_settings.newValue ?? null;
  }
});

/**
 * Get settings from cache, falling back to storage if needed
 */
async function getSettings(): Promise<StoredSettings | null> {
  if (cachedSettings !== null) {
    return cachedSettings;
  }
  cachedSettings = await loadSettings();
  return cachedSettings;
}

// Note: System prompts have been moved to goal-handlers.ts for better organization

// ============================================================================
// Streaming Message Utilities
// ============================================================================

/**
 * Send streaming message to popup and optionally to a specific tab
 */
function sendStreamingMessage(message: StreamingMessage, tabId?: number): void {
  if (tabId) {
    chrome.tabs.sendMessage(tabId, message).catch(() => {
      // Tab might be closed, ignore
    });
  }
  // Also broadcast to popup
  chrome.runtime.sendMessage(message).catch(() => {
    // Popup might be closed, ignore
  });
}

/**
 * Send agent status message to popup and optionally to a specific tab
 * Requirements: 1.6 - Display real-time status updates in the UI
 */
function sendAgentStatusMessage(message: AgentStatusMessage, tabId?: number): void {
  if (tabId) {
    chrome.tabs.sendMessage(tabId, message).catch(() => {
      // Tab might be closed, ignore
    });
  }
  // Also broadcast to popup
  chrome.runtime.sendMessage(message).catch(() => {
    // Popup might be closed, ignore
  });
}

// ============================================================================
// Request Handlers
// ============================================================================

/**
 * Handle page summarization request
 * Uses agent architecture with goal handlers for complex pages
 * Maintains backward compatibility for simple summaries
 * Requirements: 1.1, 1.3, 1.4, 1.5
 */
async function handleSummarize(
  payload: SummarizePayload,
  sendResponse: (response: ExtensionResponse) => void,
  tabId?: number
): Promise<void> {
  const settings = await getSettings();
  if (!settings?.llmConfig?.apiKey) {
    sendResponse({
      success: false,
      error: 'LLM API key not configured. Please add your API key in settings.',
      requestId: '',
    });
    return;
  }

  const request = payload.requestId
    ? requestManager.create(payload.requestId)
    : requestManager.create();

  sendResponse({
    success: true,
    data: { requestId: request.id, status: 'started' },
    requestId: request.id,
  });

  sendStreamingMessage(
    {
      type: 'streaming_start',
      requestId: request.id,
    },
    tabId
  );

  try {
    // Use the new goal handler which decides between simple and agent-based approach
    // Always send agent status updates for real-time UI feedback
    const result = await handleSummarizeGoal(
      {
        content: payload.content,
        pageUrl: payload.pageUrl,
      },
      settings.llmConfig,
      (status) => {
        // Always send agent status updates for real-time UI feedback
        sendAgentStatusMessage(
          {
            type: 'agent_status_update',
            sessionId: request.id,
            phase: status.phase,
            stepNumber: status.stepNumber,
            maxSteps: status.maxSteps,
            tokenUsage: status.tokenUsage,
            currentTool: status.currentTool,
          },
          tabId
        );
      },
      (chunk) => {
        sendStreamingMessage(
          {
            type: 'streaming_chunk',
            requestId: request.id,
            chunk,
          },
          tabId
        );
      },
      request.controller.signal,
      settings.language || 'en'
    );

    // Send the final response as streaming chunks for UI compatibility

    sendStreamingMessage(
      {
        type: 'streaming_end',
        requestId: request.id,
        content: result.response,
      },
      tabId
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return;
    }

    sendStreamingMessage(
      {
        type: 'streaming_error',
        requestId: request.id,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      tabId
    );
  } finally {
    requestManager.complete(request.id);
  }
}

/**
 * Handle Deep Dive Request
 */
async function handleDeepDive(
  payload: DeepDivePayload,
  sendResponse: (response: ExtensionResponse) => void,
  tabId?: number
): Promise<void> {
  const settings = await getSettings();
  if (!settings?.llmConfig?.apiKey) {
    sendResponse({
      success: false,
      error: 'LLM API key not configured',
      requestId: payload.requestId,
    });
    return;
  }

  const deepDiveRequestId = `${payload.requestId}_deep_dive`;
  const request = requestManager.create(deepDiveRequestId);

  sendResponse({
    success: true,
    data: { requestId: deepDiveRequestId, status: 'started' },
    requestId: deepDiveRequestId,
  });

  sendStreamingMessage(
    {
      type: 'streaming_start',
      requestId: deepDiveRequestId,
    },
    tabId
  );

  try {
    const result = await handleDeepDiveGoal(
      {
        content: payload.content,
        pageUrl: payload.pageUrl,
      },
      settings.llmConfig,
      (status) => {
        // Optional: send status updates
        void status;
      },
      (chunk) => {
        sendStreamingMessage(
          {
            type: 'streaming_chunk',
            requestId: deepDiveRequestId,
            chunk,
          },
          tabId
        );
      },
      request.controller.signal,
      settings.language || 'en'
    );

    sendStreamingMessage(
      {
        type: 'streaming_end',
        requestId: deepDiveRequestId,
        content: result.response,
      },
      tabId
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return;
    }

    sendStreamingMessage(
      {
        type: 'streaming_error',
        requestId: deepDiveRequestId,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      tabId
    );
  } finally {
    requestManager.complete(deepDiveRequestId);
  }
}

/**
 * Handle contextual text explanation request
 * Uses agent architecture with goal handlers
 * Requirements: 1.1, 3.1, 3.2, 3.3
 */
async function handleExplain(
  payload: ExplainPayload,
  sendResponse: (response: ExtensionResponse) => void,
  tabId?: number
): Promise<void> {
  const settings = await getSettings();
  if (!settings?.llmConfig?.apiKey) {
    sendResponse({
      success: false,
      error: 'LLM API key not configured. Please add your API key in settings.',
      requestId: '',
    });
    return;
  }

  const request = requestManager.create();

  sendResponse({
    success: true,
    data: { requestId: request.id, status: 'started' },
    requestId: request.id,
  });

  sendStreamingMessage(
    {
      type: 'streaming_start',
      requestId: request.id,
    },
    tabId
  );

  // Track if agent loop is used for status updates
  let usedAgent = false;

  try {
    // Use the new goal handler for explanation
    const result = await handleExplainGoal(
      {
        text: payload.text,
        context: payload.context,
        useSearch: false, // Simple explanation without search
      },
      settings.llmConfig,
      (status) => {
        // Send agent status updates if using agent loop
        if (usedAgent) {
          sendAgentStatusMessage(
            {
              type: 'agent_status_update',
              sessionId: request.id,
              phase: status.phase,
              stepNumber: status.stepNumber,
              maxSteps: status.maxSteps,
              tokenUsage: status.tokenUsage,
              currentTool: status.currentTool,
            },
            tabId
          );
        }
      },
      (chunk) => {
        sendStreamingMessage(
          {
            type: 'streaming_chunk',
            requestId: request.id,
            chunk,
          },
          tabId
        );
      },
      request.controller.signal,
      settings.language || 'en'
    );

    usedAgent = result.usedAgent;

    sendStreamingMessage(
      {
        type: 'streaming_end',
        requestId: request.id,
        content: result.response,
      },
      tabId
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return;
    }

    sendStreamingMessage(
      {
        type: 'streaming_error',
        requestId: request.id,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      tabId
    );
  } finally {
    requestManager.complete(request.id);
  }
}
/**
 * Handle search-enhanced explanation request
 * Uses agent architecture with Agentic RAG for search-enhanced explanations
 * Requirements: 1.1, 4.1, 4.2, 4.3, 4.4
 */
async function handleSearchEnhance(
  payload: SearchEnhancePayload,
  sendResponse: (response: ExtensionResponse) => void,
  tabId?: number
): Promise<void> {
  const settings = await getSettings();
  if (!settings?.llmConfig?.apiKey) {
    sendResponse({
      success: false,
      error: 'LLM API key not configured. Please add your API key in settings.',
      requestId: '',
    });
    return;
  }

  const request = requestManager.create();

  sendResponse({
    success: true,
    data: { requestId: request.id, status: 'started' },
    requestId: request.id,
  });

  sendStreamingMessage(
    {
      type: 'streaming_start',
      requestId: request.id,
    },
    tabId
  );

  try {
    // Use the new goal handler with search enabled
    // This uses Agentic RAG for search result grading and query rewriting
    // Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
    const result = await handleExplainGoal(
      {
        text: payload.text,
        context: payload.context,
        useSearch: true, // Enable search-enhanced explanation with Agentic RAG
        searchConfig: settings.searchConfig, // Pass search config for Agentic RAG
      },
      settings.llmConfig,
      (status) => {
        // Send agent status updates
        sendAgentStatusMessage(
          {
            type: 'agent_status_update',
            sessionId: request.id,
            phase: status.phase,
            stepNumber: status.stepNumber,
            maxSteps: status.maxSteps,
            tokenUsage: status.tokenUsage,
            currentTool: status.currentTool,
          },
          tabId
        );
      },
      (chunk) => {
        sendStreamingMessage(
          {
            type: 'streaming_chunk',
            requestId: request.id,
            chunk,
          },
          tabId
        );
      },
      request.controller.signal,
      settings.language || 'en'
    );

    sendStreamingMessage(
      {
        type: 'streaming_end',
        requestId: request.id,
        content: result.response,
      },
      tabId
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return;
    }

    sendStreamingMessage(
      {
        type: 'streaming_error',
        requestId: request.id,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      tabId
    );
  } finally {
    requestManager.complete(request.id);
  }
}

/**
 * Handle request cancellation
 * Requirement: 9.2
 */
function handleCancelRequest(
  payload: CancelRequestPayload,
  sendResponse: (response: ExtensionResponse) => void
): void {
  const cancelled = requestManager.cancel(payload.requestId);
  sendResponse({
    success: cancelled,
    data: { cancelled },
    requestId: payload.requestId,
    ...(cancelled ? {} : { error: 'Request not found or already completed' }),
  } as ExtensionResponse);
}

/**
 * Handle screenshot capture request
 * Uses chrome.tabs.captureVisibleTab and offscreen document for cropping
 * Requirements: 5.2, 5.3
 */
async function handleCaptureScreenshot(
  payload: CaptureScreenshotPayload,
  sendResponse: (response: ExtensionResponse) => void
): Promise<void> {
  const request = requestManager.create();

  try {
    const croppedImageBase64 = await captureAndCropScreenshot(payload.tabId, payload.region);

    sendResponse({
      success: true,
      data: { imageBase64: croppedImageBase64 },
      requestId: request.id,
    });
  } catch (error) {
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to capture screenshot',
      requestId: request.id,
    });
  } finally {
    requestManager.complete(request.id);
  }
}

/**
 * Handle screenshot text extraction using multimodal LLM
 * Uses agent architecture with goal handlers for complex images
 * Requirements: 1.1, 1.5, 6.1, 6.2, 6.3, 6.4
 */
async function handleExtractScreenshot(
  payload: ExtractScreenshotPayload,
  sendResponse: (response: ExtensionResponse) => void,
  tabId?: number
): Promise<void> {
  const settings = await getSettings();
  if (!settings?.llmConfig?.apiKey) {
    sendResponse({
      success: false,
      error: 'LLM API key not configured. Please add your API key in settings.',
      requestId: '',
    });
    return;
  }

  const request = requestManager.create();

  sendResponse({
    success: true,
    data: { requestId: request.id, status: 'started' },
    requestId: request.id,
  });

  sendStreamingMessage(
    {
      type: 'streaming_start',
      requestId: request.id,
    },
    tabId
  );

  try {
    // Use the new goal handler for screenshot analysis
    // Always send agent status updates for real-time UI feedback
    const result = await handleScreenshotGoal(
      {
        imageBase64: payload.imageBase64,
        analysisType: 'general',
      },
      settings.llmConfig,
      (status) => {
        // Always send agent status updates for real-time UI feedback
        sendAgentStatusMessage({
          type: 'agent_status_update',
          sessionId: request.id,
          phase: status.phase,
          stepNumber: status.stepNumber,
          maxSteps: status.maxSteps,
          tokenUsage: status.tokenUsage,
          currentTool: status.currentTool,
        });
      },
      (chunk) => {
        sendStreamingMessage(
          {
            type: 'streaming_chunk',
            requestId: request.id,
            chunk,
          },
          tabId
        );
      },
      request.controller.signal
    );

    sendStreamingMessage(
      {
        type: 'streaming_end',
        requestId: request.id,
        content: result.response,
      },
      tabId
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return;
    }

    sendStreamingMessage(
      {
        type: 'streaming_error',
        requestId: request.id,
        error: error instanceof Error ? error.message : 'Failed to extract text from screenshot',
      },
      tabId
    );
  } finally {
    requestManager.complete(request.id);
  }
}

/**
 * Handle note card generation
 * Uses Agent goal handler for intelligent AI summary, then offscreen document for Canvas
 * Requirements: 7.1, 7.2, 7.3
 */
async function handleGenerateNoteCard(
  payload: NoteCardPayload,
  sendResponse: (response: ExtensionResponse) => void,
  tabId?: number
): Promise<void> {
  const settings = await getSettings();
  const request = requestManager.create();

  // Send initial status via message (not sendResponse - can only call once)
  sendAgentStatusMessage(
    {
      type: 'agent_status_update',
      sessionId: request.id,
      phase: 'thinking',
      stepNumber: 0,
      maxSteps: 3,
      tokenUsage: { input: 0, output: 0 },
    },
    tabId
  );

  try {
    // Use Agent goal handler to generate intelligent AI summary
    let aiSummary = '';
    if (settings?.llmConfig?.apiKey) {
      try {
        const result = await handleNoteCardGoal(
          {
            imageBase64: payload.imageBase64,
            extractedText: payload.extractedText,
            pageUrl: payload.pageUrl,
            pageTitle: payload.pageTitle,
          },
          settings.llmConfig,
          (status) => {
            // Send agent status updates for real-time UI feedback
            sendAgentStatusMessage(
              {
                type: 'agent_status_update',
                sessionId: request.id,
                phase: status.phase,
                stepNumber: status.stepNumber,
                maxSteps: status.maxSteps,
                tokenUsage: status.tokenUsage,
                currentTool: status.currentTool,
              },
              tabId
            );
          },
          undefined, // No streaming for note card yet
          request.controller.signal
        );
        aiSummary = result.response;
      } catch {
        // If AI summary generation fails, continue without it
      }
    }

    // Prepare note card data
    const noteCardData: NoteCardData = {
      screenshot: payload.imageBase64,
      title: payload.pageTitle,
      favicon: payload.favicon,
      aiSummary,
      sourceUrl: payload.pageUrl,
    };

    // Ensure offscreen document exists for Canvas operations
    await ensureOffscreenDocument();

    // Send to offscreen document for note card generation
    const response = await chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'generate_note_card',
      data: noteCardData,
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to generate note card');
    }

    // Send completion status
    sendAgentStatusMessage(
      {
        type: 'agent_complete',
        sessionId: request.id,
        phase: 'idle',
        stepNumber: 3,
        maxSteps: 3,
        tokenUsage: { input: 0, output: 0 },
        result: 'Note card generated successfully',
      },
      tabId
    );

    // Send final response with note card data
    sendResponse({
      success: true,
      data: {
        imageDataUrl: response.imageDataUrl,
        width: response.width,
        height: response.height,
      },
      requestId: request.id,
    });
  } catch (error) {
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate note card',
      requestId: request.id,
    });
  } finally {
    requestManager.complete(request.id);
  }
}

// ============================================================================
// Agent Request Handlers
// Requirements: 10.2, 1.6
// ============================================================================

// Graceful degradation configuration
// Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
const DEGRADATION_CONFIG = {
  llmTimeoutMs: 30000, // 30 seconds
  llmRetryAttempts: 2,
  searchRetryAttempts: 1,
  simplifiedContextTokens: 4000, // Reduced context for retry
};

/**
 * Detect error type for graceful degradation
 */
function detectDegradationReason(error: Error): {
  isTimeout: boolean;
  isSearchFailure: boolean;
  isRateLimit: boolean;
  isNetworkError: boolean;
} {
  const message = error.message.toLowerCase();
  return {
    isTimeout: message.includes('timeout') || message.includes('timed out'),
    isSearchFailure:
      message.includes('search') || message.includes('serpapi') || message.includes('google'),
    isRateLimit: message.includes('rate limit') || message.includes('429'),
    isNetworkError:
      message.includes('network') || message.includes('fetch') || message.includes('connection'),
  };
}

/**
 * Handle agent execution request with graceful degradation
 * Requirements: 1.1, 1.6, 10.1, 10.2, 9.1, 9.2, 9.3, 9.4, 9.5
 */
async function handleAgentExecute(
  payload: AgentExecutePayload,
  sendResponse: (response: ExtensionResponse) => void,
  tabId?: number
): Promise<void> {
  const settings = await getSettings();
  if (!settings?.llmConfig?.apiKey) {
    sendResponse({
      success: false,
      error: 'LLM API key not configured. Please add your API key in settings.',
      requestId: '',
    });
    return;
  }

  // Create or restore session
  let state: AgentState;
  if (payload.sessionId) {
    const existingState = await loadState(payload.sessionId);
    if (existingState) {
      state = existingState;
    } else {
      state = createSession(DEFAULT_AGENT_CONFIG.tokenBudget);
    }
  } else {
    state = createSession(DEFAULT_AGENT_CONFIG.tokenBudget);
  }

  const controller = new AbortController();
  activeAgentSessions.set(state.sessionId, { state, controller });

  sendResponse({
    success: true,
    data: { sessionId: state.sessionId, status: 'started' },
    requestId: state.sessionId,
  });

  // Track degraded mode state
  let isDegradedMode = false;
  let degradedReason: string | undefined;
  let retryAttempt = 0;

  // Send initial status
  sendAgentStatusMessage(
    {
      type: 'agent_status_update',
      sessionId: state.sessionId,
      phase: 'thinking',
      stepNumber: 0,
      maxSteps: DEFAULT_AGENT_CONFIG.maxSteps,
      tokenUsage: { input: 0, output: 0 },
    },
    tabId
  );

  // Helper to run agent with timeout
  async function runWithTimeout(
    goal: string,
    context: ReturnType<typeof createContext>,
    memory: ReturnType<typeof createEpisodicMemory>,
    agentConfig: ReturnType<typeof createAgentConfig>,
    onStatus: (status: AgentStatus) => void,
    signal: AbortSignal,
    timeoutMs: number
  ) {
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

    // Create combined signal
    const combinedSignal = signal.aborted ? signal : timeoutController.signal;

    try {
      const result = await runAgentLoop(
        goal,
        context,
        memory,
        agentConfig,
        onStatus,
        undefined,
        combinedSignal
      );
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  try {
    // Create agent config
    let agentConfig = createAgentConfig(settings.llmConfig, {
      maxSteps: DEFAULT_AGENT_CONFIG.maxSteps,
      maxRetries: DEFAULT_AGENT_CONFIG.maxRetries,
      tokenBudget: DEFAULT_AGENT_CONFIG.tokenBudget,
    });

    // Initialize context if needed
    let context =
      state.context.grounding.currentGoal === ''
        ? createContext(payload.goal, 128000)
        : state.context;

    // Initialize memory if needed
    const memory =
      state.memory.reflections.length === 0 ? createEpisodicMemory(state.sessionId) : state.memory;

    // Status callback for UI updates
    const onStatus = (status: AgentStatus) => {
      sendAgentStatusMessage(
        {
          type: 'agent_status_update',
          sessionId: state.sessionId,
          phase: status.phase,
          stepNumber: status.stepNumber,
          maxSteps: status.maxSteps,
          tokenUsage: status.tokenUsage,
          currentTool: status.currentTool,
          degradedMode: isDegradedMode,
          degradedReason,
        },
        tabId
      );

      // Persist state on each status update
      const currentSession = activeAgentSessions.get(state.sessionId);
      if (currentSession) {
        currentSession.state = {
          ...currentSession.state,
          tokenUsage: {
            ...currentSession.state.tokenUsage,
            currentOperation: status.tokenUsage,
          },
          lastUpdated: Date.now(),
        };
        saveState(currentSession.state).catch(console.error);
      }
    };

    // Run the agent loop with retry logic for graceful degradation
    let result: Awaited<ReturnType<typeof runAgentLoop>> | null = null;
    let lastError: Error | null = null;

    while (retryAttempt <= DEGRADATION_CONFIG.llmRetryAttempts && !result) {
      try {
        result = await runWithTimeout(
          payload.goal,
          context,
          memory,
          agentConfig,
          onStatus,
          controller.signal,
          DEGRADATION_CONFIG.llmTimeoutMs
        );
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const degradation = detectDegradationReason(lastError);

        // Requirements: 9.2 - Retry with shorter context on timeout
        if (degradation.isTimeout && retryAttempt < DEGRADATION_CONFIG.llmRetryAttempts) {
          retryAttempt++;
          isDegradedMode = true;
          degradedReason = 'LLM timeout - retrying with simplified context';

          // Reduce context for retry
          context = createContext(payload.goal, DEGRADATION_CONFIG.simplifiedContextTokens);

          // Reduce max steps for faster completion
          agentConfig = createAgentConfig(settings.llmConfig, {
            maxSteps: Math.max(2, DEFAULT_AGENT_CONFIG.maxSteps - 2),
            maxRetries: 1,
            tokenBudget: DEFAULT_AGENT_CONFIG.tokenBudget,
          });

          sendAgentStatusMessage(
            {
              type: 'agent_status_update',
              sessionId: state.sessionId,
              phase: 'thinking',
              stepNumber: 0,
              maxSteps: agentConfig.maxSteps,
              tokenUsage: { input: 0, output: 0 },
              degradedMode: true,
              degradedReason,
            },
            tabId
          );

          continue;
        }

        // Requirements: 9.1 - Fall back to LLM-only on search failure
        if (degradation.isSearchFailure && retryAttempt < DEGRADATION_CONFIG.searchRetryAttempts) {
          retryAttempt++;
          isDegradedMode = true;
          degradedReason = 'Search unavailable - using LLM knowledge only';

          sendAgentStatusMessage(
            {
              type: 'agent_status_update',
              sessionId: state.sessionId,
              phase: 'thinking',
              stepNumber: 0,
              maxSteps: agentConfig.maxSteps,
              tokenUsage: { input: 0, output: 0 },
              degradedMode: true,
              degradedReason,
            },
            tabId
          );

          continue;
        }

        // No more retries - throw the error
        throw lastError;
      }
    }

    if (!result) {
      throw lastError || new Error('Agent execution failed after all retries');
    }

    // Update state with results
    const finalState: AgentState = {
      ...state,
      trajectory: result.trajectory,
      context: result.context,
      memory: result.memory,
      tokenUsage: {
        ...state.tokenUsage,
        sessionTotal: {
          input: state.tokenUsage.sessionTotal.input + result.trajectory.totalTokens.input,
          output: state.tokenUsage.sessionTotal.output + result.trajectory.totalTokens.output,
        },
        currentOperation: result.trajectory.totalTokens,
      },
      lastUpdated: Date.now(),
    };

    // Persist final state
    await saveState(finalState);

    // Get final response
    const finalResponse = getFinalResponse(result.trajectory);

    // Send completion message
    // Requirements: 9.4 - Clearly indicate degraded mode
    sendAgentStatusMessage(
      {
        type: 'agent_complete',
        sessionId: state.sessionId,
        phase: 'idle',
        stepNumber: result.trajectory.steps.length,
        maxSteps: DEFAULT_AGENT_CONFIG.maxSteps,
        tokenUsage: result.trajectory.totalTokens,
        result: finalResponse,
        degradedMode: isDegradedMode,
        degradedReason: isDegradedMode ? degradedReason : undefined,
      },
      tabId
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      sendAgentStatusMessage(
        {
          type: 'agent_error',
          sessionId: state.sessionId,
          error: 'Agent execution cancelled',
        },
        tabId
      );
      return;
    }

    // Requirements: 9.3 - Display last successful partial result if available
    const currentSession = activeAgentSessions.get(state.sessionId);
    const partialResult = currentSession?.state.trajectory
      ? getFinalResponse(currentSession.state.trajectory)
      : undefined;

    sendAgentStatusMessage(
      {
        type: 'agent_error',
        sessionId: state.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        result: partialResult,
        degradedMode: isDegradedMode,
        degradedReason: degradedReason || 'Operation failed after retries',
      },
      tabId
    );
  } finally {
    activeAgentSessions.delete(state.sessionId);
  }
}

/**
 * Handle agent cancellation request
 * Requirements: 9.2
 */
function handleAgentCancel(
  payload: AgentCancelPayload,
  sendResponse: (response: ExtensionResponse) => void
): void {
  const session = activeAgentSessions.get(payload.sessionId);
  if (session) {
    session.controller.abort();
    activeAgentSessions.delete(payload.sessionId);
    sendResponse({
      success: true,
      data: { cancelled: true },
      requestId: payload.sessionId,
    });
  } else {
    sendResponse({
      success: false,
      error: 'Session not found or already completed',
      requestId: payload.sessionId,
    });
  }
}

/**
 * Handle agent status request
 * Requirements: 1.6
 */
async function handleAgentGetStatus(
  payload: AgentGetStatusPayload,
  sendResponse: (response: ExtensionResponse) => void
): Promise<void> {
  // Check active sessions first
  const activeSession = activeAgentSessions.get(payload.sessionId);
  if (activeSession) {
    sendResponse({
      success: true,
      data: {
        sessionId: payload.sessionId,
        isRunning: true,
        trajectory: activeSession.state.trajectory,
        tokenUsage: activeSession.state.tokenUsage,
      },
      requestId: payload.sessionId,
    });
    return;
  }

  // Check persisted state
  const state = await loadState(payload.sessionId);
  if (state) {
    sendResponse({
      success: true,
      data: {
        sessionId: payload.sessionId,
        isRunning: false,
        trajectory: state.trajectory,
        tokenUsage: state.tokenUsage,
      },
      requestId: payload.sessionId,
    });
  } else {
    sendResponse({
      success: false,
      error: 'Session not found',
      requestId: payload.sessionId,
    });
  }
}

// ============================================================================
// Embedding Handlers
// ============================================================================

const OFFSCREEN_URL = 'src/offscreen/offscreen.html';

async function ensureEmbeddingOffscreen(): Promise<void> {
  console.log('[Embedding] Checking for existing offscreen document...');
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  });

  console.log(
    '[Embedding] Existing contexts:',
    existingContexts.length,
    'URL:',
    chrome.runtime.getURL(OFFSCREEN_URL)
  );

  if (existingContexts.length > 0) {
    console.log('[Embedding] Offscreen document already exists');
    return;
  }

  console.log('[Embedding] Creating offscreen document...');
  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: 'Compute text embeddings using WebGPU',
    });
    console.log('[Embedding] Offscreen document created successfully');
  } catch (error) {
    console.error('[Embedding] Failed to create offscreen document:', error);
    throw error;
  }
}

async function sendToOffscreen(message: unknown): Promise<unknown> {
  console.log('[Embedding] sendToOffscreen called with:', message);

  // Get the offscreen document's client ID to send targeted message
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  });

  console.log('[Embedding] Found offscreen contexts:', contexts.length);

  if (contexts.length === 0) {
    throw new Error('Offscreen document not found');
  }

  // Use a unique target identifier to route message to offscreen
  const fullMessage = {
    target: 'offscreen',
    ...(message as object),
  };
  console.log('[Embedding] Sending message to offscreen:', fullMessage);

  const response = await chrome.runtime.sendMessage(fullMessage);
  console.log('[Embedding] Received response from offscreen:', response);
  return response;
}

async function handlePreloadEmbedding(
  sendResponse: (response: ExtensionResponse) => void
): Promise<void> {
  console.log('[Embedding] handlePreloadEmbedding called');
  try {
    await ensureEmbeddingOffscreen();
    console.log('[Embedding] Offscreen document ensured, sending preload message...');
    const response = await sendToOffscreen({ action: 'preload_embedding' });
    console.log('[Embedding] Preload response:', response);
    sendResponse({ success: true, data: response, requestId: '' });
  } catch (error) {
    console.error('[Embedding] handlePreloadEmbedding error:', error);
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to preload embedding',
      requestId: '',
    });
  }
}

async function handleComputeEmbedding(
  payload: { texts: string[]; requestId: string },
  sendResponse: (response: ExtensionResponse) => void
): Promise<void> {
  try {
    await ensureEmbeddingOffscreen();
    const response = await sendToOffscreen({
      action: 'compute_embedding',
      texts: payload.texts,
      requestId: payload.requestId,
    });
    sendResponse({ success: true, data: response, requestId: payload.requestId });
  } catch (error) {
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to compute embedding',
      requestId: payload.requestId,
    });
  }
}

// ============================================================================
// Keyboard Shortcut Handler
// Requirements: 5.1 - Ctrl+Shift+X triggers screenshot overlay
// ============================================================================

/**
 * Check if a URL supports content script injection
 */
function isContentScriptSupported(url: string | undefined): boolean {
  if (!url) return false;
  // Content scripts cannot run on chrome://, edge://, about:, or extension pages
  return (
    !url.startsWith('chrome://') &&
    !url.startsWith('chrome-extension://') &&
    !url.startsWith('edge://') &&
    !url.startsWith('about:') &&
    !url.startsWith('devtools://')
  );
}

chrome.commands.onCommand.addListener(async (command) => {
  console.log('Command received:', command);

  if (command === 'take-screenshot') {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      console.log('Active tab:', tab?.id, tab?.url);

      if (!tab?.id) {
        console.error('No active tab found');
        return;
      }

      if (!isContentScriptSupported(tab.url)) {
        console.warn('Content script not supported on this page:', tab.url);
        // Could show a notification to user here
        return;
      }

      // Send message to content script to show screenshot overlay
      chrome.tabs.sendMessage(tab.id, { action: 'activate_screenshot' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error(
            'Failed to send message to content script:',
            chrome.runtime.lastError.message
          );
          // Content script might not be loaded, try injecting it
        } else {
          console.log('Screenshot activation response:', response);
        }
      });
    } catch (error) {
      console.error('Failed to activate screenshot:', error);
    }
  }
});

// Check for shortcut conflicts on install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    chrome.commands.getAll((commands) => {
      for (const { name, shortcut } of commands) {
        if (shortcut === '') {
          console.warn(`Command "${name}" has no shortcut assigned (possible conflict)`);
        } else {
          console.log(`Command "${name}" registered with shortcut: ${shortcut}`);
        }
      }
    });
  }
});

// ============================================================================
// Message Router
// ============================================================================

/**
 * Main message handler with type-safe routing
 * Uses discriminated unions for compile-time type safety
 * Requirements: 1.1, 2.2, 3.2, 4.3, 10.2, 1.6
 */
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage & { target?: string }, sender, sendResponse) => {
    console.log('[Background] Received message:', message.action, 'target:', message.target);

    // Ignore messages targeted to offscreen document
    if (message.target === 'offscreen') {
      console.log('[Background] Ignoring message targeted to offscreen');
      return false;
    }

    const tabId = sender.tab?.id;

    switch (message.action) {
      case 'summarize_page':
        handleSummarize(message.payload, sendResponse, tabId);
        return true; // Keep channel open for async response

      case 'agent_deep_dive':
        handleDeepDive(message.payload, sendResponse, tabId);
        return true;

      case 'explain_text':
        handleExplain(message.payload, sendResponse, tabId);
        return true;

      case 'search_enhance':
        handleSearchEnhance(message.payload, sendResponse, tabId);
        return true;

      case 'cancel_request':
        handleCancelRequest(message.payload, sendResponse);
        return false; // Sync response

      case 'capture_screenshot':
        handleCaptureScreenshot(message.payload, sendResponse);
        return true; // Keep channel open for async response

      case 'extract_screenshot':
        handleExtractScreenshot(message.payload, sendResponse, tabId);
        return true; // Keep channel open for async response

      case 'generate_note_card':
        handleGenerateNoteCard(message.payload, sendResponse, tabId);
        return true; // Keep channel open for async response

      case 'agent_execute':
        handleAgentExecute(message.payload, sendResponse, tabId);
        return true; // Keep channel open for async response

      case 'agent_cancel':
        handleAgentCancel(message.payload, sendResponse);
        return false; // Sync response

      case 'agent_get_status':
        handleAgentGetStatus(message.payload, sendResponse);
        return true; // Keep channel open for async response

      case 'trigger_summary_panel':
        // Handled by content script, but background sees it due to shared type
        return false;

      case 'preload_embedding':
        handlePreloadEmbedding(sendResponse);
        return true;

      case 'compute_embedding':
        handleComputeEmbedding(message.payload, sendResponse);
        return true;

      default: {
        const exhaustiveCheck: never = message;
        void exhaustiveCheck;
        sendResponse({
          success: false,
          error: 'Unknown action',
          requestId: '',
        });
        return false;
      }
    }
  }
);

// Expose test function for debugging in Service Worker console
// Usage: testEmbedding()
(globalThis as unknown as { testEmbedding: () => Promise<void> }).testEmbedding = async () => {
  console.log('[Test] Starting embedding test...');
  try {
    await ensureEmbeddingOffscreen();
    console.log('[Test] Offscreen document ready, sending preload message...');
    const response = await sendToOffscreen({ action: 'preload_embedding' });
    console.log('[Test] Preload response:', response);
  } catch (error) {
    console.error('[Test] Error:', error);
  }
};

export {};
