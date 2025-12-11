// Background service worker for KnowledgeLens
// Handles API requests, message routing, and cross-origin communication
// Requirements: 1.1, 1.3, 1.4, 2.2, 3.2, 3.3, 4.2, 4.3, 4.4, 9.2

import type {
  ExtensionMessage,
  ExtensionResponse,
  StreamingMessage,
  SummarizePayload,
  ExplainPayload,
  SearchEnhancePayload,
  CancelRequestPayload,
  SearchResult,
} from '../types';
import { callLLMStreaming, searchWeb, extractKeywords } from '../lib/api';
import { loadSettings } from '../lib/storage';
import * as requestManager from '../lib/request-manager';

console.log('KnowledgeLens background service worker loaded');

// System prompts for different operations
const PROMPTS = {
  summarize: `You are a helpful assistant that summarizes web page content.
Provide a clear, concise summary that captures the main points.
Use bullet points for key takeaways when appropriate.
Keep the summary focused and informative.`,

  explain: `You are a knowledgeable assistant that explains text in context.
The user has selected some text from a web page and wants to understand it better.
Provide a clear, helpful explanation considering the surrounding context.
If the text contains technical terms, explain them in accessible language.`,

  searchEnhanced: `You are a research assistant that provides comprehensive explanations.
The user has selected some text and wants a detailed explanation enhanced with web search results.
Use the provided search results to give accurate, up-to-date information.
Cite sources when referencing specific information from search results.
Format your response clearly with the explanation followed by relevant sources.`,
};

/**
 * Send streaming message to a specific tab or all extension contexts
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
 * Handle page summarization request
 * Requirements: 1.3, 1.4
 */
async function handleSummarize(
  payload: SummarizePayload,
  sendResponse: (response: ExtensionResponse) => void
): Promise<void> {
  const settings = await loadSettings();
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

  // Send streaming start
  sendStreamingMessage({
    type: 'streaming_start',
    requestId: request.id,
  });

  const prompt = `${PROMPTS.summarize}

Page URL: ${payload.pageUrl}

Content to summarize:
${payload.content}

Please provide a comprehensive summary of this content.`;

  try {
    let fullContent = '';
    
    await callLLMStreaming(
      prompt,
      settings.llmConfig,
      (chunk) => {
        fullContent += chunk;
        sendStreamingMessage({
          type: 'streaming_chunk',
          requestId: request.id,
          chunk,
        });
      },
      request.controller.signal
    );

    sendStreamingMessage({
      type: 'streaming_end',
      requestId: request.id,
      content: fullContent,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      // Request was cancelled by user, no error message needed
      return;
    }
    
    sendStreamingMessage({
      type: 'streaming_error',
      requestId: request.id,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  } finally {
    requestManager.complete(request.id);
  }
}

/**
 * Handle contextual text explanation request
 * Requirements: 3.2, 3.3
 */
async function handleExplain(
  payload: ExplainPayload,
  sendResponse: (response: ExtensionResponse) => void
): Promise<void> {
  const settings = await loadSettings();
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

  sendStreamingMessage({
    type: 'streaming_start',
    requestId: request.id,
  });

  const prompt = `${PROMPTS.explain}

Selected text:
"${payload.text}"

Surrounding context:
${payload.context}

Please explain the selected text, considering its context.`;

  try {
    let fullContent = '';
    
    await callLLMStreaming(
      prompt,
      settings.llmConfig,
      (chunk) => {
        fullContent += chunk;
        sendStreamingMessage({
          type: 'streaming_chunk',
          requestId: request.id,
          chunk,
        });
      },
      request.controller.signal
    );

    sendStreamingMessage({
      type: 'streaming_end',
      requestId: request.id,
      content: fullContent,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return;
    }
    
    sendStreamingMessage({
      type: 'streaming_error',
      requestId: request.id,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  } finally {
    requestManager.complete(request.id);
  }
}

/**
 * Format search results for LLM prompt
 */
function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return 'No search results available.';
  }

  return results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\nSource: ${r.url}`)
    .join('\n\n');
}

/**
 * Handle search-enhanced explanation request
 * Requirements: 4.2, 4.3, 4.4
 */
async function handleSearchEnhance(
  payload: SearchEnhancePayload,
  sendResponse: (response: ExtensionResponse) => void
): Promise<void> {
  const settings = await loadSettings();
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

  sendStreamingMessage({
    type: 'streaming_start',
    requestId: request.id,
  });

  try {
    // Extract keywords and search (Requirement 4.1, 4.2)
    let searchResults: SearchResult[] = [];
    const keywords = extractKeywords(payload.text);
    
    if (settings.searchConfig?.apiKey && keywords.length > 0) {
      try {
        const query = keywords.join(' ');
        searchResults = await searchWeb(
          query,
          settings.searchConfig,
          request.controller.signal
        );
      } catch (searchError) {
        // Requirement 4.5: Fall back to explanation without search results
        console.warn('Search failed, falling back to contextual explanation:', searchError);
      }
    }

    // Build prompt with search results (Requirement 4.3)
    const searchSection = searchResults.length > 0
      ? `\n\nWeb search results:\n${formatSearchResults(searchResults)}`
      : '';

    const prompt = `${PROMPTS.searchEnhanced}

Selected text:
"${payload.text}"

Surrounding context:
${payload.context}${searchSection}

Please provide a comprehensive explanation of the selected text, incorporating relevant information from the search results if available. Include source citations where appropriate.`;

    let fullContent = '';
    
    await callLLMStreaming(
      prompt,
      settings.llmConfig,
      (chunk) => {
        fullContent += chunk;
        sendStreamingMessage({
          type: 'streaming_chunk',
          requestId: request.id,
          chunk,
        });
      },
      request.controller.signal
    );

    // Requirement 4.4: Display response with source citations
    sendStreamingMessage({
      type: 'streaming_end',
      requestId: request.id,
      content: fullContent,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return;
    }
    
    sendStreamingMessage({
      type: 'streaming_error',
      requestId: request.id,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
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
 * Main message handler with type-safe routing
 * Uses discriminated unions for compile-time type safety
 * Requirements: 1.1, 2.2, 3.2, 4.3
 */
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    // Type-safe message routing using discriminated union
    switch (message.action) {
      case 'summarize_page':
        handleSummarize(message.payload, sendResponse);
        return true; // Keep channel open for async response

      case 'explain_text':
        handleExplain(message.payload, sendResponse);
        return true;

      case 'search_enhance':
        handleSearchEnhance(message.payload, sendResponse);
        return true;

      case 'cancel_request':
        handleCancelRequest(message.payload, sendResponse);
        return false; // Sync response

      case 'capture_screenshot':
      case 'extract_screenshot':
      case 'generate_note_card':
        // These will be implemented in task 8 (screenshot capture pipeline)
        sendResponse({
          success: false,
          error: 'Feature not yet implemented',
          requestId: '',
        });
        return false;

      default: {
        // TypeScript exhaustiveness check - ensures all cases are handled
        const exhaustiveCheck: never = message;
        void exhaustiveCheck;
        sendResponse({
          success: false,
          error: `Unknown action`,
          requestId: '',
        });
        return false;
      }
    }
  }
);

export {};
