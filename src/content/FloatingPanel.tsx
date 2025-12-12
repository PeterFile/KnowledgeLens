// Draggable floating panel for displaying AI responses with Markdown support
// Replaces Sidebar component with a movable, resizable panel

import { useEffect, useState, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { StreamingMessage } from '../types';

type PanelStatus = 'loading' | 'streaming' | 'done' | 'error';

interface FloatingPanelProps {
  selectedText: string;
  context: string;
  mode: 'explain' | 'search';
  onClose: () => void;
}

// Close icon
const CloseIcon = () => (
  <svg
    width="18"
    height="18"
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
    width="14"
    height="14"
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
    width="14"
    height="14"
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

// Drag handle icon
const DragIcon = () => (
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
    <circle cx="9" cy="5" r="1" fill="currentColor" />
    <circle cx="9" cy="12" r="1" fill="currentColor" />
    <circle cx="9" cy="19" r="1" fill="currentColor" />
    <circle cx="15" cy="5" r="1" fill="currentColor" />
    <circle cx="15" cy="12" r="1" fill="currentColor" />
    <circle cx="15" cy="19" r="1" fill="currentColor" />
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

// Custom hook for dragging
function useDrag(initialPos: { x: number; y: number }) {
  const [position, setPosition] = useState(initialPos);
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setIsDragging(true);
      dragOffset.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
    },
    [position]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newX = Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragOffset.current.x));
      const newY = Math.max(0, Math.min(window.innerHeight - 50, e.clientY - dragOffset.current.y));
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => setIsDragging(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return { position, isDragging, handleMouseDown };
}

export function FloatingPanel({ selectedText, context, mode, onClose }: FloatingPanelProps) {
  const [status, setStatus] = useState<PanelStatus>('loading');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Initial position: center-right of viewport
  const { position, isDragging, handleMouseDown } = useDrag({
    x: Math.max(20, window.innerWidth - 420),
    y: Math.max(20, (window.innerHeight - 400) / 2),
  });

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
          setStatus('done');
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
        chrome.runtime.sendMessage({ action: 'cancel_request', payload: { requestId } });
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
      /* Clipboard API might fail */
    }
  };

  const title = mode === 'search' ? 'Search & Explain' : 'AI Explanation';

  return (
    <div
      data-knowledgelens="floating-panel"
      className="fixed bg-white rounded-xl shadow-2xl flex flex-col font-sans border border-gray-200 overflow-hidden"
      style={{
        left: position.x,
        top: position.y,
        width: collapsed ? 280 : 380,
        maxWidth: 'calc(100vw - 40px)',
        maxHeight: collapsed ? 'auto' : 'min(500px, calc(100vh - 40px))',
        zIndex: 999998,
        cursor: isDragging ? 'grabbing' : 'auto',
        userSelect: isDragging ? 'none' : 'auto',
      }}
    >
      {/* Header - draggable */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white cursor-grab active:cursor-grabbing select-none"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <DragIcon />
          <span className="text-sm font-medium">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded hover:bg-white/20 transition border-0 bg-transparent text-white cursor-pointer"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              {collapsed ? <path d="m6 9 6 6 6-6" /> : <path d="m18 15-6-6-6 6" />}
            </svg>
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-white/20 transition border-0 bg-transparent text-white cursor-pointer"
            title="Close"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Selected text preview */}
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
            <p className="text-xs text-gray-500 mb-0.5">Selected:</p>
            <p className="text-xs text-gray-700 line-clamp-2">{selectedText}</p>
          </div>

          {/* Content area with Markdown */}
          <div className="flex-1 overflow-y-auto min-h-0 p-3">
            {status === 'loading' && <SkeletonLoader />}

            {(status === 'streaming' || status === 'done') && (
              <div className="prose prose-sm max-w-none text-gray-700 prose-headings:text-gray-800 prose-a:text-blue-600 prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-gray-900 prose-pre:text-gray-100">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                {status === 'streaming' && (
                  <span className="inline-block w-2 h-4 bg-blue-500 ml-1 animate-pulse align-middle" />
                )}
              </div>
            )}

            {status === 'error' && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
          </div>

          {/* Action bar */}
          <div className="px-3 py-2 border-t border-gray-100 flex items-center gap-2 bg-gray-50">
            <button
              onClick={sendRequest}
              disabled={status === 'loading' || status === 'streaming'}
              className="px-2.5 py-1.5 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-medium flex items-center gap-1.5 cursor-pointer transition border-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RetryIcon />
              <span>Retry</span>
            </button>
            <button
              onClick={handleCopy}
              disabled={!content}
              className="px-2.5 py-1.5 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-medium flex items-center gap-1.5 cursor-pointer transition border-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CopyIcon />
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
