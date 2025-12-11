// Sidebar component for displaying AI responses
// Requirements: 2.2, 2.4, 3.3, 4.4 - Expand from bubble, display streaming responses

import { useEffect, useState, useCallback } from 'react';
import type { StreamingMessage } from '../types';

type SidebarMode = 'explain' | 'search' | 'loading' | 'streaming' | 'error';

interface SidebarProps {
  selectedText: string;
  context: string;
  mode: 'explain' | 'search';
  onClose: () => void;
}

// Close icon
const CloseIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

// Copy icon
const CopyIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);

// Retry icon
const RetryIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
    <path d="M16 16h5v5" />
  </svg>
);

// Skeleton loader
const SkeletonLoader = () => (
  <div className="p-4 animate-pulse">
    <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
    <div className="h-4 bg-gray-200 rounded w-full mb-3" />
    <div className="h-4 bg-gray-200 rounded w-5/6 mb-3" />
    <div className="h-4 bg-gray-200 rounded w-2/3" />
  </div>
);

export function Sidebar({ selectedText, context, mode, onClose }: SidebarProps) {
  const [status, setStatus] = useState<SidebarMode>('loading');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Send request to background
  const sendRequest = useCallback(() => {
    setStatus('loading');
    setContent('');
    setError(null);

    const action = mode === 'search' ? 'search_enhance' : 'explain_text';
    const payload = { text: selectedText, context };

    chrome.runtime.sendMessage({ action, payload }, (response) => {
      if (response?.success && response.data?.requestId) {
        setRequestId(response.data.requestId);
      } else if (response?.error) {
        setError(response.error);
        setStatus('error');
      }
    });
  }, [mode, selectedText, context]);

  // Handle streaming messages
  useEffect(() => {
    const handleMessage = (message: StreamingMessage) => {
      if (!requestId || message.requestId !== requestId) return;

      switch (message.type) {
        case 'streaming_start':
          setStatus('streaming');
          setContent('');
          break;
        case 'streaming_chunk':
          if (message.chunk) {
            setContent((prev) => prev + message.chunk);
          }
          break;
        case 'streaming_end':
          setStatus('explain');
          break;
        case 'streaming_error':
          setError(message.error || 'An error occurred');
          setStatus('error');
          break;
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [requestId]);

  // Initial request
  useEffect(() => {
    sendRequest();
  }, [sendRequest]);

  // Cancel request on unmount
  useEffect(() => {
    return () => {
      if (requestId) {
        chrome.runtime.sendMessage({
          action: 'cancel_request',
          payload: { requestId },
        });
      }
    };
  }, [requestId]);

  const handleCopy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API might fail in some contexts
    }
  };

  const handleRetry = () => {
    sendRequest();
  };

  const title = mode === 'search' ? 'Search & Explain' : 'AI Explanation';

  return (
    <div
      data-knowledgelens="sidebar"
      className="fixed right-0 top-0 h-full w-96 bg-white shadow-xl z-[999998] flex flex-col font-sans"
      style={{ maxWidth: '100vw' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
        <button
          onClick={onClose}
          className="p-2 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 cursor-pointer transition border-0 bg-white"
          title="Close"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Selected text preview */}
      <div className="p-3 bg-gray-50 border-b border-gray-200">
        <p className="text-xs text-gray-500 mb-1">Selected text:</p>
        <p className="text-sm text-gray-700 truncate">{selectedText}</p>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {status === 'loading' && <SkeletonLoader />}

        {(status === 'streaming' || status === 'explain' || status === 'search') && (
          <div className="p-4">
            <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap break-words">
              {content}
              {status === 'streaming' && (
                <span className="inline-block w-2 h-4 bg-blue-500 ml-1 animate-pulse" />
              )}
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="p-4">
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="p-3 border-t border-gray-200 flex items-center gap-2">
        <button
          onClick={handleRetry}
          disabled={status === 'loading' || status === 'streaming'}
          className="px-3 py-2 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium flex items-center gap-2 cursor-pointer transition border-0 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RetryIcon />
          <span>Retry</span>
        </button>
        <button
          onClick={handleCopy}
          disabled={!content}
          className="px-3 py-2 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium flex items-center gap-2 cursor-pointer transition border-0 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <CopyIcon />
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>
    </div>
  );
}
